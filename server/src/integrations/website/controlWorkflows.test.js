import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationEdit} from './applicationEdit.js';
import {materializeWebsiteRows} from './nativeRecords.js';
import {websiteApplicationStatuses} from './applicationStatuses.js';
import {canWriteResource} from './writePolicy.js';
import {reconciliationPreview,reconcileProofReceipts} from './financialReconciliation.js';
import {createWebsiteClient} from './website.service.js';
const id=value=>value.repeat(24);
function fixture(){const db={students:[{id:'student',companyId:'one',websiteSource:{id:id('a')}}],invoices:[{id:'invoice',companyId:'one',studentId:'student',total:1000,description:'Tuition',websiteSource:{resource:'financials',id:id('b'),paid:1000}}],payments:[],employees:[],users:[]};const snapshot={invoice:{_id:id('b'),student:id('a'),amount:1000,currency:'USD',status:'paid',__v:3,crmPaidAmount:100,walletCreditApplied:100},proofs:[{_id:id('c'),student:id('a'),invoice:id('b'),status:'approved',amount:600,reviewedAt:'2026-10-10T10:00:00Z'}],wallet:[]};return {db,snapshot,invoice:db.invoices[0]};}
test('all source lifecycle states remain distinct and note-only native saves never send a status',()=>{
 for(const [code,label] of Object.entries(websiteApplicationStatuses)){
  const db={students:[],applications:[]};const app=materializeWebsiteRows(db,'one','applications',[{_id:id('b'),student:id('a'),detailedStatus:code,__v:7}])[0];assert.equal(app.status,label);
  const body=applicationEdit(db,'one',app,{status:label,notes:'Changed',assignedTo:'',websiteVersion:7});assert.equal(body.version,7);assert.equal(body.detailedStatus,undefined);assert.equal(body.advisorId,undefined);
  assert.throws(()=>applicationEdit(db,'one',app,{websiteVersion:6}),error=>error.status===409);
 }
});
test('native assignment only uses explicit, active identities in the same company',()=>{
 const db={employees:[{id:'staff',companyId:'one',linkedUserId:'user'},{id:'foreign',companyId:'two',websiteSource:{resource:'employees',id:id('d')}}],users:[{id:'user',companyId:'one',websiteAccountId:id('c')}]};
 const app={status:'Payment Verification',assignedTo:'',websiteSource:{id:id('b'),version:2}};
 assert.equal(applicationEdit(db,'one',app,{assignedTo:'staff'}).advisorId,id('c'));
 assert.throws(()=>applicationEdit(db,'one',app,{assignedTo:'foreign'}),error=>error.status===409);
 assert.throws(()=>applicationEdit(db,'one',app,{assignedTo:'unlinked'}),error=>error.status===409);
 assert.equal(applicationEdit(db,'one',{...app,assignedTo:'staff'},{assignedTo:''}).advisorId,null);
 assert.equal(applicationEdit(db,'one',app,{status:'Completed'}).detailedStatus,'completed');
});
test('section actions are writable by their staff without granting unrelated sections or custom actions',()=>{
 assert.equal(canWriteResource({role:'finance'},'financials','edit'),true);assert.equal(canWriteResource({role:'finance'},'applications','status'),false);
 assert.equal(canWriteResource({role:'consultant'},'applications','status'),false);assert.equal(canWriteResource({role:'consultant'},'applications','assignment'),true);
 assert.equal(canWriteResource({role:'reception'},'support','emergency'),true);assert.equal(canWriteResource({role:'hr'},'employees','edit'),false);
 const custom={role:'management',permissionMode:'custom',permissions:{modules:['services'],actions:[]}};assert.equal(canWriteResource(custom,'housingListings','create'),false);custom.permissions.actions.push('manageServices');assert.equal(canWriteResource(custom,'housingListings','create'),true);assert.equal(canWriteResource(custom,'employees','edit'),false);
});
test('reconciliation imports verified proof receipts once and never changes or double-counts source balances',()=>{
 const {db,snapshot,invoice}=fixture();const before=reconciliationPreview(db,'one',invoice,snapshot);assert.equal(before.unallocated,200);assert.equal(before.overlap,0);
 const body={version:3,proofIds:[id('c')]};reconcileProofReceipts(db,'one',invoice,snapshot,body,{sub:'staff'});reconcileProofReceipts(db,'one',invoice,snapshot,body,{sub:'staff'});
 assert.equal(db.payments.length,1);assert.equal(db.payments[0].amount,600);assert.equal(db.payments[0].websiteSource.readOnly,true);assert.equal(invoice.websiteSource.paid,1000);assert.equal(invoice.balance,0);assert.equal(snapshot.invoice.__v,3);
});
test('unapproved, conflicting, changed, foreign and stale proofs cannot produce receipts',()=>{
 for(const change of [s=>s.proofs[0].status='pending',s=>s.proofs[0].amount=900,s=>s.proofs[0].student=id('e'),s=>s.proofs[0].invoice=id('e')]){
  const {db,snapshot,invoice}=fixture();change(snapshot);assert.throws(()=>reconcileProofReceipts(db,'one',invoice,snapshot,{version:3,proofIds:[id('c')]},{sub:'staff'}));assert.equal(db.payments.length,0);
 }
 const {db,snapshot,invoice}=fixture();assert.throws(()=>reconcileProofReceipts(db,'one',invoice,snapshot,{version:2,proofIds:[id('c')]},{sub:'staff'}));assert.throws(()=>reconciliationPreview(db,'two',invoice,snapshot));
 reconcileProofReceipts(db,'one',invoice,snapshot,{version:3,proofIds:[id('c')]},{sub:'staff'});snapshot.proofs[0].amount=700;assert.equal(reconciliationPreview(db,'one',invoice,snapshot).conflicts.length,1);
});
test('expanded student profiles, consultation availability and support escalation use verified source endpoints',async()=>{
 const calls=[];const client=createWebsiteClient({config:()=>({enabled:true,ready:true,baseUrl:'https://site.example/api',token:'fixture'}),fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({_id:id('a')})};}});
 await client.editResource('students',id('a'),{currentEducation:'Bachelor',otherLanguages:['English'],parentInfo:{name:'Parent',phone:'123',relationship:'Father'}});
 assert.deepEqual(JSON.parse(calls[0].options.body).profile.otherLanguages,['English']);assert.equal(calls[0].url,`https://site.example/api/crm/accounts/${id('a')}`);
 await client.action('consultations',id('b'),'cancel',{version:1});assert.equal(calls[1].url,`https://site.example/api/consultations/bookings/${id('b')}/cancel`);
 await client.action('consultationSlots',id('b'),'availability',{version:1,enabled:false});assert.equal(calls[2].options.method,'PATCH');
 await client.action('support',id('b'),'escalate',{escalated:true,escalationNote:'Review'});assert.equal(calls[3].url,`https://site.example/api/admin/support-tickets/${id('b')}/escalate`);
 await assert.rejects(client.uploadResource('websiteUsers',id('b'),{buffer:Buffer.from('x')}));assert.equal(calls.length,4);
});

test('partner editing uses the source account and keeps verification and commissions outside the editor',async()=>{
 const calls=[];const client=createWebsiteClient({config:()=>({enabled:true,ready:true,baseUrl:'https://site.example/api',token:'fixture'}),fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({_id:id('a')})};}});
 await client.editResource('agents',id('a'),{name:'Agency Owner',companyName:'Agency',taxId:'123',version:2});
 assert.equal(calls.length,1);assert.equal(calls[0].url,`https://site.example/api/crm/partners/${id('a')}`);assert.deepEqual(JSON.parse(calls[0].options.body).profile,{companyName:'Agency',taxId:'123'});
 await assert.rejects(client.editResource('agents',id('a'),{verificationStatus:'verified'}));assert.equal(calls.length,1);
});

test('service staff manage definitions in their section and forward versioned lifecycle changes',async()=>{
 const staff={role:'management',permissionMode:'custom',permissions:{modules:['services'],actions:['manageServices']}};
 assert.equal(canWriteResource(staff,'contentServices','create'),true);assert.equal(canWriteResource(staff,'services','update'),true);assert.equal(canWriteResource(staff,'websiteUsers','edit'),false);
 const calls=[];const client=createWebsiteClient({config:()=>({enabled:true,ready:true,baseUrl:'https://site.example/api',token:'fixture'}),fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({_id:id('a')})};}});
 await client.action('services',id('b'),'update',{status:'assigned',assignedTo:id('c'),staffNote:'Follow up',expectedVersion:3});
 assert.equal(calls[0].options.method,'PATCH');assert.equal(calls[0].url,`https://site.example/api/service-requests/${id('b')}`);assert.equal(JSON.parse(calls[0].options.body).expectedVersion,3);
 await client.action('services',id('b'),'update',{assignedTo:null,expectedVersion:4});assert.equal(JSON.parse(calls[1].options.body).assignedTo,null);
 await client.editResource('contentServices',null,{title:'Airport transfer',price:30,durationDays:1,journeyStage:'arrival',country:null});assert.equal(calls[2].url,'https://site.example/api/admin/our-services');assert.equal(JSON.parse(calls[2].options.body).price,30);
 await assert.rejects(client.action('services',id('b'),'update',{price:20}));assert.equal(calls.length,3);
});

test('ticket details, replies and assignment use the protected support endpoints',async()=>{
 const staff={role:'management',permissionMode:'custom',permissions:{modules:['inbox'],actions:['manageSupport']}};
 assert.equal(canWriteResource(staff,'support','reply'),true);assert.equal(canWriteResource(staff,'support','assign'),true);assert.equal(canWriteResource(staff,'employees','edit'),false);
 const calls=[];const client=createWebsiteClient({config:()=>({enabled:true,ready:true,baseUrl:'https://site.example/api',token:'fixture'}),fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({_id:id('a')})};}});
 await client.detail('support',id('a'));assert.equal(calls[0].url,`https://site.example/api/admin/support-tickets/${id('a')}`);
 await client.action('support',id('a'),'reply',{message:'A new reply',status:'answered'});assert.equal(calls[1].url,`https://site.example/api/admin/support-tickets/${id('a')}/reply`);assert.equal(calls[1].options.method,'PATCH');
 await client.action('support',id('a'),'assign',{assignedTo:id('b')});assert.equal(calls[2].url,`https://site.example/api/admin/support-tickets/${id('a')}/assign`);
 await client.action('support',id('a'),'assign',{assignedTo:null});assert.equal(JSON.parse(calls[3].options.body).assignedTo,null);
 await assert.rejects(client.action('support',id('a'),'assign',{role:'admin'}));assert.equal(calls.length,4);
});
