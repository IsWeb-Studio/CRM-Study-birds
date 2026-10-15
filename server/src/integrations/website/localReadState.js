import {createHash} from 'node:crypto';
import {canOpenModule} from '../../auth.js';
const resources={students:['students','students'],applications:['applications','admissions'],invoices:['invoices','finance'],payments:['payments','finance'],leads:['leads','consultancy'],tasks:['tasks','tasks'],reminders:['reminders','reminders'],calls:['callSchedules','calls'],scripts:['responseScripts','scripts'],employees:['employees','hr'],conversations:['conversations','inbox'],mail:['websiteContactMail','inbox'],leave:['leaveRequests','leave']};
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function canReadLocal(user,key){return typeof key==='string' && key.startsWith('crm:') && Object.hasOwn(resources,key.slice(4)) && canOpenModule(user,resources[key.slice(4)][1]);}
function clean(value){if(Array.isArray(value))return value.map(clean);if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>!['unreadCount','readAt','isRead','passwordHash','accessToken','refreshToken','websiteSource'].includes(key)).map(key=>[key,clean(value[key])]));return value;}
export function localRevision(row){return createHash('sha256').update(JSON.stringify(clean(row))).digest('hex');}
function rowsFor(db,user,key){
 if(!canReadLocal(user,key))throw fail(403,'غير مصرح بقراءة القسم');
 const name=key.slice(4),rows=(db[resources[name][0]] || []).filter(row=>row.companyId===user.companyId && !row.websiteSource);
 if(['admin','management'].includes(user.role))return rows;
 if(name==='tasks')return rows.filter(row=>row.assignedUserId?row.assignedUserId===user.sub:!row.assignedRole || row.assignedRole===user.role);
 if(name==='reminders')return rows.filter(row=>(row.assignedUserId || row.userId)===user.sub);
 if(name==='leave')return rows.filter(row=>row.userId===user.sub || user.employeeId && row.employeeId===user.employeeId);
 return rows;
}
const receiptKey=(company,key,id)=>JSON.stringify([company,key,id]);
export function localStates(db,user,key,ids){
 if(!Array.isArray(ids) || ids.length>100 || ids.some(id=>typeof id!=='string' || id.length>180))throw fail(400,'معرفات غير صالحة');
 return Object.fromEntries(rowsFor(db,user,key).filter(row=>ids.includes(row.id || row.messageId)).map(row=>{
 const id=row.id || row.messageId,version=localRevision(row),seen=db.sharedReadReceipts?.[receiptKey(user.companyId,key,id)];
 return [id,{id,resource:key,canonical:key,version,unread:seen?.revision!==version,readAt:seen?.readAt || null}];
 }));
}
export function localSummary(db,user){
 return Object.fromEntries(Object.keys(resources).map(key=>'crm:'+key).filter(key=>canReadLocal(user,key)).map(key=>{
 const rows=rowsFor(db,user,key),states=rows.map(row=>db.sharedReadReceipts?.[receiptKey(user.companyId,key,row.id || row.messageId)]?.revision!==localRevision(row));
 return [key,{canonical:key,total:rows.length,unread:states.filter(Boolean).length}];
 }));
}
export function markLocalRead(db,user,key,id,version){
 const state=localStates(db,user,key,[id])[id];if(!state)throw fail(404,'السجل غير موجود');if(state.version!==version)throw fail(409,'السجل اتحدث؛ افتح التفاصيل مجددًا');
 db.sharedReadReceipts ||= {};db.sharedReadReceipts[receiptKey(user.companyId,key,id)]={revision:version,readAt:new Date().toISOString(),readBy:user.sub};
 if(key==='crm:conversations'){const row=db.conversations.find(row=>row.id===id && row.companyId===user.companyId);if(row)row.unreadCount=0;}
 return {...state,unread:false};
}

const detailFields={students:['name','email','phone','nationality','notes'],applications:['studentId','university','program','country','status','intake','notes','applicationRefNo'],invoices:['number','studentId','total','paid','currency','status','description','dueDate'],payments:['receiptNumber','invoiceId','amount','currency','method','date','notes'],leads:['name','phone','email','country','program','source','stage','priority','notes'],tasks:['title','description','status','dueDate','assignedUserId','assignedRole'],reminders:['title','text','remindAt','dueDate','status'],calls:['leadName','phone','datetime','status','notes'],scripts:['title','category','content','text'],employees:['name','email','phone','title','department','status'],conversations:['channelType','status','priority','lastMessageAt'],mail:['name','email','subject','message','receivedAt'],leave:['type','startDate','endDate','status','reason','employeeId']};
export function localDetail(db,user,key,id){
 const row=rowsFor(db,user,key).find(row=>(row.id || row.messageId)===id);if(!row)throw fail(404,'السجل غير موجود');
 const fields=['id','createdAt','updatedAt',...(detailFields[key.slice(4)] || [])];const record=Object.fromEntries(fields.filter(field=>row[field]!==undefined).map(field=>[field,row[field]]));
 return {record:{...record,id},state:localStates(db,user,key,[id])[id]};
}
export function localUnread(db,user,key){
 const rows=rowsFor(db,user,key);let unread=rows.filter(row=>db.sharedReadReceipts?.[receiptKey(user.companyId,key,row.id || row.messageId)]?.revision!==localRevision(row));
 return {total:unread.length,items:unread.slice(0,100).map(row=>({id:row.id || row.messageId,title:row.name || row.title || row.subject || row.number || row.leadName || row.text || row.id,updatedAt:row.updatedAt || row.createdAt}))};
}
