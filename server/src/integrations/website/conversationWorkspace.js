const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export const conversationKey=(companyId,id)=>JSON.stringify([companyId,id]);
export function updateConversationWorkspace(db,companyId,id,body,actorId){
 const keys=Object.keys(body || {});if(!keys.length || keys.some(key=>!['assignedUserId','status','priority','tags'].includes(key)))fail('حقول المحادثة غير صالحة.');
 if(body.assignedUserId!==undefined && (typeof body.assignedUserId!=='string' || body.assignedUserId && !db.users?.some(row=>row.id===body.assignedUserId && row.companyId===companyId && row.isActive!==false)))fail('اختر موظفًا نشطًا من نفس المؤسسة.');
 if(body.status!==undefined && !['open','pending','resolved'].includes(body.status))fail('حالة غير صالحة.');
 if(body.priority!==undefined && !['low','medium','high','urgent'].includes(body.priority))fail('أولوية غير صالحة.');
 if(body.tags!==undefined && (!Array.isArray(body.tags) || body.tags.length>20 || body.tags.some(tag=>typeof tag!=='string' || tag.length>60)))fail('وسوم غير صالحة.');
 db.websiteConversationMetadata ||= {};
 const key=conversationKey(companyId,id),row={...db.websiteConversationMetadata[key],...body,updatedAt:new Date().toISOString(),updatedBy:actorId};
 db.websiteConversationMetadata[key]=row;return row;
}
