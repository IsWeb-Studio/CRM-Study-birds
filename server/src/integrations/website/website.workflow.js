import { createHash, randomUUID } from 'node:crypto';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const requestTypes = ['applications', 'services', 'housing', 'arrival', 'consultations', 'scholarships', 'support', 'agencies', 'verification', 'payouts', 'events', 'parents', 'financials'];
const websiteId = id => { if (!/^[a-f\d]{24}$/i.test(id || '')) throw fail('معرّف الموقع غير صالح.'); return id; };
const name = row => row?.student?.name || row?.agent?.name || row?.partner?.name || row?.parent?.name || row?.name || 'طلب موقع';
const value = input => typeof input === 'string' ? input : input?.name || input?.title || '';
const activeUser = (db, companyId, id) => db.users?.find(user => user.id === id && user.companyId === companyId && user.isActive !== false && user.status !== 'inactive');

export function observeWebsiteRows(db, companyId, resource, rows, { notify = true } = {}) {
  db.websiteInbox ||= [];
  db.websiteSyncState ||= {};
  db.userNotifications ||= [];
  const stateKey = `${companyId}:${resource}`;
  const initial = !db.websiteSyncState[stateKey];
  const policy = db.websiteSyncSettings?.[companyId] || {};
  const recipients = (policy.recipients || []).filter(id => activeUser(db, companyId, id));
  const previous = new Map(db.websiteInbox.filter(row => row.companyId === companyId && row.resource === resource).map(row => [row.websiteId, row]));
  let newCount = 0;
  for (const remote of rows) {
    if (!/^[a-f\d]{24}$/i.test(remote._id || '')) continue;
    const existing = previous.get(remote._id);
    refreshLinkedSnapshot(db, companyId, resource, remote);
    const snapshot = { name: name(remote), title: value(remote.program) || remote.serviceTitle || remote.subject || value(remote.scholarship), status: remote.detailedStatus || remote.status || '', websiteCreatedAt: remote.createdAt || '', observedAt: new Date().toISOString() };
    if (existing) { Object.assign(existing, snapshot); continue; }
    const index = db.websiteInbox.filter(row => row.companyId === companyId).length;
    const ownerId = policy.autoAssign && recipients.length ? recipients[index % recipients.length] : '';
    const entry = { id: randomUUID(), companyId, resource, websiteId: remote._id, ownerId, source: 'study-birds', ...snapshot };
    db.websiteInbox.push(entry);
    newCount++;
    if (!initial && notify) for (const userId of ownerId ? [ownerId] : recipients) {
      db.userNotifications.unshift({ id: randomUUID(), companyId, userId, title: 'طلب جديد من الموقع', message: `${snapshot.name} — ${snapshot.title || resource}`, readAt: '', createdAt: new Date().toISOString(), metadata: { type: 'website-request', resource, websiteId: remote._id, link: `/website?resource=${resource}&id=${remote._id}` } });
    }
  }
  // Absence from a limited website response never deletes historical CRM entries.
  db.websiteSyncState[stateKey] = { checkedAt: new Date().toISOString(), received: rows.length, initialBaseline: initial };
  return { received: rows.length, newCount, initialBaseline: initial };
}

function refreshLinkedSnapshot(db, companyId, resource, remote) {
  const link = db.websiteRecordLinks?.find(row => row.companyId === companyId && row.resource === resource && row.websiteId === remote._id);
  const target = link && db[link.target]?.find(row => row.id === link.localId && row.companyId === companyId);
  // Never overwrite independent CRM data, including explicitly linked legacy students.
  if (!target?.websiteSource?.readOnly || target.websiteSource.id !== remote._id) return;
  if (resource === 'applications') Object.assign(target, { status: remote.detailedStatus || remote.status, university: value(remote.university), program: value(remote.program), updatedAt: remote.updatedAt || new Date().toISOString() });
  if (resource === 'financials') {
    const total = Number(remote.amount || 0), paid = remote.status === 'paid' ? total : 0;
    Object.assign(target, { total, paid, balance: Math.max(0, total - paid), status: remote.status });
    Object.assign(target.websiteSource, { paid, status: remote.status });
  }
}

export function linkWebsiteRecord(db, companyId, resource, remote, actorId) {
  websiteId(remote._id);
  if (!['students', 'applications', 'financials', 'events'].includes(resource)) throw fail('هذا النوع لا يدعم الربط بقسم مستقل.');
  db.websiteRecordLinks ||= [];
  const existingLink = db.websiteRecordLinks.find(link => link.companyId === companyId && link.resource === resource && link.websiteId === remote._id);
  if (existingLink) { refreshLinkedSnapshot(db, companyId, resource, remote); return { ...existingLink, alreadyLinked: true }; }
  db.students ||= []; db.applications ||= []; db.invoices ||= []; db.leads ||= [];
  const timestamp = new Date().toISOString();
  let target;
  if (resource === 'events') {
    target = { id: randomUUID(), companyId, name: remote.name || '', phone: remote.phone || '', email: remote.email || '', country: remote.currentCountry || '', targetCountry: remote.desiredStudyCountry || '', program: remote.fieldOfInterest || '', targetMajor: remote.fieldOfInterest || '', source: 'Study Birds event', stage: 'Initial Inquiry', priority: 'Medium', consultantId: '', documents: [], notes: '', createdAt: remote.createdAt || timestamp, updatedAt: timestamp, websiteSource: { resource, id: remote._id, readOnly: true } };
    db.leads.push(target);
  } else {
    const remoteStudent = resource === 'students' ? remote : remote.student;
    if (!remoteStudent?._id) throw fail('بيانات الطالب غير مكتملة؛ لم يتم الربط.');
    let student = db.students.find(row => row.companyId === companyId && row.websiteSource?.resource === 'students' && row.websiteSource.id === remoteStudent._id);
    if (!student) {
      student = { id: randomUUID(), companyId, name: remoteStudent.name || '', email: remoteStudent.email || '', phone: remoteStudent.phone || '', nationality: remote.applicantProfile?.nationality || '', consultantId: '', createdAt: remoteStudent.createdAt || timestamp, websiteSource: { resource: 'students', id: remoteStudent._id, readOnly: true } };
      db.students.push(student);
      db.websiteRecordLinks.push({ companyId, resource: 'students', websiteId: remoteStudent._id, target: 'students', localId: student.id, linkedBy: actorId, linkedAt: timestamp });
    }
    target = student;
    if (resource === 'applications') {
      target = { id: randomUUID(), companyId, studentId: student.id, university: value(remote.university), program: value(remote.program), country: value(remote.university?.country), status: remote.detailedStatus || remote.status || '', intake: remote.applicantProfile?.intake || '', assignedTo: '', documentProgress: 0, documents: [], followUpProgress: [], notes: '', createdAt: remote.createdAt || timestamp, updatedAt: timestamp, websiteSource: { resource, id: remote._id, readOnly: true } };
      db.applications.push(target);
    } else if (resource === 'financials') {
      const paid = remote.status === 'paid' ? Number(remote.amount || 0) : 0;
      target = { id: randomUUID(), companyId, studentId: student.id, number: remote.invoiceNumber || `WEB-${remote._id}`, description: remote.description || '', total: Number(remote.amount || 0), paid, balance: Math.max(0, Number(remote.amount || 0) - paid), currency: remote.currency || 'USD', status: remote.status || 'unpaid', installments: [], payments: [], createdAt: remote.createdAt || timestamp, websiteSource: { resource, id: remote._id, readOnly: true, paid, status: remote.status } };
      db.invoices.push(target);
    }
  }
  const link = { companyId, resource, websiteId: remote._id, target: resource === 'financials' ? 'invoices' : resource === 'events' ? 'leads' : resource, localId: target.id, linkedBy: actorId, linkedAt: timestamp };
  if (!db.websiteRecordLinks.some(row => row.companyId === companyId && row.resource === resource && row.websiteId === remote._id)) db.websiteRecordLinks.push(link);
  return link;
}

export function createWebsiteWorkflow({ client, readDb, mutateDb }) {
  const flights = new Map();
  async function synchronize(companyId) {
    if (!companyId) throw fail('اختر شركة CRM للمزامنة.');
    if (flights.has(companyId)) return flights.get(companyId);
    const flight = (async () => {
      const db = await readDb();
      if (!db.companies?.some(company => company.id === companyId)) throw fail('شركة غير موجودة.');
      const policy = db.websiteSyncSettings?.[companyId] || {};
      const resources = Array.isArray(policy.resources) ? policy.resources : requestTypes;
      const results = [];
      for (const resource of resources) {
        try {
          const data = await client.resource(resource);
          const result = await mutateDb(db => observeWebsiteRows(db, companyId, resource, data.rows));
          results.push({ resource, ok: true, ...result });
        } catch (error) { results.push({ resource, ok: false, message: error.message }); }
      }
      await mutateDb(db => { db.websiteSyncResults ||= {}; db.websiteSyncResults[companyId] = { at: new Date().toISOString(), results }; });
      return results;
    })();
    flights.set(companyId, flight);
    try { return await flight; } finally { flights.delete(companyId); }
  }
  async function link(companyId, resource, id, actorId) {
    websiteId(id);
    let remote;
    if (resource === 'students' || resource === 'applications') {
      remote = await client.detail(resource, id);
      if (resource === 'students') remote = remote.student || remote;
    } else {
      const data = await client.resource(resource);
      remote = data.rows.find(row => row._id === id);
    }
    if (!remote) throw fail('السجل غير موجود ضمن البيانات المتاحة.', 404);
    return mutateDb(db => linkWebsiteRecord(db, companyId, resource, remote, actorId));
  }
  return { synchronize, link };
}

export function mountWebsiteWorkflow(app, { allowModule, allowRoles, client, readDb, mutateDb }) {
  const access = allowModule('website');
  const manage = allowRoles('admin', 'management');
  const workflow = createWebsiteWorkflow({ client, readDb, mutateDb });
  const wrap = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
  app.get('/api/integrations/website/workflow', access, wrap(async (req, res) => {
    const db = await readDb(), companyId = req.user.companyId;
    res.json({ settings: db.websiteSyncSettings?.[companyId] || { autoAssign: false, resources: requestTypes, recipients: [], identities: {} }, inbox: (db.websiteInbox || []).filter(row => row.companyId === companyId), links: (db.websiteRecordLinks || []).filter(row => row.companyId === companyId), users: (db.users || []).filter(row => row.companyId === companyId && row.isActive !== false).map(({ id, name, role }) => ({ id, name, role })), lastSync: db.websiteSyncResults?.[companyId] || null });
  }));
  app.get('/api/integrations/website/mail', access, wrap(async (req, res) => res.json((await readDb()).websiteContactMail?.filter(row => row.companyId === req.user.companyId).slice(-100).reverse() || [])));
  app.post('/api/integrations/website/capabilities', access, manage, wrap(async (_req, res) => {
    const results = await Promise.all(requestTypes.map(async resource => {
      try { const data = await client.resource(resource); return { resource, ok: true, received: data.rows.length, completeness: data.completeness }; }
      catch (error) { return { resource, ok: false, message: error.message }; }
    })); res.json(results);
  }));
  app.put('/api/integrations/website/workflow/settings', access, manage, wrap(async (req, res) => {
    const { resources = requestTypes, recipients = [], autoAssign = false, identities = {} } = req.body;
    if (!Array.isArray(resources) || resources.some(key => !requestTypes.includes(key)) || !Array.isArray(recipients) || typeof autoAssign !== 'boolean' || !identities || Array.isArray(identities) || typeof identities !== 'object') throw fail('إعدادات غير صالحة.');
    const settings = await mutateDb(db => {
      for (const id of [...recipients, ...Object.keys(identities)]) if (!activeUser(db, req.user.companyId, id)) throw fail('اختر موظفًا نشطًا من نفس الشركة.');
      for (const id of Object.values(identities)) if (id) websiteId(id);
      db.websiteSyncSettings ||= {};
      db.websiteSyncSettings[req.user.companyId] = { resources: [...new Set(resources)], recipients: [...new Set(recipients)], autoAssign, identities };
      return db.websiteSyncSettings[req.user.companyId];
    });
    res.json(settings);
  }));
  app.post('/api/integrations/website/sync', access, manage, wrap(async (req, res) => res.json(await workflow.synchronize(req.user.companyId))));
  app.post('/api/integrations/website/link/:resource/:id', access, manage, wrap(async (req, res) => res.json(await workflow.link(req.user.companyId, req.params.resource, req.params.id, req.user.sub))));
  app.patch('/api/integrations/website/inbox/:id/owner', access, manage, wrap(async (req, res) => {
    const result = await mutateDb(db => {
      const entry = db.websiteInbox?.find(row => row.id === req.params.id && row.companyId === req.user.companyId);
      if (!entry) throw fail('طلب غير موجود.', 404);
      if (req.body.ownerId && !activeUser(db, req.user.companyId, req.body.ownerId)) throw fail('اختر موظفًا نشطًا.');
      entry.ownerId = req.body.ownerId || '';
      return entry;
    }); res.json(result);
  }));
  return workflow;
}

export function startWebsitePolling(workflow, env = process.env) {
  if (env.STUDY_BIRDS_SYNC_ENABLED !== 'true' || !env.STUDY_BIRDS_COMPANY_ID) return () => {};
  const interval = Math.max(60000, Number(env.STUDY_BIRDS_SYNC_INTERVAL_MS) || 120000);
  const timer = setInterval(() => { workflow.synchronize(env.STUDY_BIRDS_COMPANY_ID).catch(error => console.error('Website polling failed:', error.message)); }, interval);
  timer.unref?.();
  return () => clearInterval(timer);
}

// Signed inbound email relay for a mailbox integration (e.g. a mail rule/provider webhook).
// Reads the existing contact mailbox; requires no modification to the website form.
export function mountWebsiteEmail(app, { mutateDb }, env = process.env) {
  app.post('/api/integrations/website/mail', async (req, res, next) => {
    try {
      const secret = env.STUDY_BIRDS_MAIL_SECRET;
      if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw fail('غير مصرح.', 401);
      const { messageId, name = '', email = '', phone = '', subject = '', message = '' } = req.body;
      if (typeof messageId !== 'string' || !messageId || messageId.length > 300 || [name, email, phone, subject, message].some(v => typeof v !== 'string') || message.length > 20000 || !env.STUDY_BIRDS_COMPANY_ID) throw fail('رسالة غير صالحة.');
      const sourceId = createHash('sha256').update(messageId).digest('hex');
      const data = await mutateDb(db => {
        if (!db.companies?.some(row => row.id === env.STUDY_BIRDS_COMPANY_ID)) throw fail('شركة البريد غير مضبوطة.');
        db.websiteContactMail ||= [];
        const existing = db.websiteContactMail.find(row => row.sourceId === sourceId && row.companyId === env.STUDY_BIRDS_COMPANY_ID);
        if (existing) return { id: existing.id, duplicate: true };
        const row = { id: randomUUID(), companyId: env.STUDY_BIRDS_COMPANY_ID, sourceId, name, email, phone, subject, message, status: 'new', receivedAt: new Date().toISOString() };
        db.websiteContactMail.push(row);
        return { id: row.id, duplicate: false };
      }); res.status(201).json(data);
    } catch (error) { next(error); }
  });
}
