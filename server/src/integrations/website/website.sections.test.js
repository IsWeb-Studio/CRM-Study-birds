import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { websiteResources, createWebsiteClient, mountWebsiteRoutes } from './website.service.js';
import { websiteSections, websiteResourceRoute } from './website.sections.js';
import { allowAction, allowModule } from '../../auth.js';

const id = 'a'.repeat(24);
const response = data => ({ ok: true, status: 200, json: async () => data });
function routes() {
  const registered = [];
  const app = Object.fromEntries(['get', 'post', 'put'].map(method => [method, (path, ...handlers) => registered.push({ method, path, handlers })]));
  mountWebsiteRoutes(app, { allowModule, allowAction, client: {}, readDb: async () => ({ websiteContactMail: [{ companyId: 'one', message: 'own' }, { companyId: 'two', message: 'other' }] }), mutateDb: async () => {} });
  return registered;
}
async function invoke(route, user, params = {}) {
  let code = 200, body;
  const req = { user, params }, res = { status(n) { code = n; return this; }, json(value) { body = value; } };
  let permitted = false;
  await route.handlers[0](req, res, () => { permitted = true; });
  return { code, body, permitted, req, res };
}
test('every website resource belongs to a CRM section and both apps share the same mapping', async () => {
  for (const resource of Object.keys(websiteResources)) assert.ok(Object.values(websiteSections).some(keys => keys.includes(resource)), resource);
  assert.equal(await readFile(new URL('./website.sections.js', import.meta.url), 'utf8'), await readFile(new URL('../../../../client/src/websiteSections.js', import.meta.url), 'utf8'));
  assert.equal(websiteResourceRoute('applications'), '/admissions');
  assert.equal(websiteResourceRoute('financials'), '/finance');
});
test('finance staff read financials but cannot read admissions or content; custom permission stays scoped', async () => {
  const route = routes().find(row => row.path.endsWith('/requests/:resource'));
  assert.equal((await invoke(route, { role: 'finance' }, { resource: 'financials' })).permitted, true);
  assert.equal((await invoke(route, { role: 'finance' }, { resource: 'applications' })).code, 403);
  assert.equal((await invoke(route, { role: 'finance' }, { resource: 'siteSettings' })).code, 403);
  const custom = { role: 'management', permissionMode: 'custom', permissions: { modules: ['admissions'], actions: [] } };
  assert.equal((await invoke(route, custom, { resource: 'applications' })).permitted, true);
  assert.equal((await invoke(route, custom, { resource: 'financials' })).code, 403);
});
test('writing requires the section and explicit manageWebsite action; it never grants a different section', async () => {
  const route = routes().find(row => row.path.endsWith('/requests/:resource/:id/:action'));
  const custom = { role: 'finance', permissionMode: 'custom', permissions: { modules: ['finance'], actions: ['manageWebsite'] } };
  const check = await invoke(route, custom, { resource: 'financials', id, action: 'update' });
  assert.equal(check.permitted, true);
  let writeAllowed = false; route.handlers[1](check.req, check.res, () => { writeAllowed = true; });
  assert.equal(writeAllowed, true);
  assert.equal((await invoke(route, custom, { resource: 'applications', id, action: 'status' })).code, 403);
  const ordinary = await invoke(route, { role: 'finance' }, { resource: 'financials', id, action: 'update' });
  route.handlers[1](ordinary.req, ordinary.res, () => assert.fail('ordinary finance cannot write website'));
});
test('singleton settings preserve untouched fields and use the existing PUT endpoint', async () => {
  const calls = [];
  const client = createWebsiteClient({ config: () => ({ enabled: true, ready: true, baseUrl: 'https://site.example/api', token: 'fixture' }), fetchImpl: async (url, options) => { calls.push({ url, options }); return response(options.method === 'PUT' ? {} : { contactEmail: 'old@example.com', whatsappUrl: 'kept', leadCapturePromptEnabled: true }); } });
  await client.editResource('siteSettings', 'singleton', { contactEmail: 'new@example.com' });
  assert.equal(calls[1].url, 'https://site.example/api/admin/site-settings');
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(JSON.parse(calls[1].options.body).whatsappUrl, 'kept');
  await assert.rejects(client.editResource('siteSettings', undefined, { contactEmail: 'wrong' }));
});
test('financial actions target original website invoice and proof endpoints once, with no CRM money mutation', async () => {
  const calls = [];
  const client = createWebsiteClient({ config: () => ({ enabled: true, ready: true, baseUrl: 'https://site.example/api', token: 'fixture' }), fetchImpl: async (url, options) => { calls.push({ url, options }); return response({}); } });
  await client.action('financials', id, 'update', { status: 'paid', adminNote: 'verified' });
  await client.action('paymentProofs', id, 'review', { status: 'approved', reviewNote: 'verified' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `https://site.example/api/admin/student-financials/invoices/${id}`);
  assert.equal(calls[1].url, `https://site.example/api/admin/student-financials/payment-proofs/${id}`);
  assert.ok(calls.every(call => call.options.method === 'PATCH'));
});
test('inbox mail is scoped to current CRM company; HR cannot read it', async () => {
  const route = routes().find(row => row.path.endsWith('/section-mail'));
  const check = await invoke(route, { role: 'reception', companyId: 'one' });
  assert.equal(check.permitted, true);
  let received; check.res.json = body => { received = body; };
  await route.handlers.at(-1)(check.req, check.res, error => { throw error; });
  assert.deepEqual(received.map(row => row.message), ['own']);
  assert.deepEqual((await invoke(route, { role: 'hr' })).code, 403);
});

test('new website invoice uses the source create endpoint without importing a CRM invoice', async () => {
  const calls = [];
  const client = createWebsiteClient({ config: () => ({ enabled: true, ready: true, baseUrl: 'https://site.example/api', token: 'fixture' }), fetchImpl: async (url, options) => { calls.push({ url, options }); return response({ _id: id }); } });
  await client.editResource('financials', undefined, { studentId: id, invoiceNumber: 'INV-TEST', amount: 200, description: 'Tuition' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://site.example/api/admin/student-financials/invoices');
  assert.equal(calls[0].options.method, 'POST');
  await assert.rejects(client.editResource('financials', undefined, { companyId: 'other', amount: 100 }));
});
test('university account creation is whitelisted and does not allow changing an existing account role', async () => {
  const calls = [];
  const client = createWebsiteClient({ config: () => ({ enabled: true, ready: true, baseUrl: 'https://site.example/api', token: 'fixture' }), fetchImpl: async (url, options) => { calls.push({ url, options }); return response({ _id: id }); } });
  await client.editResource('universityAccounts', undefined, { name: 'Test University', email: 'fixture@example.com', password: 'fixture-only', universityId: id });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://site.example/api/admin/university-accounts');
  assert.equal(calls[0].options.method, 'POST');
  await assert.rejects(client.action('universityAccounts', id, 'update', { role: 'admin' }));
});

test('expired website token does not expire the CRM login session', async () => {
  const client = createWebsiteClient({ config: () => ({ enabled: true, ready: true, baseUrl: 'https://site.example/api', token: 'expired-fixture' }), fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
  await assert.rejects(client.resource('applications'), error => error.status === 502 && error.message.includes('رمز الموقع'));
});
