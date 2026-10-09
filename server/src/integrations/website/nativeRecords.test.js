import test from 'node:test';
import assert from 'node:assert/strict';
import {materializeWebsiteRows} from './nativeRecords.js';
import {invoicePaidAmount} from './nativeFinance.js';
import {updateStudentWorkspace,createStudentTask} from './studentWorkspace.js';
import {updateInvoiceWorkspace} from './invoiceWorkspace.js';
import {mergeRecords,normalizeWebsiteRecord} from '../../../../client/src/unifiedRecords.js';
import {mountWebsiteRoutes} from './website.service.js';
import {allowAction,allowModule} from '../../auth.js';
const id=n=>n.repeat(24);
const db=()=>({students:[{id:'old',companyId:'one',name:'Student',email:'same@test',notes:'keep'}],users:[],applications:[],invoices:[],employees:[],payments:[],tasks:[]});
const remoteStudent={_id:id('a'),name:'Student',email:'same@test',profile:{phone:'123'}};
const remoteApplication={_id:id('b'),student:remoteStudent,program:{_id:id('c'),title:'Medicine',degreeLevel:'Bachelor',language:'Turkish',university:{name:'University',country:{name:'Turkey'}}},status:'submitted',documents:[{_id:id('d'),type:'passport',fileName:'passport.pdf',detailedStatus:'approved',__v:2}]};
test('website records become native files once, without merging by name or email',()=>{
 const state=db();const first=materializeWebsiteRows(state,'one','applications',[remoteApplication])[0];
 materializeWebsiteRows(state,'one','applications',[remoteApplication]);
 assert.equal(state.students.length,2);assert.equal(state.applications.length,1);assert.equal(state.students[0].notes,'keep');assert.equal(first.websiteSource.readOnly,false);assert.equal(first.websiteSource.programId,id('c'));assert.equal(first.university,'University');assert.equal(first.country,'Turkey');assert.equal(first.documents[0].status,'Approved');assert.equal(first.documents[0].url,undefined);
 assert.equal(state.websiteRecordLinks.length,2);
});
test('upgrading existing projections keeps native ids, notes, workflow and private document history',()=>{
 const state=db();const app=materializeWebsiteRows(state,'one','applications',[remoteApplication])[0];app.followUpProgress=[{stageId:'stage',done:true,note:'Keep'}];app.portalPassword='CRM secret';app.websiteSource.readOnly=true;state.students[1].notes='student CRM notes';
 const docId=app.documents[0].id;
 materializeWebsiteRows(state,'one','applications',[{...remoteApplication,detailedStatus:'final-admission',documents:[]}]);
 assert.equal(state.applications[0].id,app.id);assert.equal(app.status,'Final Acceptance');assert.equal(app.followUpProgress[0].note,'Keep');assert.equal(app.portalPassword,'CRM secret');assert.equal(app.documents[0].id,docId);assert.equal(app.documents[0].current,false);assert.equal(state.students[1].notes,'student CRM notes');
});
test('incomplete/limited responses never erase history or create invalid student relations',()=>{
 const state=db();materializeWebsiteRows(state,'one','applications',[remoteApplication]);
 materializeWebsiteRows(state,'one','applications',[]);materializeWebsiteRows(state,'one','applications',[{_id:id('e'),student:null}]);
 assert.equal(state.applications.length,1);assert.equal(state.students.length,2);
});
test('replaced website documents preserve history and only the latest version is current',()=>{
 const state=db(),source={...remoteApplication,documents:[{_id:id('e'),type:'passport',fileName:'new.pdf',createdAt:'2026-10-10'},{_id:id('d'),type:'passport',fileName:'old.pdf',createdAt:'2026-09-01'}]};
 const app=materializeWebsiteRows(state,'one','applications',[source])[0];
 assert.equal(app.documents.filter(doc=>doc.current).length,1);assert.equal(app.documents.find(doc=>doc.current).originalName,'new.pdf');assert.equal(app.documents.find(doc=>doc.current).version,2);
});
test('partial website balances and local receipts are counted once',()=>{
 const state=db(),source={_id:id('b'),student:remoteStudent,amount:1000,crmPaidAmount:200,walletCreditApplied:100,status:'unpaid',currency:'USD',__v:3};
 const invoice=materializeWebsiteRows(state,'one','financials',[source])[0];invoice.installments=[{id:'schedule',amount:1000}];
 assert.equal(invoicePaidAmount(invoice,[{amount:200}]),300);assert.equal(invoice.balance,700);assert.equal(invoice.status,'Partial');assert.equal(state.payments.length,0);
 materializeWebsiteRows(state,'one','financials',[{...source,status:'paid'}]);assert.equal(invoicePaidAmount(invoice,[{amount:200}]),1000);assert.equal(invoice.installments[0].id,'schedule');
 assert.equal(invoicePaidAmount({total:1000},[{amount:200}]),200);
});
test('employee import preserves payroll/attendance and never creates a CRM login or merges same-email users',()=>{
 const state=db();state.users.push({id:'independent',companyId:'one',email:'staff@test',role:'admin'});
 const employee=materializeWebsiteRows(state,'one','employees',[{_id:id('e'),name:'Staff',email:'staff@test',employeeRole:'educational_consultant'}])[0];employee.basicSalary=900;employee.annualLeaveBalance=10;
 materializeWebsiteRows(state,'one','employees',[{_id:id('e'),name:'Updated',email:'staff@test',isActive:false}]);
 assert.equal(employee.basicSalary,900);assert.equal(employee.annualLeaveBalance,10);assert.equal(employee.linkedUserId,undefined);assert.equal(state.users.length,1);assert.equal(employee.status,'Inactive');
});
test('student follow-up and tasks stay scoped and reuse native task data',()=>{
 const state=db();const student=materializeWebsiteRows(state,'one','students',[remoteStudent])[0];const req={params:{id:student.id},user:{companyId:'one',sub:'advisor',name:'Advisor'},body:{notes:'Follow up'}};
 updateStudentWorkspace(state,req);materializeWebsiteRows(state,'one','students',[remoteStudent]);assert.equal(student.notes,'Follow up');assert.equal(state.activities[0].actorId,'advisor');assert.equal(state.activities[0].entityType,'student');
 req.body={title:'Review passport',dueDate:'2026-11-01'};const task=createStudentTask(state,req);assert.equal(task.studentId,student.id);assert.equal(state.tasks[0].assignedUserId,'advisor');
 req.user.companyId='two';assert.throws(()=>createStudentTask(state,req),{status:404});req.user.companyId='one';req.body={consultantId:'foreign'};assert.throws(()=>updateStudentWorkspace(state,req),{status:400});req.body={websiteSource:{}};assert.throws(()=>updateStudentWorkspace(state,req),{status:400});
});
test('installments preserve receipts and cannot reduce paid amounts or change totals',()=>{
 const state=db(),invoice={id:'invoice',companyId:'one',total:1000,installments:[{id:'first',amount:400,dueDate:'2026-11-01'}]};state.invoices.push(invoice);state.payments.push({companyId:'one',invoiceId:'invoice',installmentId:'first',amount:300});
 assert.throws(()=>updateInvoiceWorkspace(state,'two','invoice',{}),{status:404});
 assert.throws(()=>updateInvoiceWorkspace(state,'one','invoice',{installments:[]}),{status:400});
 assert.throws(()=>updateInvoiceWorkspace(state,'one','invoice',{installments:[{id:'first',amount:200,dueDate:'2026-11-01'},{amount:800,dueDate:'2026-12-01'}]}),{status:400});
 updateInvoiceWorkspace(state,'one','invoice',{installments:[{id:'first',amount:400,dueDate:'2026-11-01'},{amount:600,dueDate:'2026-12-01'}],notes:'Keep plan'});assert.equal(invoice.installments.length,2);assert.equal(invoice.installments[0].id,'first');
});
test('UI uses native identity and workflows while avoiding duplicate/stale source rows',()=>{
 const state=db();const app=materializeWebsiteRows(state,'one','applications',[remoteApplication])[0];app.followUpProgress=[{done:true}];
 const remote=normalizeWebsiteRecord('applications',remoteApplication);
 const unified=mergeRecords([], [remote],'applications',[app]);assert.equal(unified.length,1);assert.equal(unified[0].id,app.id);assert.equal(unified[0].websiteSource.nativeFeatures,true);assert.equal(unified[0].followUpProgress[0].done,true);
 const fresh={...app,notes:'Just edited',updatedAt:'9999-01-01'};
 assert.equal(mergeRecords([fresh],[remote],'applications',[app])[0].notes,'Just edited');
});
test('native student workspace imports permitted relations, surfaces failures and blocks foreign sections before writes',async()=>{
 const state=db(),calls=[],registered=[];
 const app=Object.fromEntries(['get','post','put'].map(method=>[method,(path,...handlers)=>registered.push({path,handlers})]));
 mountWebsiteRoutes(app,{allowAction,allowModule,readDb:async()=>state,mutateDb:async fn=>fn(state),client:{resource:async key=>{calls.push(key);if(key==='financials')throw Error('Finance unavailable');return {rows:key==='students'?[remoteStudent]:[remoteApplication]};}}});
 const route=registered.find(row=>row.path==='/api/integrations/website/requests/:resource');let data,status=200;
 const res={json:value=>{data=value;},status:code=>{status=code;return res;}};
 async function invoke(user,resource){const req={user,params:{resource}};let permitted=false;route.handlers[0](req,res,()=>{permitted=true;});if(permitted)await route.handlers[1](req,res,error=>{throw error;});}
 await invoke({role:'admin',companyId:'one',sub:'qa'},'students');assert.equal(state.applications.length,1);assert.equal(data.relatedErrors[0],'فواتير الموقع: Finance unavailable');assert.equal(state.invoices.length,0);
 calls.length=0;await invoke({role:'management',companyId:'one',permissionMode:'custom',permissions:{modules:['students'],actions:[]}},'students');assert.deepEqual(calls,['students']);
 calls.length=0;await invoke({role:'finance',companyId:'one'},'applications');assert.equal(status,403);assert.equal(calls.length,0);
});
