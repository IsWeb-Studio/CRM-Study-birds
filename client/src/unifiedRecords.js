const label = value => typeof value === 'string' ? value : value && typeof value === 'object' ? label(value.name || value.title || value.ar || value.en || '') : '';
const applicationStatuses = { submitted: 'Submitted to University', 'under-review': 'Under Review', 'additional-documents-required': 'Preparing Documents', 'conditional-admission': 'Conditional Acceptance', 'final-admission': 'Final Acceptance', rejected: 'Rejected', 'payment-required': 'Conditional Acceptance' };
export function normalizeWebsiteRecord(resource, row) {
  const base = { ...row, id: `website:${resource}:${row._id}`, websiteSource: { resource, id: row._id, readOnly: true, record: row }, createdAt: row.createdAt || '', name: label(row.name || row.studentName || row.student || row.user), documents: [] };
  if (resource === 'students') return { ...base, name: row.name || label(row.student), applications: [], invoices: [] };
  if (resource === 'applications') return { ...base, student: row.student || {}, university: label(row.university), country: label(row.university?.country), program: label(row.program), status: applicationStatuses[row.detailedStatus || row.status] || row.status || '', intake: row.applicantProfile?.intake || '', currentDocuments: [], followUpProgress: [], documentProgress: 0, applicationRefNo: row.reference || row._id, applicationFeeStatus: row.applicationFeePaid ? 'Paid' : 'Unknown' };
  if (resource === 'financials') { const total = Number(row.amount || 0), paid = row.status === 'paid' ? total : Number(row.crmPaidAmount || row.paid || 0)+Number(row.walletCreditApplied || 0); return { ...base, number: row.invoiceNumber || row._id, student: row.student || {}, total, paid, balance: Math.max(0, total - paid), computedStatus: paid >= total ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid', currency: row.currency || 'USD', installments: [], payments: [], serviceFee: 0, passThroughFees: total }; }
  if (resource === 'employees') return { ...base, role: row.employeeRole || row.role, department: 'Study Birds', title: row.employeeRole || row.role, status: row.isActive === false ? 'Inactive' : 'Active', joinDate: row.createdAt, attendanceRate: null, performance: 0, salary: 0, branch: '', attendance: [], targets: [], leaveRequests: [] };
  if (resource === 'programs') return { ...base, university: label(row.university), universityId: row.university?._id || row.university, country: label(row.university?.country), city: row.university?.city || '', department: `${label(row.title)} — ${row.degreeLevel || ''} — ${row.language || ''}`, major: label(row.title), degree: row.degreeLevel || '', language: row.language || '', fees: String(row.tuition || 0), discount_fees: String(row.partnerTuition ?? row.tuition ?? 0), cashFee: Number(row.partnerTuition ?? row.tuition ?? 0), currency: row.currency || 'USD', availability: row.availability || 'Available' };
  if (resource === 'universities') return { ...base, name: label(row.name), country: label(row.country) };
  if (resource === 'scholarshipCatalog') return {...base,name:label(row.title),program_scope:label(row.title),degree:row.degree,price:row.funding,notes:row.eligibility};
  if (resource === 'messaging') return { ...base, externalUserName: row.name, externalUserId: row._id, channelType: 'website', channelName: 'Study Birds', contact: { id: base.id, name: row.name, email: row.email, phone: row.phone }, status: 'open', priority: 'medium', tags: [], assignedUserId: '', unreadCount: 0, lastMessage: {}, lastMessageAt: row.updatedAt || '' };
  if (resource === 'mail') return { ...base, id:`website:mail:${row.id}`, websiteSource:{resource:'mail',id:row.id,readOnly:true,record:row}, externalUserName:row.name || row.email, externalUserId:row.email, channelType:'email', contact:{name:row.name,email:row.email}, status:'open',priority:'medium',tags:[],assignedUserId:'',unreadCount:0,lastMessage:{text:row.subject || row.message},lastMessageAt:row.receivedAt || row.createdAt };
  return base;
}
export function mergeRecords(local, remote, resource, native = []) {
  const byId = new Map(local.map(row => [row.id,row]));
  for (const row of native) {
    const existing = byId.get(row.id);
    const stamp = row => [row.updatedAt || '',row.websiteSource?.syncedAt || ''].sort().at(-1);
    if (!existing || stamp(row) > stamp(existing)) byId.set(row.id,row);
  }
  local = [...byId.values()];
  const remaining = new Map(remote.map(row => [row.websiteSource?.id, row]));
  const merged = local.map(row => {
    const source = row.websiteSource;
    const match = source?.resource === resource && remaining.get(source.id);
    if (!match) return row;
    remaining.delete(source.id);
    if (source.nativeFeatures) return {...row,websiteSource:{...source,record:match.websiteSource.record}};
    if (source.readOnly === false) return {...row,...(resource === 'financials' ? {paid:match.paid,balance:match.balance,computedStatus:match.computedStatus} : resource === 'applications' ? {status:match.status} : {name:match.name,email:match.email}),websiteSource:{...match.websiteSource,readOnly:false}};
    return { ...row, ...match, id: row.id };
  });
  return [...merged, ...remaining.values()];
}
