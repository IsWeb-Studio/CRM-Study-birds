import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveLegacyCatalog,replaceLegacyCatalog,provisionAccount,staffAccount} from './accountBridge.js';
test('catalog archive is persisted separately before cutover and no unrelated CRM records change',()=>{
  const db={educationCatalog:{countries:['Turkey'],universities:[{id:'u'}],programs:[{id:'p'}],scholarships:[{id:'s'}]},students:[{id:'student',university:'Old university'}],invoices:[{id:'invoice'}]};
  assert.throws(()=>replaceLegacyCatalog(db));
  const before=structuredClone(db);archiveLegacyCatalog(db);
  assert.deepEqual(db.educationCatalog,before.educationCatalog);
  replaceLegacyCatalog(db);
  assert.deepEqual(db.websiteCatalogArchive.programs,before.educationCatalog.programs);
  assert.deepEqual(db.educationCatalog.countries,before.educationCatalog.countries);
  assert.deepEqual(db.students,before.students);assert.deepEqual(db.invoices,before.invoices);
  assert.equal(replaceLegacyCatalog(db),false);
});
test('disabled writes never provision a source account',async()=>{
  let calls=0;await assert.rejects(provisionAccount({request:()=>calls++},{companyId:'one',kind:'student',payload:{email:'one@example.test'}},{}));assert.equal(calls,0);
});
test('repeated account creation has stable company-scoped identity and no password is stored in CRM link',async()=>{
  const bodies=[];const client={request:async(path,opts)=>{assert.equal(path,'/crm/accounts');bodies.push(opts.body);return {_id:'a'.repeat(24),name:'Student'};}};
  const params={companyId:'one',kind:'student',payload:{name:'Student',email:'one@example.test',password:'UniquePass!42'}};
  const env={STUDY_BIRDS_ALLOW_WRITES:'true'};
  await provisionAccount(client,params,env);await provisionAccount(client,params,env);
  assert.equal(bodies[0].recordId,bodies[1].recordId);
  await provisionAccount(client,{...params,companyId:'two'},env);assert.notEqual(bodies[0].recordId,bodies[2].recordId);
});
test('consultants receive a supported employee identity; CRM admin does not become website admin',()=>{
  assert.equal(staffAccount({role:'consultant'}).employeeRole,'educational_consultant');
  assert.ok(staffAccount({role:'consultant'}).permissions.includes('applications'));
  assert.equal(staffAccount({role:'admin'}).role,undefined);
  assert.throws(()=>staffAccount({role:'superadmin'}));
});
