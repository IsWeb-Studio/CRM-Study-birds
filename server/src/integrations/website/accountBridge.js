import {createHash,randomUUID} from 'node:crypto';
import {websiteApplicationStatuses} from './applicationStatuses.js';
const fail = (message,status=400) => Object.assign(new Error(message),{status});
const staff = {
  consultant:{employeeRole:'educational_consultant',permissions:['students','applications','consultations']},
  admissions:{employeeRole:'admission',permissions:['students','applications','student-documents']},
  finance:{employeeRole:'finance',permissions:['student-financials']},
  reception:{employeeRole:'travel_coordinator',permissions:['student-arrivals']},
  hr:{employeeRole:'operations',permissions:[]},
  management:{employeeRole:'branch_manager',permissions:[]},
  admin:{employeeRole:'operations',permissions:[]}
};
export function websiteApplicationStatus(status) {
  const code=Object.entries(websiteApplicationStatuses).find(([,label])=>label===status)?.[0];
  if(!code)throw fail('حالة القبول غير مدعومة.');
  return code;
}
export function staffAccount(payload) {
  const mapped = staff[payload.role]; if (!mapped) throw fail('دور CRM غير مدعوم في حساب الموقع.');
  // CRM administrators do not automatically become website administrators.
  return {name:payload.name,email:payload.email,password:payload.password,isActive:payload.isActive !== false,...mapped};
}
export function accountIdentity(companyId,kind,email) {
  return createHash('sha256').update(JSON.stringify([companyId,kind,String(email).trim().toLowerCase()])).digest('hex');
}
export function assertWebsiteWrites(env=process.env) {
  if (env.STUDY_BIRDS_ALLOW_WRITES !== 'true') throw fail('الكتابة في الموقع معطلة. فعّل STUDY_BIRDS_ALLOW_WRITES على خادم CRM.',403);
}
export async function provisionAccount(client,{companyId,kind,payload},env=process.env) {
  assertWebsiteWrites(env);
  const recordId = accountIdentity(companyId,kind,payload.email);
  const account = await client.request('/crm/accounts',{method:'POST',body:{...payload,companyId,recordId,kind}});
  if (!/^[a-f\d]{24}$/i.test(account?._id || '')) throw fail('رد الموقع لا يحتوي معرّف حساب صالح.',502);
  return account;
}
export function archiveLegacyCatalog(db) {
  if (db.websiteCatalogArchive) return false;
  const original = db.educationCatalog || {};
  db.websiteCatalogArchive = {id:randomUUID(),archivedAt:new Date().toISOString(),universities:structuredClone(original.universities || []),programs:structuredClone(original.programs || []),scholarships:structuredClone(original.scholarships || [])};
  return true;
}
export function replaceLegacyCatalog(db) {
  if (db.websiteCatalogCutover) return false;
  if (!db.websiteCatalogArchive) throw fail('احفظ نسخة الدليل القديم قبل الاستبدال.',409);
  const original = db.educationCatalog || {};
  db.educationCatalog = {...original,universities:[],programs:[],scholarships:[]};
  db.websiteCatalogCutover = {at:db.websiteCatalogArchive.archivedAt,archiveId:db.websiteCatalogArchive.id};
  return true;
}
export function mountAccountBridge(app,{client,allowAction,allowModule,readDb,mutateDb}) {
  app.post('/api/students/:id/account',allowModule('students'),allowAction('createApplication'),async(req,res)=>{
    const snapshot=await readDb();const student=snapshot.students.find(row=>row.id === req.params.id && row.companyId === req.user.companyId);
    if (!student) throw fail('الطالب غير موجود.',404);
    if (student.websiteSource?.id) throw fail('هذا الطالب مرتبط بحساب بالفعل؛ استخدم التعديل.',409);
    assertWebsiteWrites();
    if(req.body.accountId && snapshot.students.some(row=>row.id!==student.id && row.companyId===req.user.companyId && row.websiteSource?.id===req.body.accountId))throw fail('الحساب مرتبط بطالب آخر في CRM.',409);
    const source=req.body.accountId ? await client.request('/crm/accounts/link',{method:'POST',body:{accountId:req.body.accountId,companyId:req.user.companyId,recordId:accountIdentity(req.user.companyId,'student',student.email),kind:'student',email:student.email}}) : await provisionAccount(client,{companyId:req.user.companyId,kind:'student',payload:{name:student.name,email:student.email,password:req.body.password,profile:{phone:student.phone || '',nationality:student.nationality || ''}}});
    const result=await mutateDb(db=>{const current=db.students.find(row=>row.id === student.id && row.companyId === req.user.companyId);if (!current) throw fail('تغير سجل الطالب؛ حدّث القائمة.',409);current.websiteSource={resource:'students',id:source._id,readOnly:false};return current;});
    res.json(result);
  });
  app.post('/api/students',allowModule('students'),allowAction('createApplication'),async(req,res) => {
    const payload = req.body || {};
    const body = Object.fromEntries(['name','email','password','profile'].filter(key=>payload[key] !== undefined).map(key=>[key,payload[key]]));
    const source = await provisionAccount(client,{companyId:req.user.companyId,kind:'student',payload:body});
    const result = await mutateDb(db => {
      const existing = db.students.find(row=>row.companyId === req.user.companyId && row.websiteSource?.id === source._id);
      if (existing) return existing;
      const student = {id:randomUUID(),companyId:req.user.companyId,name:source.name,email:source.email,...body.profile,createdAt:new Date().toISOString(),websiteSource:{resource:'students',id:source._id,readOnly:false}};
      db.students.unshift(student); return student;
    });
    res.status(201).json(result);
  });
  app.patch('/api/students/:id',allowModule('students'),allowAction('createApplication'),async(req,res) => {
    const db = await readDb(); const row = db.students.find(item=>item.id === req.params.id && item.companyId === req.user.companyId);
    if (!row?.websiteSource?.id) throw fail('هذا الطالب غير مرتبط بحساب موقع. اربطه صراحة أولًا.',409);
    assertWebsiteWrites();
    const source = await client.request(`/crm/accounts/${row.websiteSource.id}`,{method:'PATCH',body:req.body});
    const result = await mutateDb(data => { const current = data.students.find(item=>item.id === row.id && item.companyId === req.user.companyId); if (!current) throw fail('تغير السجل أثناء الحفظ.',409); const {user,_id,__v,createdAt,updatedAt,...profile} = source.profile || {}; Object.assign(current,{name:source.name,email:source.email,...profile,updatedAt:new Date().toISOString()}); return current; });
    res.json(result);
  });
}
