import {conversationKey,updateConversationWorkspace} from './conversationWorkspace.js';
import {loadCatalogSnapshot} from './catalogSnapshot.js';
import { materializeWebsiteRows, nativeResources } from './nativeRecords.js';
import { randomUUID,createHash } from 'node:crypto';
import { canOpenModule } from '../../auth.js';
import {canWriteResource} from './writePolicy.js';
import multer from 'multer';
import { resourceModules, websiteSections } from './website.sections.js';
// Website records remain in the website database. This gateway never imports or deletes CRM records.
export const websiteResources = {
  applications: { label: 'طلبات القبول', path: '/applications', detail: '/applications', actions: { status: { method: 'PUT', suffix: '/status', fields: ['detailedStatus', 'note','version'] }, assignment: { method: 'PATCH', suffix: '/assignment', fields: ['advisorId', 'dueAt', 'version'] }, journey: { method: 'PATCH', suffix: '/post-admission', fields: ['stage', 'status', 'note', 'dueAt', 'reference', 'version', 'studiesStartAt'] }, visa: { method: 'PATCH', suffix: '/visa-case', fields: ['status', 'requirements', 'appointmentDate', 'appointmentLocation', 'insuranceProvider', 'insurancePolicyNumber', 'insuranceExpiresAt', 'notes', 'version'] }, requestDocument: { method: 'POST', suffix: '/document-requests', fields: ['type', 'note'] } } },
  students: { label: 'طلاب الموقع', path: '/admin/students', detail: '/admin/students',account:true,editPath:'/crm/accounts',editMethod:'PATCH',editFields:['name','email','password','isActive','phone','nationality','englishFullName','passportNumber','dateOfBirth','gpa','bio','address','intake','nativeLanguage','currentEducation','currentEducationLevel','currentResidenceCountry','currentResidenceRegion','otherLanguages','targetCountries','parentInfo','emergencyContact','englishTest'] },
  services: { label: 'طلبات الخدمات', path: '/service-requests', detail: '/service-requests', actions: { update: { method: 'PATCH', fields: ['status', 'assignedTo', 'staffNote', 'expectedVersion'] }, driver: { method: 'PATCH', suffix: '/driver', fields: ['name', 'phone', 'vehicleType', 'vehicleNumber', 'etaMinutes'] } } },
  housing: { label: 'حجوزات السكن', path: '/admin/accommodation-bookings', actions: { update: { method: 'PATCH', fields: ['status', 'staffNote', 'version'] } } },
  arrival: { label: 'الوصول واستقبال المطار', path: '/admin/student-arrival-requests', actions: { update: { method: 'PATCH', fields: ['status', 'adminNote', 'travelAlert', 'pickup'] } } },
  consultationSlots: {label:'مواعيد المستشارين',path:'/consultations/staff/slots',createFields:['advisorId','startsAt','mode','meetingUrl','instructions'],actions:{availability:{method:'PATCH',fields:['version','enabled']}}},
  consultations: { label: 'حجوزات الاستشارات', path: '/consultations/staff/bookings', actions: { cancel:{method:'POST',path:'/consultations/bookings',suffix:'/cancel',fields:['version']}, outcome: { method: 'PUT', suffix: '/outcome', fields: ['version', 'result', 'summary', 'nextSteps'] } } },
  scholarships: { label: 'طلبات المنح', path: '/scholarships/entries', actions: { status: { method: 'PATCH', path: '/scholarships', suffix: '/status', fields: ['status'] } } },
  support: { label: 'تذاكر الدعم', path: '/admin/support-tickets', actions: { escalate:{method:'PATCH',suffix:'/escalate',fields:['escalated','escalationNote']},emergency:{method:'PATCH',suffix:'/emergency',fields:['isEmergency']}, reply: { method: 'PATCH', suffix: '/reply', fields: ['message', 'status'] }, assign: { method: 'PATCH', suffix: '/assign', fields: ['assignedTo'] } } },
  agencies: { label: 'طلبات الوكالة', path: '/admin/agency-requests', actions: { status: { method: 'PATCH', fields: ['status', 'adminNote'] } } },
  agents: { label: 'الوكلاء', path: '/admin/partners', detail: '/admin/partners',account:true,editPath:'/crm/partners',editMethod:'PATCH',editFields:['name','email','isActive','phone','companyName','website','location','taxId','bio','address','version'] },
  agentStudents: { label: 'طلاب الوكلاء', path: '/admin/partner-students', actions: { status: { method: 'PATCH', fields: ['applicationStatus', 'notes'] } } },
  verification: { label: 'توثيق الوكلاء', path: '/admin/verification-documents', actions: { review: { method: 'PATCH', fields: ['status', 'reviewNote'] } } },
  payouts: { label: 'طلبات السحب', path: '/admin/payout-requests', actions: { review: { method: 'PATCH', fields: ['status', 'reviewNote'] } } },
  financials: { label: 'فواتير الموقع', path: '/admin/student-financials', collection: 'invoices', createPath: '/admin/student-financials/invoices', createFields: ['studentId', 'invoiceNumber', 'description', 'amount', 'dueDate', 'invoiceUrl', 'category', 'adminNote'], actions: { update: { method: 'PATCH', path: '/admin/student-financials/invoices', fields: ['invoiceNumber', 'description', 'amount', 'dueDate', 'status', 'invoiceUrl', 'category', 'adminNote','version'] } } },
  paymentProofs: { label: 'إثباتات الدفع', path: '/admin/student-financials', collection: 'paymentProofs', actions: { review: { method: 'PATCH', path: '/admin/student-financials/payment-proofs', fields: ['status', 'reviewNote'] } } },
  documents: { label: 'مستندات الطلاب', path: '/admin/student-documents', actions: { review: { method: 'PATCH', fields: ['detailedStatus', 'reviewNote', 'version'] } } },
  visaCases: { label: 'ملفات التأشيرة', path: '/applications/visa-cases' },
  housingListings: { label: 'خيارات السكن', path: '/admin/accommodation-listings',deletable:true,editFields:['title','type','university','distanceFromCampusKm','amenities','price','currency','rules','capacity','isActive'] },
  events: { label: 'تسجيلات الفعاليات', path: '/admin/event-registrations' },
  parents: { label: 'طلبات ربط ولي الأمر', path: '/admin/parent-links', actions: { status: { method: 'PATCH', fields: ['status'] } } },
  orientation: { label: 'نتائج اختبار التوجيه', path: '/admin/student-orientation-results', actions: { update: { method: 'PATCH', fields: ['recommendationSummary', 'adminNote'] } } },
  favorites: { label: 'اهتمامات الطلاب', path: '/admin/student-favorites' },
  community: { label: 'بلاغات المجتمع', path: '/admin/community-reports' },
  walletEntries: { label: 'حركات محفظة الموقع', path: '/admin/student-financials/wallet-entries',createFields:['studentId','direction','amount','notes'] },
  communityPosts: { label: 'منشورات المجتمع', path: '/admin/community-posts', detail: '/admin/community-posts', actions: { update: { method: 'PATCH', fields: ['status', 'moderationNote'] } } },
  moderationLog: { label: 'سجل إشراف المجتمع', path: '/admin/community-moderation-log' },
  universityAccounts: { label: 'حسابات الجامعات', path: '/admin/university-accounts', createFields: ['name', 'email', 'password', 'universityId'], actions: { update: { method: 'PATCH', fields: ['isActive', 'linkedUniversity'] } } },
  employees: { label: 'موظفو الموقع', path: '/admin/employees',account:true,editPath:'/crm/accounts',editMethod:'PATCH',editFields:['name','email','password','isActive','employeeRole','permissions'], actions: { update: { method: 'PATCH', suffix: '/role', fields: ['employeeRole'] } } },
  employeeStats: { label: 'إحصاءات موظفي الموقع', path: '/admin/employee-stats' },
  websiteUsers: { label: 'حسابات الموقع', path: '/admin/users', actions: { update: { method: 'PATCH', fields: ['name', 'email', 'isActive'] } } },
  marketingAssets: { label: 'مواد تسويق الوكلاء', path: '/admin/marketing-assets', actions: { update: { method: 'PUT', fields: ['title', 'description', 'type', 'published'] } } },
  studyFields: { label: 'مجالات الدراسة', path: '/admin/study-fields', editFields: ['name', 'description', 'image', 'featured', 'sortOrder'] },
  testimonials: { label: 'آراء الطلاب', path: '/admin/testimonials', editFields: ['studentName', 'destination', 'quote', 'avatar', 'rating', 'featured'] },
  recognitions: { label: 'الاعتمادات', path: '/admin/recognitions', editFields: ['title', 'image', 'link', 'detailTitle', 'detailBody', 'detailImage', 'featured', 'sortOrder'] },
  exhibitions: { label: 'المقالات والمعارض', path: '/admin/exhibitions', editFields: ['title', 'summary', 'image', 'body', 'featured', 'published'] },
  pastEvents: { label: 'الفعاليات السابقة', path: '/admin/past-events', editFields: ['title', 'category', 'eventDate', 'countryCode', 'summary', 'coverImage', 'featured', 'sortOrder'] },
  upcomingEvent: { label: 'الفعالية القادمة', path: '/admin/upcoming-event', singleton: true, editFields: ['title', 'subtitle', 'eventType', 'eventDate', 'ctaText', 'backgroundImage', 'isPublished'] },
  ourStory: { label: 'من نحن', path: '/admin/our-story', singleton: true, editFields: ['heroEyebrow', 'heroTitle', 'heroBody', 'heroImage', 'heroCtaText', 'heroCtaLink', 'storyTitle', 'storyBody', 'storyImage', 'missionTitle', 'missionBody', 'visionTitle', 'visionBody'] },
  siteSettings: { label: 'إعدادات الموقع', path: '/admin/site-settings', singleton: true, editFields: ['contactEmail', 'whatsappUrl', 'facebookUrl', 'instagramUrl', 'tiktokUrl', 'britishMembershipUrl', 'supportHours', 'officeLocations', 'leadCapturePromptEnabled'] },
  countries: { label: 'إدارة الدول', path: '/admin/countries', editFields: ['name', 'code', 'heroTitle', 'heroSubtitle', 'heroImage', 'description'] },
  universities: { label: 'إدارة الجامعات', path: '/universities', detail: '/universities', editFields: ['name', 'country', 'city', 'language', 'overview', 'logo', 'campusImages','studentCount','specialtyCount','ranking','tuitionRange','requiredDocuments','accreditations','articleTitle','articleHeadings','articleBodies','featured', 'isPartnerInstitution'] },
  programs: { label: 'إدارة البرامج', path: '/programs', detail: '/programs', editFields: ['title', 'university', 'degreeLevel', 'fieldOfStudy', 'language', 'duration', 'tuition', 'partnerTuition', 'summary','fieldsOfStudy','requirements','careerOpportunities', 'requiredDocumentTypes', 'featured'] },
  scholarshipCatalog: {label:'دليل المنح',path:'/scholarships/manage',createPath:'/scholarships',editPath:'/scholarships',deletePath:'/scholarships',editFields:['title','university','country','degree','funding','eligibility','deadline','active']},
  contentServices: { label: 'محتوى الخدمات', path: '/admin/our-services', editFields: ['title', 'description', 'detailBody', 'price', 'durationDays', 'image'] },
  faqs: { label: 'الأسئلة الشائعة', path: '/admin/faqs', editFields: ['question', 'answer'] },
  knowledge: { label: 'قاعدة المعرفة', path: '/admin/knowledge-base', editFields: ['title', 'body', 'category', 'summary', 'published'] },
};


for(const key of ['universities','programs','scholarshipCatalog','countries','studyFields','testimonials','recognitions','exhibitions','pastEvents','contentServices','faqs','knowledge','applications'])websiteResources[key].deletable=true;
const mediaUploads={universities:{path:'/universities/upload-images',field:'files'},countries:{path:'/admin/countries/upload-image'},studyFields:{path:'/admin/study-fields/upload-image'},testimonials:{path:'/admin/testimonials/upload-avatar'},recognitions:{path:'/admin/recognitions/upload-image'},contentServices:{path:'/admin/our-services/upload-image'},ourStory:{path:'/admin/our-story/upload-image'},exhibitions:{path:'/admin/exhibitions/upload-image'},upcomingEvent:{path:'/admin/upcoming-event/upload-image'},pastEvents:{path:'/admin/past-events/upload-media'}};

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
  const listCache=new Map(),listFlights=new Map();
  let generation=0;
  async function request(path, { method = 'GET', body } = {}) {
    const c = config();
    if(method!=='GET'){generation++;listCache.clear();cachedCatalog=null;cacheUntil=0;}
    if (!c.enabled || !c.ready) throw fail('ربط الموقع غير مفعّل أو رمز الاتصال غير مضبوط.', 503);
    if (!/^\/[a-z][a-z0-9/?=&._-]*$/i.test(path)) throw fail('مسار غير مسموح.');
    const multipart=body instanceof FormData;
    let response;
    try {
      response = await fetchImpl(`${c.baseUrl}${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${c.token}`, Accept: 'application/json', ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
      });
    } catch { throw fail('تعذر الاتصال بالموقع. حاول مرة أخرى؛ لم تُغيّر بيانات CRM.', 502); }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw fail(response.status === 401 ? 'انتهت صلاحية رمز الموقع؛ حدّثه على خادم CRM.' : response.status === 403 ? 'حساب اتصال الموقع لا يملك صلاحية هذا القسم.' : String(data?.message || 'فشل تنفيذ الإجراء على الموقع.'), response.status === 401 ? 502 : response.status >= 400 && response.status < 500 ? response.status : 502);
    if(method!=='GET'){generation++;listCache.clear();cachedCatalog=null;cacheUntil=0;}
    if (data === null) throw fail('استجابة الموقع ليست JSON صالحًا.', 502);
    return data;
  }
  async function readList(path, collection) {
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
  async function list(path,collection){
    const c=config();if(!c.enabled || !c.ready)throw fail('ربط الموقع غير مفعّل أو رمز الاتصال غير مضبوط.',503);
    const key=JSON.stringify([c.baseUrl,createHash('sha256').update(c.token).digest('hex'),path,collection]),cached=listCache.get(key);
    if(cached && cached.expires>Date.now())return structuredClone(cached.data);
    const flightKey=JSON.stringify([key,generation]);
    if(listFlights.has(flightKey))return structuredClone(await listFlights.get(flightKey));
    const stamp=generation;
    const flight=readList(path,collection).then(data=>{if(stamp===generation)listCache.set(key,{data,expires:Date.now()+15000});return data;});
    listFlights.set(flightKey,flight);
    try{return structuredClone(await flight);}finally{listFlights.delete(flightKey);}
  }
  async function catalog(refresh = false) {
    const c=config();if(!c.enabled || !c.ready)throw fail('ربط الموقع غير مفعّل أو رمز الاتصال غير مضبوط.',503);
    if(refresh)listCache.clear();
    if (!refresh && cachedCatalog && Date.now() < cacheUntil) return cachedCatalog;
    if (catalogFlight) return catalogFlight;
    catalogFlight = (async () => {
      const results=await Promise.allSettled([list('/content/countries'),list('/universities'),list('/programs'),list('/scholarships/manage')]);
      if(results.every(result=>result.status==='rejected'))throw results[0].reason;
      const [countries,universities,programs,scholarships]=results.map(result=>result.status==='fulfilled'?result.value:{rows:[]});
      const warnings=results.flatMap((result,index)=>result.status==='rejected'?[{resource:['countries','universities','programs','scholarships'][index],message:result.reason.message,status:result.reason.status}]:[]);
      const universityIndex = new Map(universities.rows.map(row => [row._id, row]));
      const name = value => typeof value === 'string' ? value : value?.ar || value?.en || '';
      const mapped = {
        warnings, complete:!warnings.length,
        countries: countries.rows.map(row => ({ id: row._id, name: name(row.name), code: row.code || '' })),
        universities: universities.rows.map(row => ({ id: row._id, name: row.name, country: name(row.country?.name), city: row.city || '', logo: row.logo || '', website: row.website || '' })),
        programs: programs.rows.map(row => {
          const u = typeof row.university === 'object' ? row.university : universityIndex.get(row.university);
          // The selection label includes variants; id always remains the website id.
          const department = [row.title, row.degreeLevel, row.language].filter(Boolean).join(' — ');
          return { id: row._id, source: 'study-birds', title: row.title, universityId: u?._id, university: u?.name || '', country: name(u?.country?.name), city: u?.city || '', department, program: department, degree: row.degreeLevel || '', language: row.language || '', fees: row.tuition ?? '', discount_fees: row.partnerTuition ?? '', currency: 'USD' };
        }), scholarships: scholarships.rows.map(row=>({...row,id:row._id,name:row.title,program_scope:row.title,price:row.funding,websiteSource:{resource:'scholarshipCatalog',id:row._id,record:row}})), source: 'study-birds', fetchedAt: new Date().toISOString(),
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
    const result = def.singleton ? { rows: [{ ...(await request(def.path)), _id: 'singleton' }], paginated: false } : await list(def.path, def.collection);
    if (key === 'visaCases') result.rows = result.rows.map(row => ({ ...row, _id: row.applicationId }));
    return { ...result, source: 'study-birds', fetchedAt: new Date().toISOString(), completeness: result.paginated ? 'paginated' : 'endpoint-limit', singleton: Boolean(def.singleton), detailSupported: Boolean(def.detail), deletable:Boolean(def.deletable),uploadSupported:Boolean(mediaUploads[key] || key==='services'), editFields: def.editFields || [], createFields: def.singleton || def.account ? [] : def.createFields || def.editFields || [], actions: def.actions || {} };
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
  async function section(id, key) {
    assertId(id);
    if (!['assignment', 'post-admission', 'visa-case'].includes(key)) throw fail('قسم غير مسموح.');
    return request(`/applications/${id}/${key}`);
  }
  async function editResource(key, id, payload) {
    const def = websiteResources[key];
    const fields = id ? def?.editFields : def?.createFields || def?.editFields;
    if (!fields?.length) throw fail('هذا القسم لا يدعم هذا الإجراء.');
    if (id && !(def.singleton && id === 'singleton')) assertId(id);
    if (def.singleton && id !== 'singleton') throw fail('هذا القسم يدعم تعديل السجل الحالي فقط.');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Object.keys(payload).length || Object.keys(payload).some(field => !fields.includes(field))) throw fail('حقول المحتوى غير مسموحة.');
    let body = { ...payload };
    if (id && !def.account) {
      // Some website controllers rebuild the whole entity. Preserve fields outside this editor.
      const existing = def.singleton ? (await request(def.path) || {}) : def.detail ? await detail(key, id) : (await resource(key)).rows.find(row => row._id === id);
      if (!existing) throw fail('السجل غير موجود.', 404);
      body = { ...existing, ...payload };
      for (const field of ['_id', '__v', 'createdAt', 'updatedAt', 'slug', 'offeredAt', 'relatedPrograms']) delete body[field];
      if (body.country && typeof body.country === 'object') body.country = body.country._id;
      if (body.university && typeof body.university === 'object') body.university = body.university._id;
    }
    if (def.account && !id) throw fail('إنشاء الحساب من نموذج الطالب أو الموظف.');
    if (def.account && body.password === '') delete body.password;
    if (key === 'students') {
      const profileKeys=['phone','nationality','englishFullName','passportNumber','dateOfBirth','gpa','bio','address','intake','nativeLanguage','currentEducation','currentEducationLevel','currentResidenceCountry','currentResidenceRegion','otherLanguages','targetCountries','parentInfo','emergencyContact','englishTest'];
      const profile=Object.fromEntries(profileKeys.filter(field=>body[field]!==undefined).map(field=>[field,body[field]]));
      for(const field of profileKeys) delete body[field];
      if(Object.keys(profile).length)body.profile=profile;
    }
    if(key==='agents'){const keys=['phone','companyName','website','location','taxId','bio','address'];const profile=Object.fromEntries(keys.filter(field=>body[field]!==undefined).map(field=>[field,body[field]]));for(const field of keys)delete body[field];if(Object.keys(profile).length)body.profile=profile;}
    const result = await request(`${!id && def.createPath ? def.createPath : id && def.editPath ? def.editPath : def.path}${id && !def.singleton ? `/${id}` : ''}`, { method: id ? def.editMethod || 'PUT' : 'POST', body });
    cachedCatalog = null; cacheUntil = 0;
    return result;
  }
  async function deleteResource(key,id) {
    assertId(id);
    if (!websiteResources[key]?.deletable) throw fail('حذف هذا النوع غير مدعوم.',400);
    const def=websiteResources[key];
    const result = await request(`${def.deletePath || def.path}/${id}`,{method:'DELETE'});
    cachedCatalog=null;cacheUntil=0;return result;
  }
  async function uploadResource(key,id,file) {
    const target=mediaUploads[key];
    if(!target && key!=='services')throw fail('رفع الملفات غير مدعوم لهذا القسم.');
    if(!file?.buffer?.length)throw fail('اختر ملفًا.');
    if(!target)assertId(id);
    const form=new FormData();form.set(target?.field || 'file',new Blob([file.buffer],{type:file.mimetype}),file.originalname);
    return request(target?.path || `/crm/service-requests/${id}/documents`,{method:'POST',body:form});
  }
  return { uploadResource, request, catalog, resource, detail, action, studentService, attachment, section, editResource,deleteResource };
}
function assertId(id) { if (!/^[a-f\d]{24}$/i.test(id || '')) throw fail('معرّف الموقع غير صالح.'); }

export function mountWebsiteRoutes(app, { allowModule, allowAction, client, readDb, mutateDb }) {
  const access = allowModule('website');
  const allowed = (user, resource) => resourceModules(resource).some(module => canOpenModule(user, module));
  const sectionAccess = resource => (req, res, next) => {
    const key = typeof resource === 'function' ? resource(req) : resource;
    if (allowed(req.user, key)) return next();
    return res.status(403).json({ message: 'لا تملك صلاحية قسم هذا السجل.' });
  };
  const metadataAccess = (req, res, next) => {
    if (canOpenModule(req.user, 'website') || Object.keys(websiteSections).some(module => canOpenModule(req.user, module))) return next();
    return res.status(403).json({ message: 'لا تملك صلاحية أقسام الموقع.' });
  };
  const writeAccess = (req,res,next)=>{
    const resource=req.params.resource || ((req.path || '').includes('/students/')?'students':(req.path || '').includes('/messaging/')?'support':'');
    const path=req.path || '';
    const operation=req.params.action || req.params.kind || (path.endsWith('/delete')?'delete':path.includes('/uploads/')?'upload':req.method==='POST'?'create':'edit');
    if(canWriteResource(req.user,resource,operation))return next();
    return res.status(403).json({message:'لا تملك صلاحية هذا الإجراء في القسم.'});
  };
  const fileUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:0}}).single('file');
  const wrap = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
  async function remoteWrite(req, action, perform) {
    if (process.env.STUDY_BIRDS_ALLOW_WRITES !== 'true') throw fail('تعديل بيانات الموقع غير مفعّل على خادم CRM.', 403);
    const id = randomUUID();
    await mutateDb(db => {
      db.websiteIntegrationLog ||= [];
      db.websiteIntegrationLog.unshift({ id, companyId: req.user.companyId, userId: req.user.sub, resource: req.params.resource || req.params.kind || 'messaging', websiteId: req.params.id || '', action, status: 'pending', at: new Date().toISOString() });
      db.websiteIntegrationLog = db.websiteIntegrationLog.slice(0, 1000);
    });
    try {
      const data = await perform();
      await mutateDb(db => { const log = db.websiteIntegrationLog.find(row => row.id === id); if (log) log.status = 'completed'; });
      return data;
    } catch (error) {
      await mutateDb(db => { const log = db.websiteIntegrationLog.find(row => row.id === id); if (log) { log.status = 'failed-or-unconfirmed'; log.message = error.message; } });
      throw error;
    }
  }
  app.get('/api/integrations/website/status', metadataAccess, wrap(async (req, res) => {
    const c = websiteConfig();
    res.json({ enabled: c.enabled, ready: c.ready, apiUrl: c.baseUrl || '', resources: Object.entries(websiteResources).filter(([key]) => allowed(req.user, key)).map(([key, value]) => ({ key, label: value.label,canWrite:canWriteResource(req.user,key,'edit') })), writesEnabled: process.env.STUDY_BIRDS_ALLOW_WRITES === 'true', limitations: ['contact-email', 'messaging-participants', 'endpoint-limits'] });
  }));
  app.post('/api/integrations/website/test', metadataAccess, wrap(async (_req, res) => {
    const user = await client.request('/auth/me');
    const catalog = await client.catalog(true);
    res.json({ connected: true, role: user.user?.role || user.role, countries: catalog.countries.length, universities: catalog.universities.length, programs: catalog.programs.length, checkedAt: catalog.fetchedAt });
  }));
  app.get('/api/integrations/website/catalog', metadataAccess, wrap(async (_req, res) => res.json(await loadCatalogSnapshot(client,readDb,mutateDb,_req.user.companyId))));
  app.get('/api/integrations/website/students/:id/:kind', sectionAccess('students'), wrap(async (req, res) => res.json(await client.studentService(req.params.id, req.params.kind))));
  app.put('/api/integrations/website/students/:id/:kind', sectionAccess('students'), writeAccess, wrap(async (req, res) => {
    if (process.env.STUDY_BIRDS_ALLOW_WRITES !== 'true') throw fail('تعديل الموقع غير مفعّل.', 403);
    res.json(await remoteWrite(req, 'student-service', () => client.studentService(req.params.id, req.params.kind, req.body)));
  }));
  app.get('/api/integrations/website/support-assignees',sectionAccess('support'),wrap(async(req,res)=>res.json(await client.request('/crm/support-assignees'))));
  app.get('/api/integrations/website/consultation-advisors',sectionAccess('consultations'),wrap(async(req,res)=>res.json(await client.request('/consultations/staff/advisors'))));
  app.get('/api/integrations/website/applications/:id/:section', sectionAccess('applications'), wrap(async (req, res) => res.json(await client.section(req.params.id, req.params.section))));
  app.get('/api/integrations/website/messaging/contacts',sectionAccess('support'),wrap(async(req,res)=>{
    const contacts=await client.request('/mobile-workspace/contacts'),db=await readDb();
    res.json(contacts.map(row=>({...row,crmMetadata:db.websiteConversationMetadata?.[conversationKey(req.user.companyId,row._id)] || {}})));
  }));
  app.post('/api/integrations/website/messaging/:id/manage',sectionAccess('support'),writeAccess,wrap(async(req,res)=>{
    assertId(req.params.id);
    const contacts=await client.request('/mobile-workspace/contacts');
    if(!contacts.some(row=>row._id===req.params.id))throw fail('المحادثة غير متاحة لهذا الحساب.',404);
    res.json(await mutateDb(db=>updateConversationWorkspace(db,req.user.companyId,req.params.id,req.body,req.user.sub)));
  }));
  app.get('/api/integrations/website/messaging/:id', sectionAccess('support'), wrap(async (req, res) => { assertId(req.params.id); res.json(await client.request(`/mobile-workspace/messages?recipient=${req.params.id}`)); }));
  app.post('/api/integrations/website/messaging/:id', sectionAccess('support'), writeAccess, wrap(async (req, res) => {
    assertId(req.params.id);
    if (process.env.STUDY_BIRDS_ALLOW_WRITES !== 'true') throw fail('تعديل الموقع غير مفعّل.', 403);
    if (typeof req.body.body !== 'string' || !req.body.body.trim() || req.body.body.length > 4000) throw fail('رسالة غير صالحة.');
    res.json(await remoteWrite(req, 'message', () => client.request('/mobile-workspace/messages', { method: 'POST', body: { recipient: req.params.id, body: req.body.body } })));
  }));
  for (const method of ['post', 'put']) app[method](`/api/integrations/website/content/:resource${method === 'put' ? '/:id' : ''}`, sectionAccess(req => req.params.resource), writeAccess, wrap(async (req, res) => {
    if (process.env.STUDY_BIRDS_ALLOW_WRITES !== 'true') throw fail('تعديل الموقع غير مفعّل.', 403);
    res.json(await remoteWrite(req, `content-${method}`, () => client.editResource(req.params.resource, req.params.id, req.body)));
  }));
  app.post('/api/integrations/website/files/:kind/:id', sectionAccess(req => req.params.kind === 'payment-proofs' ? 'paymentProofs' : req.params.kind === 'documents' ? 'documents' : req.params.kind === 'support-attachments' ? 'support' : ''), wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await client.attachment(req.params.kind, req.params.id));
  }));
  app.get('/api/integrations/website/requests/:resource', sectionAccess(req => req.params.resource), wrap(async (req, res) => {
    let data;
    const catalogResource=['countries','universities','programs','scholarshipCatalog','studyFields'].includes(req.params.resource);
    const snapshotKey=JSON.stringify([req.user.companyId,req.params.resource]);
    try{data=await client.resource(req.params.resource);}
    catch(error){const saved=catalogResource && (await readDb()).websiteCatalogRows?.[snapshotKey];if(!saved || error.status===403)throw error;data={...saved.data,stale:true,warnings:[error.message]};}
    if(catalogResource && !data.stale){
      const digest=createHash('sha256').update(JSON.stringify(data.rows)).digest('hex');
      if((await readDb()).websiteCatalogRows?.[snapshotKey]?.digest!==digest)await mutateDb(db=>{db.websiteCatalogRows ||= {};db.websiteCatalogRows[snapshotKey]={digest,data:structuredClone(data)};});
    }
    const relatedKeys = req.params.resource === 'students' ? ['applications','financials'].filter(key => allowed(req.user,key)) : [];
    const related = await Promise.allSettled(relatedKeys.map(key => client.resource(key)));
    if (nativeResources[req.params.resource]) {
      const snapshot=await readDb();
      const digest=createHash('sha256').update(JSON.stringify([data.rows,related.map(result=>result.status==='fulfilled'?result.value.rows:null)])).digest('hex');
      const stampKey=JSON.stringify([req.user.companyId,req.params.resource]);
      if(snapshot.websiteMaterializationDigests?.[stampKey]!==digest)await mutateDb(db => {
      db.websiteMaterializationDigests ||= {};
      db.websiteMaterializationDigests[stampKey]=digest;
      materializeWebsiteRows(db, req.user.companyId, req.params.resource, data.rows, req.user.sub);
      related.forEach((result,index) => {if(result.status === 'fulfilled') materializeWebsiteRows(db,req.user.companyId,relatedKeys[index],result.value.rows,req.user.sub);});
    });
    }
    data.relatedErrors = related.flatMap((result,index) => result.status === 'rejected' ? [`${websiteResources[relatedKeys[index]].label}: ${result.reason.message}`] : []);
    data.capabilities={edit:canWriteResource(req.user,req.params.resource,'edit'),create:canWriteResource(req.user,req.params.resource,'create'),delete:canWriteResource(req.user,req.params.resource,'delete'),upload:canWriteResource(req.user,req.params.resource,'upload')};
    data.actions=Object.fromEntries(Object.entries(data.actions || {}).filter(([key])=>canWriteResource(req.user,req.params.resource,key)));
    res.json(data);
  }));
  app.post('/api/integrations/website/uploads/:resource/:id',sectionAccess(req=>req.params.resource),writeAccess,fileUpload,wrap(async(req,res)=>res.json(await remoteWrite(req,'upload',()=>client.uploadResource(req.params.resource,req.params.id,req.file)))));
  app.post('/api/integrations/website/service-files/:id/:documentId',sectionAccess('services'),wrap(async(req,res)=>{
    assertId(req.params.id);assertId(req.params.documentId);res.set('Cache-Control','no-store');res.json(await client.request(`/crm/service-requests/${req.params.id}/documents/${req.params.documentId}/access`,{method:'POST'}));
  }));
  app.post('/api/integrations/website/content/:resource/:id/delete',sectionAccess(req=>req.params.resource),writeAccess,wrap(async(req,res)=>{const result=await remoteWrite(req,'content-delete',()=>client.deleteResource(req.params.resource,req.params.id));if(req.params.resource==='applications')await mutateDb(db=>{db.websiteDeletedRecords ||= [];const rows=(db.applications || []).filter(row=>row.companyId===req.user.companyId && row.websiteSource?.id===req.params.id);for(const row of rows)db.websiteDeletedRecords.push({...structuredClone(row),deletedAt:new Date().toISOString(),deletedBy:req.user.sub});db.applications=(db.applications || []).filter(row=>!rows.includes(row));});res.json(result);}));
  app.get('/api/integrations/website/requests/:resource/:id', sectionAccess(req => req.params.resource), wrap(async (req, res) => res.json(await client.detail(req.params.resource, req.params.id))));
  app.post('/api/integrations/website/requests/:resource/:id/:action', sectionAccess(req => req.params.resource), writeAccess, wrap(async (req, res) => {
    if (process.env.STUDY_BIRDS_ALLOW_WRITES !== 'true') throw fail('تعديل بيانات الموقع غير مفعّل على خادم CRM.', 403);
    res.json(await remoteWrite(req, req.params.action, () => client.action(req.params.resource, req.params.id, req.params.action, req.body)));
  }));
  app.get('/api/integrations/website/section-mail', sectionAccess('support'), wrap(async (req, res) => res.json((await readDb()).websiteContactMail?.filter(row => row.companyId === req.user.companyId).slice(-100).reverse() || [])));
  app.get('/api/integrations/website/log', access, wrap(async (req, res) => res.json((await readDb()).websiteIntegrationLog?.filter(row => row.companyId === req.user.companyId).slice(0, 100) || [])));
}
