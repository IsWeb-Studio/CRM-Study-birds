import test from 'node:test';
import assert from 'node:assert/strict';
import { observeWebsiteRows, linkWebsiteRecord, createWebsiteWorkflow, mountWebsiteEmail, startWebsitePolling, pollingConfiguration } from './website.workflow.js';
const id = digit => digit.repeat(24);
const db = () => ({ companies: [{ id: 'c1' }, { id: 'c2' }], users: [{ id: 'u1', companyId: 'c1', name: 'Advisor' }, { id: 'u2', companyId: 'c2' }], students: [{ id: 'independent', companyId: 'c1', name: 'Same Name' }], applications: [], invoices: [], leads: [], websiteSyncSettings: { c1: { recipients: ['u1', 'u2'], autoAssign: true } } });
const row = value => ({ _id: id(value), student: { _id: id('f'), name: 'Same Name' }, program: { title: 'Medicine' }, university: { name: 'University' }, status: 'submitted' });

test('first poll is baseline; new requests notify once and only same-company staff', () => {
  const state = db();
  assert.equal(observeWebsiteRows(state, 'c1', 'applications', [row('a')]).initialBaseline, true);
  assert.equal(state.userNotifications.length, 0);
  observeWebsiteRows(state, 'c1', 'applications', [row('a'), row('b')]);
  assert.equal(state.userNotifications.length, 1);
  assert.equal(state.userNotifications[0].userId, 'u1');
  assert.equal(state.websiteInbox[1].ownerId, 'u1');
  observeWebsiteRows(state, 'c1', 'applications', [row('b')]);
  assert.equal(state.userNotifications.length, 1);
  assert.equal(state.websiteInbox.length, 2, 'Limited lists never delete old records');
});
test('linking uses source ids, never merges students by matching name; repeated links are idempotent', () => {
  const state = db();
  const original = JSON.stringify(state.students[0]);
  const first = linkWebsiteRecord(state, 'c1', 'applications', row('a'), 'u1');
  const again = linkWebsiteRecord(state, 'c1', 'applications', row('a'), 'u1');
  assert.equal(first.localId, again.localId);
  assert.equal(again.alreadyLinked, true);
  assert.equal(state.applications.length, 1);
  assert.equal(state.students.length, 2);
  assert.equal(JSON.stringify(state.students[0]), original);
  linkWebsiteRecord(state, 'c1', 'applications', row('b'), 'u1');
  assert.equal(state.students.length, 2, 'Second application reuses same website student');
});
test('poll refreshes linked snapshots without changing independent CRM records', () => {
  const state = db();
  linkWebsiteRecord(state, 'c1', 'applications', row('a'), 'u1');
  observeWebsiteRows(state, 'c1', 'applications', [{ ...row('a'), detailedStatus: 'final-admission' }]);
  assert.equal(state.applications[0].status, 'final-admission');
  assert.equal(state.students[0].id, 'independent');
});
test('paid website invoices are snapshots; no duplicate CRM payments or wallet movements', () => {
  const state = db();
  const invoice = { _id: id('a'), student: row('a').student, amount: 100, status: 'paid', invoiceNumber: 'TEST' };
  linkWebsiteRecord(state, 'c1', 'financials', invoice, 'u1');
  linkWebsiteRecord(state, 'c1', 'financials', invoice, 'u1');
  assert.equal(state.invoices.length, 1);
  assert.equal(state.invoices[0].websiteSource.paid, 100);
  assert.equal(state.invoices[0].balance, 0);
  assert.equal(state.payments, undefined);
  assert.equal(state.walletEntries, undefined);
});
test('cross-company links stay separate', () => {
  const state = db();
  const a = linkWebsiteRecord(state, 'c1', 'applications', row('a'), 'u1');
  const b = linkWebsiteRecord(state, 'c2', 'applications', row('a'), 'u2');
  assert.notEqual(a.localId, b.localId);
  assert.equal(state.applications.length, 2);
});
test('a failed resource does not erase observations or prevent other resources from syncing', async () => {
  const state = db(); state.websiteSyncSettings.c1.resources = ['applications', 'support'];
  const workflow = createWebsiteWorkflow({ client: { resource: async key => { if (key === 'support') throw new Error('Unavailable'); return { rows: [row('a')] }; } }, readDb: async () => state, mutateDb: async fn => fn(state) });
  const result = await workflow.synchronize('c1');
  assert.equal(result[0].ok, true); assert.equal(result[1].ok, false);
  assert.equal(state.websiteInbox.length, 1);
  await assert.rejects(workflow.synchronize('unknown'));
});
test('poller disabled by default', () => { assert.equal(typeof startWebsitePolling({}, {}), 'function'); });
test('configured employee identity matches website assignment before round-robin distribution', () => {
  const state = db();
  state.users.push({ id: 'mapped', companyId: 'c1' });
  state.websiteSyncSettings.c1.identities = { mapped: id('f') };
  observeWebsiteRows(state, 'c1', 'applications', [{ ...row('a'), assignedAdvisor: { _id: id('f') } }]);
  assert.equal(state.websiteInbox[0].ownerId, 'mapped');
});
test('mail receiver rejects unauthenticated messages and deduplicates provider message ids', async () => {
  const state = db(); let route;
  mountWebsiteEmail({ post: (_path, handler) => { route = handler; } }, { mutateDb: async fn => fn(state) }, { STUDY_BIRDS_MAIL_SECRET: 'test', STUDY_BIRDS_COMPANY_ID: 'c1' });
  let error;
  await route({ headers: {}, body: {} }, {}, e => { error = e; });
  assert.equal(error.status, 401); assert.equal(state.websiteContactMail, undefined);
  const request = { headers: { authorization: 'Bearer test' }, body: { messageId: 'message-1', name: 'Student', email: 'test@example.test', message: 'Hello' } };
  const results = [];
  const response = { status: () => response, json: data => results.push(data) };
  await route(request, response, e => { throw e; }); await route(request, response, e => { throw e; });
  assert.equal(state.websiteContactMail.length, 1); assert.equal(results[1].duplicate, true);
});


test('invalid polling company is diagnosed without selecting or moving another company',()=>{
 const state=db(),before=JSON.stringify(state);
 const config=pollingConfiguration(state,'c1',{STUDY_BIRDS_ENABLED:'true',STUDY_BIRDS_SYNC_ENABLED:'true',STUDY_BIRDS_COMPANY_ID:'missing'});
 assert.equal(config.companyExists,false);assert.equal(config.currentCompanyId,'c1');assert.equal(config.configuredCompanyId,'missing');assert.equal(JSON.stringify(state),before);
});
test('polling backs off repeated failures and never overlaps runs',async()=>{
 const pending=[],delays=[],logs=[];let calls=0,fail=true;
 const stop=startWebsitePolling({synchronize:async company=>{assert.equal(company,'c1');calls++;if(fail)throw Object.assign(new Error('Wrong company'),{code:'WEBSITE_COMPANY_NOT_FOUND'});}},
 {STUDY_BIRDS_ENABLED:'true',STUDY_BIRDS_SYNC_ENABLED:'true',STUDY_BIRDS_COMPANY_ID:' c1 ',STUDY_BIRDS_SYNC_INTERVAL_MS:60000},
 {schedule:(fn,delay)=>{pending.push(fn);delays.push(delay);return 1;},cancel:()=>{},log:(...args)=>logs.push(args)});
 assert.deepEqual(delays,[60000]);await pending.shift()();await pending.shift()();
 assert.deepEqual(delays,[60000,120000,240000]);assert.equal(logs.length,1);assert.equal(calls,2);
 fail=false;await pending.shift()();assert.equal(delays.at(-1),60000);
 stop();const count=delays.length;await pending.shift()();assert.equal(delays.length,count);
});
