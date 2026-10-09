import { randomUUID } from 'node:crypto';
// Website records remain in the website database. This gateway never imports or deletes CRM records.
export const websiteResources = {
  applications: { label: 'طلبات القبول', path: '/applications', detail: '/applications', actions: { status: { method: 'PUT', suffix: '/status', fields: ['detailedStatus', 'note'] }, assignment: { method: 'PATCH', suffix: '/assignment', fields: ['advisorId', 'dueAt', 'version'] }, journey: { method: 'PATCH', suffix: '/post-admission', fields: ['stage', 'status', 'note', 'dueAt', 'reference', 'version', 'studiesStartAt'] }, visa: { method: 'PATCH', suffix: '/visa-case', fields: ['status', 'requirements', 'appointmentDate', 'appointmentLocation', 'insuranceProvider', 'insurancePolicyNumber', 'insuranceExpiresAt', 'notes', 'version'] }, requestDocument: { method: 'POST', suffix: '/document-requests', fields: ['type', 'note'] } } },
  students: { label: 'طلاب الموقع', path: '/admin/students', detail: '/admin/students' },
  services: { label: 'طلبات الخدمات', path: '/service-requests', detail: '/service-requests', actions: { update: { method: 'PATCH', fields: ['status', 'assignedTo', 'staffNote', 'expectedVersion'] }, driver: { method: 'PATCH', suffix: '/driver', fields: ['name', 'phone', 'vehicleType', 'vehicleNumber', 'etaMinutes'] } } },
  housing: { label: 'حجوزات السكن', path: '/admin/accommodation-bookings', actions: { update: { method: 'PATCH', fields: ['status', 'staffNote', 'version'] } } },
  arrival: { label: 'الوصول واستقبال المطار', path: '/admin/student-arrival-requests', actions: { update: { method: 'PATCH', fields: ['status', 'adminNote', 'travelAlert', 'pickup'] } } },
  consultations: { label: 'حجوزات الاستشارات', path: '/consultations/staff/bookings', actions: { outcome: { method: 'PUT', suffix: '/outcome', fields: ['version', 'result', 'summary', 'nextSteps'] } } },
  scholarships: { label: 'طلبات المنح', path: '/scholarships/entries', actions: { status: { method: 'PATCH', path: '/scholarships', suffix: '/status', fields: ['status'] } } },
  support: { label: 'تذاكر الدعم', path: '/admin/support-tickets', actions: { reply: { method: 'PATCH', suffix: '/reply', fields: ['message', 'status'] }, assign: { method: 'PATCH', suffix: '/assign', fields: ['assignedTo'] } } },
  agencies: { label: 'طلبات الوكالة', path: '/admin/agency-requests', actions: { status: { method: 'PATCH', fields: ['status', 'adminNote'] } } },
  agents: { label: 'الوكلاء', path: '/admin/partners', detail: '/admin/partners' },
  agentStudents: { label: 'طلاب الوكلاء', path: '/admin/partner-students', actions: { status: { method: 'PATCH', fields: ['applicationStatus', 'notes'] } } },
  verification: { label: 'توثيق الوكلاء', path: '/admin/verification-documents', actions: { review: { method: 'PATCH', fields: ['status', 'reviewNote'] } } },
  payouts: { label: 'طلبات السحب', path: '/admin/payout-requests', actions: { review: { method: 'PATCH', fields: ['status', 'reviewNote'] } } },
  financials: { label: 'فواتير الموقع', path: '/admin/student-financials', collection: 'invoices' },
  paymentProofs: { label: 'إثباتات الدفع', path: '/admin/student-financials', collection: 'paymentProofs' },
  documents: { label: 'مستندات الطلاب', path: '/admin/student-documents', actions: { review: { method: 'PATCH', fields: ['detailedStatus', 'reviewNote', 'version'] } } },
  visaCases: { label: 'ملفات التأشيرة', path: '/applications/visa-cases' },
  housingListings: { label: 'خيارات السكن', path: '/admin/accommodation-listings' },
  events: { label: 'تسجيلات الفعاليات', path: '/admin/event-registrations' },
  parents: { label: 'طلبات ربط ولي الأمر', path: '/admin/parent-links', actions: { status: { method: 'PATCH', fields: ['status'] } } },
  orientation: { label: 'نتائج اختبار التوجيه', path: '/admin/student-orientation-results' },
  favorites: { label: 'اهتمامات الطلاب', path: '/admin/student-favorites' },
  community: { label: 'بلاغات المجتمع', path: '/admin/community-reports' },
};

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export function websiteConfig(env = process.env) {
  const enabled = env.STUDY_BIRDS_ENABLED === 'true';
  const raw = String(env.STUDY_BIRDS_API_URL || '').trim();
  const token = String(env.STUDY_BIRDS_API_TOKEN || '').trim();
  if (!enabled) return { enabled: false, ready: false };
  let url;
  try { url = new URL(raw); } catch { throw fail('اضبط عنوان API الموقع في إعدادات خادم CRM.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw fail('اتصال الموقع يتطلب HTTPS.');
  if (url.username || url.password || url.search || url.hash) throw fail('عنوان الموقع يجب ألا يحتوي بيانات دخول أو معاملات.');
  return { enabled, ready: Boolean(token), baseUrl: `${url.origin}${url.pathname.replace(/\/$/, '')}`, token };
}

export function createWebsiteClient({ config = () => websiteConfig(), fetchImpl = fetch } = {}) {
  let cachedCatalog;
  let cacheUntil = 0;
  let catalogFlight;
  async function request(path, { method = 'GET', body } = {}) {
    const c = config();
    if (!c.enabled || !c.ready) throw fail('ربط الموقع غير مفعّل أو رمز الاتصال غير مضبوط.', 503);
    if (!/^\/[a-z][a-z0-9/?=&._-]*$/i.test(path)) throw fail('مسار غير مسموح.');
    let response;
    try {
      response = await fetchImpl(`${c.baseUrl}${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw fail('تعذر الاتصال بالموقع. حاول مرة أخرى؛ لم تُغيّر بيانات CRM.', 502); }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw fail(response.status === 401 ? 'انتهت صلاحية رمز الموقع؛ حدّثه على خادم CRM.' : response.status === 403 ? 'حساب اتصال الموقع لا يملك صلاحية هذا القسم.' : String(data?.message || 'فشل تنفيذ الإجراء على الموقع.'), response.status >= 400 && response.status < 500 ? response.status : 502);
    if (data === null) throw fail('استجابة الموقع ليست JSON صالحًا.', 502);
    return data;
  }
  async function list(path, collection) {
    const rows = [];
    for (let page = 1; page <= 500; page++) {
      const data = await request(`${path}${path.includes('?') ? '&' : '?'}page=${page}&limit=100`);
      if (Array.isArray(data)) return { rows: data, paginated: false };
      const items = collection ? data[collection] : data.items || data.data;
      if (!Array.isArray(items)) throw fail('صيغة قائمة الموقع غير متوقعة.', 502);
      rows.push(...items);
      const meta = data.pagination;
      if (!meta || !(meta.hasNextPage || page < Number(meta.totalPages || 1))) return { rows, paginated: Boolean(meta) };
    }
    throw fail('القائمة تتجاوز حد القراءة؛ لم يتم اعتماد قائمة جزئية.', 502);
  }
  async function catalog(refresh = false) {
    if (!refresh && cachedCatalog && Date.now() < cacheUntil) return cachedCatalog;
    if (catalogFlight) return catalogFlight;
    catalogFlight = (async () => {
      const [countries, universities, programs] = await Promise.all([list('/content/countries'), list('/universities'), list('/programs')]);
      const universityIndex = new Map(universities.rows.map(row => [row._id, row]));
      const name = value => typeof value === 'string' ? value : value?.ar || value?.en || '';
      const mapped = {
        countries: countries.rows.map(row => ({ id: row._id, name: name(row.name), code: row.code || '' })),
        universities: universities.rows.map(row => ({ id: row._id, name: row.name, country: name(row.country?.name), city: row.city || '', logo: row.logo || '', website: row.website || '' })),
        programs: programs.rows.map(row => {
          const u = typeof row.university === 'object' ? row.university : universityIndex.get(row.university);
          // The selection label includes variants; id always remains the website id.
          const department = [row.title, row.degreeLevel, row.language].filter(Boolean).join(' — ');
          return { id: row._id, source: 'study-birds', title: row.title, universityId: u?._id, university: u?.name || '', country: name(u?.country?.name), city: u?.city || '', department, program: department, degree: row.degreeLevel || '', language: row.language || '', fees: row.tuition ?? '', discount_fees: row.partnerTuition ?? '', currency: 'USD' };
        }), scholarships: [], source: 'study-birds', fetchedAt: new Date().toISOString(),
      };
      cachedCatalog = mapped;
      cacheUntil = Date.now() + 60000;
      return mapped;
    })();
    try { return await catalogFlight; } finally { catalogFlight = null; }
  }
  async function resource(key) {
    const def = websiteResources[key];
    if (!def) throw fail('قسم غير معروف.', 404);
    const result = await list(def.path, def.collection);
    return { ...result, source: 'study-birds', fetchedAt: new Date().toISOString(), completeness: result.paginated ? 'paginated' : 'endpoint-limit', detailSupported: Boolean(def.detail), actions: def.actions || {} };
  }
  async function detail(key, id) {
    assertId(id);
    const def = websiteResources[key];
    if (!def?.detail) throw fail('هذا القسم لا يدعم قراءة التفاصيل.', 404);
    return request(`${def.detail}/${id}`);
  }
  async function action(key, id, actionName, payload) {
    assertId(id);
    const def = websiteResources[key];
    const operation = def?.actions?.[actionName];
    if (!operation) throw fail('إجراء غير مسموح.', 404);
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw fail('بيانات الإجراء غير صالحة.');
    const keys = Object.keys(payload);
    if (!keys.length || keys.some(key => !operation.fields.includes(key))) throw fail('الإجراء يحتوي حقولًا غير مسموحة.');
    return request(`${operation.path || def.path}/${id}${operation.suffix || ''}`, { method: operation.method, body: payload });
  }
  async function studentService(id, kind, payload) {
    assertId(id);
    if (!['insurance', 'equivalency'].includes(kind)) throw fail('خدمة غير معروفة.', 404);
    const allowed = kind === 'insurance' ? ['status', 'provider', 'policyNumber', 'coverage', 'notes', 'startDate', 'endDate', 'cardFileUrl'] : ['status', 'authority', 'applicationNumber', 'notes', 'fees', 'submittedAt', 'expectedCompletionDate', 'resultFileUrl', 'requiredDocuments'];
    if (payload && (Array.isArray(payload) || Object.keys(payload).some(key => !allowed.includes(key)))) throw fail('حقول خدمة غير صالحة.');
    return request(`/admin/students/${id}/${kind}`, payload ? { method: 'PUT', body: payload } : {});
  }
  async function attachment(kind, id) {
    assertId(id);
    if (!['documents', 'payment-proofs', 'support-attachments'].includes(kind)) throw fail('نوع ملف غير مسموح.');
    return request(`/${kind}/${id}/access`, { method: 'POST' });
  }
  return { request, catalog, resource, detail, action, studentService, attachment };
}
function assertId(id) { if (!/^[a-f\d]{24}$/i.test(id || '')) throw fail('معرّف الموقع غير صالح.'); }

export function mountWebsiteRoutes(app, { allowModule, client, readDb, mutateDb }) {
  const access = allowModule('website');
  const wrap = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
  app.get('/api/integrations/website/status', access, wrap(async (_req, res) => {
    const c = websiteConfig();
    res.json({ enabled: c.enabled, ready: c.ready, apiUrl: c.baseUrl || '', resources: Object.entries(websiteResources).map(([key, value]) => ({ key, label: value.label })), writesEnabled: process.env.STUDY_BIRDS_ALLOW_WRITES === 'true', limitations: ['contact-email', 'messaging-participants', 'endpoint-limits'] });
  }));
  app.post('/api/integrations/website/test', access, wrap(async (_req, res) => {
    const user = await client.request('/auth/me');
    const catalog = await client.catalog(true);
    res.json({ connected: true, role: user.user?.role || user.role, countries: catalog.countries.length, universities: catalog.universities.length, programs: catalog.programs.length, checkedAt: catalog.fetchedAt });
  }));
  app.get('/api/integrations/website/catalog', access, wrap(async (_req, res) => res.json(await client.catalog())));
  app.get('/api/integrations/website/students/:id/:kind', access, wrap(async (req, res) => res.json(await client.studentService(req.params.id, req.params.kind))));
  app.post('/api/integrations/website/files/:kind/:id', access, wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await client.attachment(req.params.kind, req.params.id));
  }));
  app.get('/api/integrations/website/requests/:resource', access, wrap(async (req, res) => res.json(await client.resource(req.params.resource))));
  app.get('/api/integrations/website/requests/:resource/:id', access, wrap(async (req, res) => res.json(await client.detail(req.params.resource, req.params.id))));
  app.post('/api/integrations/website/requests/:resource/:id/:action', access, wrap(async (req, res) => {
    if (process.env.STUDY_BIRDS_ALLOW_WRITES !== 'true') throw fail('تعديل بيانات الموقع غير مفعّل على خادم CRM.', 403);
    const id = randomUUID();
    // Record intent before the remote operation. Never retry a write automatically.
    await mutateDb(db => {
      db.websiteIntegrationLog ||= [];
      db.websiteIntegrationLog.unshift({ id, companyId: req.user.companyId, userId: req.user.sub, resource: req.params.resource, websiteId: req.params.id, action: req.params.action, status: 'pending', at: new Date().toISOString() });
      db.websiteIntegrationLog = db.websiteIntegrationLog.slice(0, 1000);
    });
    try {
      const data = await client.action(req.params.resource, req.params.id, req.params.action, req.body);
      await mutateDb(db => { const log = db.websiteIntegrationLog.find(row => row.id === id); if (log) log.status = 'completed'; });
      res.json(data);
    } catch (error) {
      await mutateDb(db => { const log = db.websiteIntegrationLog.find(row => row.id === id); if (log) { log.status = 'failed-or-unconfirmed'; log.message = error.message; } });
      throw error;
    }
  }));
  app.get('/api/integrations/website/log', access, wrap(async (req, res) => res.json((await readDb()).websiteIntegrationLog?.filter(row => row.companyId === req.user.companyId).slice(0, 100) || [])));
}
