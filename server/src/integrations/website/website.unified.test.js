import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWebsiteRecord, mergeRecords } from '../../../../client/src/unifiedRecords.js';
const id = 'a'.repeat(24);
test('merged lists preserve independent CRM records, never merge matching names, and do not mutate either input', () => {
  const local = [{ id, name:'Same name', notes:'CRM only' }];
  const source = { _id:id, name:'Same name', email:'site@example.com' };
  const before = JSON.stringify([local, source]);
  const merged = mergeRecords(local, [normalizeWebsiteRecord('students', source)], 'students');
  assert.equal(merged.length, 2);
  assert.equal(merged[0], local[0]);
  assert.notEqual(merged[0].id, merged[1].id);
  assert.equal(JSON.stringify([local, source]), before);
});
test('an explicitly linked CRM snapshot appears once with current source data and retains its CRM id', () => {
  const local = [{ id:'crm-id', status:'Old', websiteSource:{resource:'applications',id,readOnly:true} }];
  const remote = normalizeWebsiteRecord('applications', {_id:id, detailedStatus:'under-review', student:{name:'Student'},program:{title:'Medicine'}});
  const merged = mergeRecords(local, [remote], 'applications');
  assert.equal(merged.length,1);
  assert.equal(merged[0].id,'crm-id');
  assert.equal(merged[0].status,'Under Review');
  assert.equal(local[0].status,'Old');
});
test('source invoices retain amounts and status without manufacturing CRM payment records', () => {
  const row = normalizeWebsiteRecord('financials', {_id:id,amount:200,status:'paid',currency:'EUR'});
  assert.equal(row.paid,200); assert.equal(row.balance,0);
  assert.equal(row.currency,'EUR'); assert.deepEqual(row.payments,[]);
  assert.equal(row.websiteSource.resource,'financials');
});
test('program language variants remain distinct and translated names are rendered as strings', () => {
  const source = {_id:id,title:{ar:'الطب'}, university:{name:{ar:'جامعة'},country:{name:{ar:'تركيا'}}},degreeLevel:'Bachelor',language:'English'};
  const en = normalizeWebsiteRecord('programs',source);
  const tr = normalizeWebsiteRecord('programs',{...source,_id:'b'.repeat(24),language:'Turkish'});
  assert.equal(en.university,'جامعة'); assert.equal(en.country,'تركيا');
  assert.notEqual(en.department,tr.department);
  assert.equal(mergeRecords([], [en,tr], 'programs').length,2);
});
test('failed source reads do not discard independent CRM records', () => {
  const local = [{id:'one',name:'Local'}];
  assert.deepEqual(mergeRecords(local,[], 'students'),local);
});

test('mail records use provider ids and preserve CRM conversations in the unified inbox', () => {
  const mail = normalizeWebsiteRecord('mail', {id:'provider-id',email:'sender@example.test',message:'Contact body'});
  assert.equal(mail.id,'website:mail:provider-id');
  assert.equal(mail.websiteSource.id,'provider-id');
  assert.equal(mail.contact.email,'sender@example.test');
  assert.equal(mergeRecords([{id:'crm-thread'}],[mail],'mail').length,2);
});
