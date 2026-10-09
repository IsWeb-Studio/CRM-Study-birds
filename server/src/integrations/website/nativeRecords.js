import { randomUUID } from 'node:crypto';

export const nativeResources = { students: 'students', applications: 'applications', financials: 'invoices', employees: 'employees' };
const validId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const idOf = value => typeof value === 'string' ? value : value?._id;
const label = value => typeof value === 'string' ? value : value?.name || value?.title || '';
const statuses = { submitted:'Submitted to University', 'under-review':'Under Review', 'additional-documents-required':'Preparing Documents', 'conditional-admission':'Conditional Acceptance', 'final-admission':'Final Acceptance', rejected:'Rejected', 'payment-required':'Conditional Acceptance' };
export const websitePaid = row => Math.min(Number(row.amount || 0), Math.max(0, row.status === 'paid' ? Number(row.amount || 0) : Number(row.crmPaidAmount || 0) + Number(row.walletCreditApplied || 0)));

// Only an explicit source ID identifies a record. Names/emails never join people.
function ensure(db, companyId, resource, remote, actorId) {
  const collection = nativeResources[resource];
  db[collection] ||= [];
  db.websiteRecordLinks ||= [];
  const link = db.websiteRecordLinks.find(row => row.companyId === companyId && row.resource === resource && row.websiteId === remote._id);
  let row = db[collection].find(row => row.companyId === companyId && (row.websiteSource?.resource === resource && row.websiteSource.id === remote._id || link && row.id === link.localId));
  if (row?.websiteSource?.id && row.websiteSource.id !== remote._id) throw Object.assign(new Error('Source identity conflict'), {status:409});
  if (!row) {
    row = {id:randomUUID(), companyId, createdAt:remote.createdAt || new Date().toISOString(), documents:[], notes:'', consultantId:'', assignedTo:'', followUpProgress:[], installments:[]};
    db[collection].push(row);
  }
  row.websiteSource = {...row.websiteSource, resource, id:remote._id, readOnly:false, nativeFeatures:true, syncedAt:new Date().toISOString()};
  if (!link) db.websiteRecordLinks.push({companyId, resource, websiteId:remote._id, target:collection, localId:row.id, linkedBy:actorId, linkedAt:new Date().toISOString()});
  return row;
}

function documents(row, remote) {
  if (!Array.isArray(remote.documents) || remote.documents.some(doc => !validId(doc?._id))) return;
  const aliases = {passport:'Passport', transcript:'Transcript', 'biometric-photo':'Personal Photo', 'latest-qualification':'High School Certificate', 'language-certificate':'English Certificate', other:'Other'};
  row.documents ||= [];
  const active = new Set(remote.documents.map(doc => doc._id));
  // Preserve CRM review/version history for documents detached on the website.
  for (const doc of row.documents) if (doc.websiteDocumentId && !active.has(doc.websiteDocumentId)) doc.current = false;
  for (const source of [...remote.documents].sort((a,b)=>String(a.createdAt || '').localeCompare(String(b.createdAt || '')))) {
    let doc = row.documents.find(doc => doc.websiteDocumentId === source._id);
    if (!doc) {
      const type = aliases[source.type] || source.type || 'Other';
      doc = {id:randomUUID(), version:1+Math.max(0,...row.documents.filter(doc=>doc.type===type).map(doc=>Number(doc.version || 1)))}; row.documents.push(doc);
    }
    Object.assign(doc, {websiteDocumentId:source._id, websiteVersion:source.__v || 0, type:aliases[source.type] || source.type || 'Other', originalName:source.fileName, fileName:source.fileName, size:source.size, storageProvider:'study-birds', status:source.detailedStatus === 'approved' ? 'Approved' : source.detailedStatus === 'rejected' ? 'Rejected' : 'Pending Review', reviewNote:source.reviewNote || '', uploadedAt:source.createdAt || '', current:true});
    delete doc.url; // Files are accessed only through the authorized signed-link gateway.
  }
  const byType = new Map();
  for (const source of remote.documents) {
    const doc = row.documents.find(doc => doc.websiteDocumentId === source._id);
    const group = byType.get(doc.type) || []; group.push(doc); byType.set(doc.type,group);
  }
  for (const [type,group] of byType) {
    group.sort((a,b) => String(a.uploadedAt || '').localeCompare(String(b.uploadedAt || '')));
    row.documents.filter(doc=>doc.type===type).forEach(doc=>{doc.current=false;});
    group.at(-1).current=true;
  }
}

export function materializeWebsiteRows(db, companyId, resource, rows, actorId = 'website-sync') {
  if (!nativeResources[resource] || !companyId) return [];
  const result = [];
  for (const remote of rows) {
    if (!validId(remote?._id)) continue;
    const student = ['applications','financials'].includes(resource) ? remote.student : null;
    if (student && !validId(idOf(student)) || ['applications','financials'].includes(resource) && !student) continue;
    const studentRow = student ? materializeWebsiteRows(db, companyId, 'students', [{...(typeof student === 'object' ? student : {}), _id:idOf(student), ...(remote.applicantProfile && !student.profile ? {profile:remote.applicantProfile} : {})}], actorId)[0] : null;
    const row = ensure(db, companyId, resource, remote, actorId);
    if (resource === 'students') {
      const profile = remote.profile || remote.applicantProfile || {};
      for (const field of ['name','email']) if (remote[field] !== undefined) row[field] = remote[field];
      for (const field of ['phone','nationality']) if (profile[field] !== undefined || remote[field] !== undefined) row[field] = profile[field] ?? remote[field];
    } else if (resource === 'applications') {
      const university = remote.program?.university || remote.university;
      Object.assign(row, {studentId:studentRow.id, status:statuses[remote.detailedStatus || remote.status] || row.status || 'Preparing Documents', university:label(university), country:label(university?.country), program:[label(remote.program), remote.program?.degreeLevel, remote.program?.language].filter(Boolean).join(' — ')});
      row.websiteSource.programId = idOf(remote.program);
      if (remote.notes !== undefined) row.notes = remote.notes;
      if (remote.applicantProfile?.intake !== undefined) row.intake = remote.applicantProfile.intake;
      for (const field of ['applicationRefNo','portalUrl','portalUsername','offerType','offerConditions','rejectionReason']) if (remote.crmDetails?.[field] !== undefined) row[field] = remote.crmDetails[field];
      documents(row, remote);
    } else if (resource === 'financials') {
      const total = Number(remote.amount || 0), paid = websitePaid(remote);
      Object.assign(row, {studentId:studentRow.id, number:remote.invoiceNumber || remote._id, description:remote.description || '', total, paid, balance:Math.max(0,total-paid), currency:remote.currency || 'USD', status:paid >= total ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid'});
      Object.assign(row.websiteSource, {paid, crmPaidAmount:Number(remote.crmPaidAmount || 0), version:remote.__v || 0});
    } else if (resource === 'employees') {
      Object.assign(row, {name:remote.name || '', email:remote.email || '', title:remote.employeeRole || remote.role, status:remote.isActive === false ? 'Inactive' : row.status === 'Terminated' ? 'Terminated' : 'Active'});
      row.department ||= remote.employeeRole === 'educational_consultant' ? 'Consultancy' : 'Study Birds';
      row.joinDate ||= remote.createdAt?.slice(0,10) || '';
      // A personnel file grants no CRM login, role, salary or permissions.
      const user = db.users?.find(user => user.companyId === companyId && user.websiteAccountId === remote._id);
      if (user) row.linkedUserId = user.id;
    }
    result.push(row);
  }
  return result;
}
