import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveLegacyCatalog,replaceLegacyCatalog,provisionAccount,staffAccount,mountAccountBridge,ensureApplicationStudentAccount} from './accountBridge.js';
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


test('creating a CRM student provisions the website login first, links both records and keeps the password out of CRM',async()=>{
 const old=process.env.STUDY_BIRDS_ALLOW_WRITES;process.env.STUDY_BIRDS_ALLOW_WRITES='true';
 try {
  const routes=new Map(), db={students:[]},calls=[];
  const app={post:(path,...handlers)=>routes.set(path,handlers.at(-1)),patch:()=>{}};
  const client={request:async(path,options)=>{calls.push({path,...options});return {_id:'a'.repeat(24),name:'Student',email:'student@example.test'};}};
  mountAccountBridge(app,{client,allowAction:()=>()=>{},allowModule:()=>()=>{},readDb:async()=>db,mutateDb:async fn=>fn(db)});
  let status,result;const res={status:code=>{status=code;return res;},json:value=>{result=value;}};
  const req={user:{companyId:'one'},body:{name:'Student',email:'student@example.test',password:'UniquePass!42',profile:{phone:'123',nationality:'Egypt'}}};
  await routes.get('/api/students')(req,res);
  assert.equal(status,201);assert.equal(calls[0].path,'/crm/accounts');assert.equal(calls[0].body.kind,'student');assert.equal(calls[0].body.password,req.body.password);assert.equal(result.websiteSource.id,'a'.repeat(24));assert.equal(result.email,req.body.email);assert.equal(result.phone,'123');assert.equal(result.password,undefined);
  await routes.get('/api/students')(req,res);assert.equal(db.students.length,1);
 }finally{if(old===undefined)delete process.env.STUDY_BIRDS_ALLOW_WRITES;else process.env.STUDY_BIRDS_ALLOW_WRITES=old;}
});

test('failed website account creation does not leave a CRM student claiming to have a login',async()=>{
 const old=process.env.STUDY_BIRDS_ALLOW_WRITES;process.env.STUDY_BIRDS_ALLOW_WRITES='true';
 try{
  const routes=new Map(),db={students:[]};let mutations=0;
  mountAccountBridge({post:(path,...handlers)=>routes.set(path,handlers.at(-1)),patch:()=>{}},{client:{request:async()=>{throw new Error('Website unavailable');}},allowAction:()=>()=>{},allowModule:()=>()=>{},readDb:async()=>db,mutateDb:async fn=>{mutations++;return fn(db);}});
  await assert.rejects(routes.get('/api/students')({user:{companyId:'one'},body:{name:'Student',email:'student@example.test',password:'UniquePass!42'}},{}),/Website unavailable/);
  assert.equal(mutations,0);assert.equal(db.students.length,0);
 }finally{if(old===undefined)delete process.env.STUDY_BIRDS_ALLOW_WRITES;else process.env.STUDY_BIRDS_ALLOW_WRITES=old;}
});


test('admission account credentials are optional and blank inputs never create an account',async()=>{
 let calls=0;const client={request:()=>calls++};
 const student={id:'student',name:'Student'};
 assert.equal(await ensureApplicationStudentAccount(client,{student,companyId:'one',email:'',password:''},{}),null);
 assert.equal(calls,0);assert.equal(student.websiteSource,undefined);
});

test('admission credentials create a website student login and subsequent applications reuse it without resetting the password',async()=>{
 const calls=[];const client={request:async(path,options)=>{calls.push({path,body:options.body});return {_id:'a'.repeat(24),email:'student@example.test'};}};
 const student={id:'student',name:'Student',email:'student@example.test',phone:'123'};
 const params={student,companyId:'one',email:' Student@example.test ',password:'UniquePass!42'};
 const env={STUDY_BIRDS_ENABLED:'true',STUDY_BIRDS_ALLOW_WRITES:'true'};
 assert.equal(await ensureApplicationStudentAccount(client,params,env),'a'.repeat(24));
 assert.equal(calls[0].path,'/crm/accounts');assert.equal(calls[0].body.kind,'student');assert.equal(calls[0].body.email,'student@example.test');assert.equal(calls[0].body.password,params.password);assert.equal(student.password,undefined);assert.equal(student.websitePassword,undefined);
 await ensureApplicationStudentAccount(client,params,env);assert.equal(calls.length,1);
 await ensureApplicationStudentAccount(client,{student,companyId:'one'},env);assert.equal(calls.length,1);
});

test('partial credentials and mismatched student email fail before a remote account is created',async()=>{
 let calls=0;const client={request:()=>calls++};const student={name:'Student',email:'student@example.test'};
 const env={STUDY_BIRDS_ENABLED:'true',STUDY_BIRDS_ALLOW_WRITES:'true'};
 for(const pair of [{email:'student@example.test'},{password:'UniquePass!42'},{email:'other@example.test',password:'UniquePass!42'}])await assert.rejects(ensureApplicationStudentAccount(client,{student,companyId:'one',...pair},env));
 assert.equal(calls,0);assert.equal(student.websiteSource,undefined);
});

test('failed or disabled account creation leaves admission student data unchanged',async()=>{
 const student={name:'Student',email:'student@example.test'};const before=structuredClone(student);
 const params={student,companyId:'one',email:student.email,password:'UniquePass!42'};
 await assert.rejects(ensureApplicationStudentAccount({request:async()=>{throw new Error('Unavailable');}},params,{STUDY_BIRDS_ENABLED:'true',STUDY_BIRDS_ALLOW_WRITES:'true'}));
 assert.deepEqual(student,before);
 await assert.rejects(ensureApplicationStudentAccount({request:()=>assert.fail('No remote calls')},params,{}));assert.deepEqual(student,before);
});
