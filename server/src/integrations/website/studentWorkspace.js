import {randomUUID} from 'node:crypto';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function student(db,req){const row=db.students.find(row=>row.id===req.params.id && row.companyId===req.user.companyId);if(!row)fail('الطالب غير موجود.',404);return row;}
function logActivity(db,req,action,entityType,entityId,details){db.activities ||= [];db.activities.unshift({id:randomUUID(),companyId:req.user.companyId,actorId:req.user.sub,actorName:req.user.name,action,entityType,entityId,details,createdAt:new Date().toISOString()});db.activities=db.activities.slice(0,500);}
export function updateStudentWorkspace(db,req){
  const row=student(db,req),body=req.body || {};
  if(Object.keys(body).some(key=>!['notes','consultantId'].includes(key)))fail('حقول متابعة غير مسموحة.');
  if(body.notes!==undefined && (typeof body.notes!=='string' || body.notes.length>20000))fail('الملاحظات غير صالحة.');
  if(body.consultantId && !db.employees?.some(employee=>employee.id===body.consultantId && employee.companyId===req.user.companyId && !['Inactive','Terminated'].includes(employee.status)))fail('اختر مستشارًا نشطًا من نفس المؤسسة.');
  if(body.consultantId!==undefined && typeof body.consultantId!=='string')fail('معرف المستشار غير صالح.');
  Object.assign(row,body,{updatedAt:new Date().toISOString()});
  logActivity(db,req,'updated','student',row.id,'تحديث متابعة الطالب');
  return row;
}
export function createStudentTask(db,req){
  const row=student(db,req),body=req.body || {};
  if(Object.keys(body).some(key=>!['title','dueDate'].includes(key)) || typeof body.title!=='string' || !body.title.trim() || body.title.length>300 || body.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate))fail('بيانات المهمة غير صالحة.');
  const task={id:randomUUID(),companyId:req.user.companyId,studentId:row.id,title:body.title.trim(),description:row.name || '',dueDate:body.dueDate || '',priority:'Medium',status:'open',kind:'manual',source:'task',assignedUserId:req.user.sub,assignedByUserId:req.user.sub,createdBy:req.user.name,createdAt:new Date().toISOString()};
  db.tasks ||= [];db.tasks.unshift(task);logActivity(db,req,'created','task',task.id,task.title);return task;
}
export function mountStudentWorkspace(app,{allowModule,allowAction,readDb,mutateDb}){
  const middleware=[allowModule('students'),allowAction('createApplication')];
  app.get('/api/students/:id/crm',...middleware,async(req,res)=>{const db=await readDb(),row=student(db,req);res.json({notes:row.notes || '',consultantId:row.consultantId || '',consultants:(db.employees || []).filter(employee=>employee.companyId===req.user.companyId && employee.department==='Consultancy' && !['Inactive','Terminated'].includes(employee.status)).map(({id,name})=>({id,name})),tasks:(db.tasks || []).filter(task=>task.companyId===req.user.companyId && task.studentId===row.id && (['admin','management'].includes(req.user.role) || task.assignedUserId===req.user.sub))});});
  app.patch('/api/students/:id/crm',...middleware,async(req,res)=>res.json(await mutateDb(db=>updateStudentWorkspace(db,req))));
  app.post('/api/students/:id/crm/tasks',...middleware,async(req,res)=>res.status(201).json(await mutateDb(db=>createStudentTask(db,req))));
}
