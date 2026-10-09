import {websiteApplicationStatus} from './accountBridge.js';
const validId=id=>typeof id==='string' && /^[a-f\d]{24}$/i.test(id);
function identities(db,companyId) {
 const employees=[...(db.employees || []),...(db.settings?.employees || [])].filter(row=>row.companyId===companyId);
 return employees.map(employee=>{
  const user=(db.users || []).find(row=>row.companyId===companyId && (row.id===employee.linkedUserId || row.employeeId===employee.id));
  const source=employee.websiteSource?.resource==='employees' ? employee.websiteSource.id : user?.websiteAccountId || db.websiteSyncSettings?.[companyId]?.identities?.[user?.id];
  return {localId:employee.id,source,active:!['Terminated','Inactive'].includes(employee.status) && user?.isActive!==false};
 });
}
export function localAdvisorId(db,companyId,source) {if(!validId(source))return undefined;return identities(db,companyId).find(row=>row.source===source && row.active)?.localId;}
export function applicationEdit(db,companyId,application,body) {
 const source=application.websiteSource, result={version:source.version || 0};
 if(body.websiteVersion !== undefined && body.websiteVersion !== result.version)throw Object.assign(new Error('تغيّر الطلب؛ حدّثه قبل الحفظ.'),{status:409});
 // Omit lifecycle fields on ordinary edits. An old CRM label is never a reason to downgrade the website.
 if(body.status!==undefined && body.status!==application.status)result.detailedStatus=websiteApplicationStatus(body.status);
 if(body.assignedTo!==undefined && body.assignedTo!==(application.assignedTo || '')) {
  if(body.assignedTo==='')result.advisorId=null;
  else {
   const match=identities(db,companyId).find(row=>row.localId===body.assignedTo && row.active && validId(row.source));
   if(!match)throw Object.assign(new Error('اربط الموظف بحسابه في الموقع قبل إسناد الطلب.'),{status:409});
   result.advisorId=match.source;
  }
 }
 return result;
}
