import test from 'node:test';
import assert from 'node:assert/strict';
import {localStates,localSummary,markLocalRead,canReadLocal,localDetail} from './localReadState.js';
const admin={sub:'one',companyId:'company',role:'admin'};
const coworker={...admin,sub:'two'};
const database=()=>({students:[{id:'student',companyId:'company',name:'Student',status:'active'},{id:'foreign',companyId:'other',name:'Private'}],tasks:[],conversations:[]});
test('reading is shared across employees, updates reappear and business state is unchanged',()=>{
 const db=database(),state=localStates(db,admin,'crm:students',['student']).student;
 assert.equal(state.unread,true);markLocalRead(db,admin,'crm:students','student',state.version);
 assert.equal(localStates(db,coworker,'crm:students',['student']).student.unread,false);assert.equal(db.students[0].status,'active');
 db.students[0].name='Updated';assert.equal(localStates(db,coworker,'crm:students',['student']).student.unread,true);
 assert.throws(()=>markLocalRead(db,admin,'crm:students','student',state.version),{status:409});
});
test('company isolation and resource whitelists apply to reads and counters',()=>{
 const db=database();assert.equal(localSummary(db,admin)['crm:students'].total,1);
 assert.equal(localStates(db,admin,'crm:students',['foreign']).foreign,undefined);
 assert.throws(()=>markLocalRead(db,admin,'crm:students','foreign','version'),{status:404});assert.equal(canReadLocal(admin,'crm:__proto__'),false);
});
test('linked website projections never add a second unread copy',()=>{
 const db=database();db.students.push({id:'linked',companyId:'company',websiteSource:{resource:'students',id:'a'.repeat(24)}});
 assert.equal(localSummary(db,admin)['crm:students'].total,1);
});
test('conversation reading clears only the read indicator and never resolves the conversation',()=>{
 const db=database();db.conversations=[{id:'thread',companyId:'company',status:'pending',unreadCount:2}];
 const state=localStates(db,admin,'crm:conversations',['thread']).thread;markLocalRead(db,admin,'crm:conversations','thread',state.version);
 assert.equal(db.conversations[0].status,'pending');assert.equal(db.conversations[0].unreadCount,0);assert.equal(localStates(db,coworker,'crm:conversations',['thread']).thread.unread,false);
});

test('generic detail projection excludes payroll and credentials even for a user allowed to see the module',()=>{
 const db=database();db.employees=[{id:'employee',companyId:'company',name:'Employee',salary:5000,password:'Never expose',portalPassword:'Never expose'}];
 const detail=localDetail(db,admin,'crm:employees','employee');assert.equal(detail.record.name,'Employee');assert.equal(detail.record.salary,undefined);assert.equal(detail.record.password,undefined);assert.equal(detail.record.portalPassword,undefined);
});
