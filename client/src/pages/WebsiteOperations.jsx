import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Button } from '../components/UI.jsx';

const label = { status: 'الحالة', provider: 'شركة التأمين', policyNumber: 'رقم الوثيقة', coverage: 'التغطية', notes: 'ملاحظات', startDate: 'بداية التأمين', endDate: 'انتهاء التأمين', cardFileUrl: 'رابط بطاقة التأمين', authority: 'جهة المعادلة', applicationNumber: 'رقم المعاملة', fees: 'الرسوم', submittedAt: 'تاريخ التقديم', expectedCompletionDate: 'الموعد المتوقع', resultFileUrl: 'رابط النتيجة', requiredDocuments: 'المستندات المطلوبة، كل مستند في سطر', advisorId: 'المستشار', dueAt: 'موعد المتابعة', stage: 'المرحلة', note: 'ملاحظة للطالب', reference: 'مرجع الإجراء', studiesStartAt: 'بداية الدراسة', appointmentDate: 'موعد السفارة', appointmentLocation: 'مكان الموعد', insuranceProvider: 'شركة التأمين', insurancePolicyNumber: 'رقم التأمين', insuranceExpiresAt: 'انتهاء التأمين', studentId: 'الطالب', invoiceNumber: 'رقم الفاتورة', description: 'الوصف', amount: 'المبلغ', dueDate: 'الاستحقاق', invoiceUrl: 'رابط الفاتورة', adminNote: 'ملاحظة الإدارة', password: 'كلمة المرور', email: 'البريد الإلكتروني', universityId: 'الجامعة', name: 'الاسم', phone: 'الهاتف', vehicleType: 'نوع السيارة', vehicleNumber: 'رقم السيارة', etaMinutes: 'الدقائق المتوقعة', title: 'العنوان', country: 'الدولة', city: 'المدينة', language: 'اللغة', university: 'الجامعة', degreeLevel: 'الدرجة العلمية', fieldOfStudy: 'مجال الدراسة', duration: 'مدة الدراسة', tuition: 'الرسوم', partnerTuition: 'الرسوم بعد الخصم', summary: 'الملخص', overview: 'نبذة', logo: 'رابط الشعار', image: 'رابط الصورة', studentName: 'اسم الطالب', destination: 'وجهة الدراسة', quote: 'رأي الطالب', avatar: 'صورة الطالب', rating: 'التقييم', sortOrder: 'الترتيب', coverImage: 'صورة الغلاف', excerpt: 'المقتطف', eventDate: 'موعد الفعالية', countryCode: 'رمز الدولة', subtitle: 'العنوان الفرعي', eventType: 'نوع الفعالية', ctaText: 'نص الزر', backgroundImage: 'صورة الخلفية', isPublished: 'منشور', contactEmail: 'بريد التواصل', whatsappUrl: 'رابط واتساب', facebookUrl: 'فيسبوك', instagramUrl: 'إنستغرام', tiktokUrl: 'تيك توك', britishMembershipUrl: 'رابط العضوية', supportHours: 'ساعات العمل', officeLocations: 'عناوين المكاتب', leadCapturePromptEnabled: 'إظهار نموذج التواصل', heroEyebrow: 'مقدمة العنوان', heroBody: 'نص المقدمة', heroCtaText: 'نص زر المقدمة', heroCtaLink: 'رابط زر المقدمة', storyTitle: 'عنوان القصة', storyBody: 'القصة', storyImage: 'صورة القصة', missionTitle: 'عنوان الرسالة', missionBody: 'الرسالة', visionTitle: 'عنوان الرؤية', visionBody: 'الرؤية', link: 'الرابط', detailTitle: 'عنوان التفاصيل', detailImage: 'صورة التفاصيل', detailBody: 'التفاصيل', price: 'السعر', durationDays: 'مدة الخدمة بالأيام', featured: 'مميز', isPartnerInstitution: 'جامعة شريكة', published: 'منشور', question: 'السؤال', answer: 'الإجابة', category: 'القسم', body: 'المحتوى', code: 'الكود', heroTitle: 'عنوان الصفحة', heroSubtitle: 'العنوان الفرعي', heroImage: 'صورة الصفحة' };
const statuses = { insurance: ['pending', 'active', 'expired'], equivalency: ['not-started', 'documents-collected', 'submitted', 'under-review', 'completed', 'rejected'], visa: ['not-started', 'preparing-documents', 'ready', 'submitted', 'under-review', 'approved', 'rejected'], journey: ['not-started', 'in-progress', 'action-required', 'waiting-team', 'waiting-university', 'completed', 'not-required'] };
const statusLabels = { pending: 'بانتظار المعالجة', active: 'ساري', expired: 'منتهي', 'not-started': 'لم يبدأ', 'documents-collected': 'جُمعت المستندات', submitted: 'تم التقديم', 'under-review': 'قيد المراجعة', completed: 'مكتمل', rejected: 'مرفوض', 'preparing-documents': 'تجهيز المستندات', ready: 'جاهز', approved: 'معتمد', 'in-progress': 'قيد التنفيذ', 'action-required': 'إجراء مطلوب', 'waiting-team': 'بانتظار الفريق', 'waiting-university': 'بانتظار الجامعة', 'not-required': 'غير مطلوب' };
const stages = { visa: 'التأشيرة', travel: 'السفر', housing: 'السكن', arrival: 'الوصول', registration: 'التسجيل الجامعي', residence: 'الإقامة' };
const numeric = new Set(['tuition', 'partnerTuition', 'price', 'durationDays', 'etaMinutes', 'fees', 'rating', 'sortOrder', 'amount']);
const dates = new Set(['startDate', 'endDate', 'submittedAt', 'expectedCompletionDate', 'dueAt', 'studiesStartAt', 'appointmentDate', 'insuranceExpiresAt', 'eventDate', 'dueDate']);
const flags = new Set(['featured', 'isPartnerInstitution', 'published', 'isPublished', 'leadCapturePromptEnabled','active','isActive']);
const actionPath = { visa: 'visa-case', journey: 'post-admission', assignment: 'assignment' };

export function WebsiteFields({ form, setForm, fields, options = {}, disabled = false }) {
  return <div className="website-details">{fields.filter(key => !['version', 'requirements'].includes(key)).map(key => <label className="field" key={key}><span>{label[key] || key}</span>
    {flags.has(key) ? <input type="checkbox" checked={Boolean(form[key])} disabled={disabled} onChange={e => setForm(current => ({ ...current, [key]: e.target.checked }))} /> : options[key] ? <select disabled={disabled} value={form[key] ?? ''} onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))}>{options[key].map(item => <option key={typeof item === 'string' ? item : item.value} value={typeof item === 'string' ? item : item.value}>{typeof item === 'string' ? statusLabels[item] || item : item.label}</option>)}</select> : typeof form[key] === 'object' && form[key] !== null ? <div>{['ar', 'en'].map(locale => <label key={locale}><span>{locale === 'ar' ? 'العربية' : 'الإنجليزية'}</span><input disabled={disabled} value={form[key][locale] || ''} onChange={e => setForm(current => ({ ...current, [key]: { ...current[key], [locale]: e.target.value } }))} /></label>)}</div> : dates.has(key) || numeric.has(key) ? <input disabled={disabled} type={dates.has(key) ? 'datetime-local' : 'number'} value={form[key] ?? ''} onChange={e => setForm(current => ({ ...current, [key]: numeric.has(key) ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value }))} /> : key === 'password' ? <input type="password" autoComplete="new-password" disabled={disabled} value={form[key] ?? ''} onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))} /> : <textarea disabled={disabled} maxLength={10000} value={form[key] ?? ''} onChange={e => setForm(current => ({ ...current, [key]: e.target.value }))} />}
  </label>)}</div>;
}

export default function WebsiteOperations({ resource, record, writesEnabled, editFields = [], onSaved }) {
  const actionResource = resource === 'visaCases' ? 'applications' : resource;
  const [kind, setKind] = useState('');
  const [form, setForm] = useState({});
  const [fields, setFields] = useState([]);
  const [advisors, setAdvisors] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { setKind(''); setForm({}); setError(''); }, [record._id, resource]);
  async function choose(next) {
    setKind(next); setBusy(true); setFields([]); setError(''); setNotice('');
    try {
      let source = record;
      let keys;
      if (next === 'insurance' || next === 'equivalency') {
        source = await api(`/api/integrations/website/students/${record._id}/${next}`) || {};
        keys = next === 'insurance' ? ['status', 'provider', 'policyNumber', 'coverage', 'notes', 'startDate', 'endDate', 'cardFileUrl'] : ['status', 'authority', 'applicationNumber', 'notes', 'fees', 'submittedAt', 'expectedCompletionDate', 'resultFileUrl', 'requiredDocuments'];
      } else if (actionPath[next]) {
        const view = await api(`/api/integrations/website/applications/${record._id}/${actionPath[next]}`);
        if (next === 'assignment') { source = { advisorId: view.application.assignedAdvisor, dueAt: view.application.followUpDueAt, version: view.application.__v }; setAdvisors(view.advisors || []); keys = ['advisorId', 'dueAt', 'version']; }
        if (next === 'journey') { const first = view.stages?.[0]; source = { stage: first?.key || 'visa', status: first?.recordedStatus || 'not-started', note: '', reference: '', dueAt: null, studiesStartAt: view.studiesStartAt, version: view.version }; keys = ['stage', 'status', 'note', 'reference', 'dueAt', 'studiesStartAt', 'version']; }
        if (next === 'visa') { source = { ...view, appointmentDate: view.appointment?.date, appointmentLocation: view.appointment?.location, insuranceProvider: view.insurance?.provider, insurancePolicyNumber: view.insurance?.policyNumber, insuranceExpiresAt: view.insurance?.expiresAt, requirements: view.requirements || [] }; keys = ['status', 'requirements', 'appointmentDate', 'appointmentLocation', 'insuranceProvider', 'insurancePolicyNumber', 'insuranceExpiresAt', 'notes', 'version']; }
      } else if (next === 'driver') { source = record.driverDetails || {}; keys = ['name', 'phone', 'vehicleType', 'vehicleNumber', 'etaMinutes']; }
      else { keys = editFields; if (resource === 'financials' && !record._id) { const result = await api('/api/integrations/website/requests/students'); setAdvisors(result.rows || []); } if (['programs', 'universities', 'universityAccounts'].includes(resource)) setCatalog(await api('/api/integrations/website/catalog')); }
      const values = {};
      for (const key of keys) {
        let value = source[key] ?? (resource==='students' ? source.profile?.[key] : undefined) ?? (flags.has(key) ? false : '');
        if (['country', 'university'].includes(key) && typeof value === 'object') value = value._id;
        if (dates.has(key)) { const date = value ? new Date(value) : null; value = date && Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''; }
        if (key === 'requiredDocuments') value = (source[key] || []).join('\n');
        if (key === 'permissions') value = (source[key] || []).join('\n');
        values[key] = value;
      }
      if (statuses[next] && !values.status) values.status = statuses[next][0];
      setFields(keys); setForm(values);
    } catch (e) { setError(e.message); setFields([]); } finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = { ...form };
      if (Object.hasOwn(body,'permissions')) body.permissions = body.permissions.split('\n').map(value=>value.trim()).filter(Boolean);
      for (const field of Object.keys(body)) if (dates.has(field)) body[field] = body[field] ? new Date(body[field]).toISOString() : null;
      if (kind === 'equivalency') body.requiredDocuments = body.requiredDocuments.split('\n').map(v => v.trim()).filter(Boolean);
      if (kind === 'insurance' || kind === 'equivalency') await api(`/api/integrations/website/students/${record._id}/${kind}`, { method: 'PUT', body: JSON.stringify(body) });
      else if (kind === 'content') await api(`/api/integrations/website/content/${resource}${record._id ? `/${record._id}` : ''}`, { method: record._id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      else await api(`/api/integrations/website/requests/${actionResource}/${record._id}/${kind}`, { method: 'POST', body: JSON.stringify(body) });
      setNotice('تم الحفظ.'); setKind(''); onSaved?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const options = { ...(statuses[kind] ? { status: statuses[kind] } : {}), stage: Object.entries(stages).map(([value, label]) => ({ value, label })), studentId: [{ value: '', label: 'اختر طالب الموقع' }, ...advisors.map(row => ({ value: row._id, label: row.name || row.email }))], universityId: [{ value: '', label: 'اختر الجامعة' }, ...(catalog?.universities || []).map(row => ({ value: row.id, label: row.name }))], advisorId: [{ value: '', label: 'بدون مستشار' }, ...advisors.map(row => ({ value: row._id, label: row.name }))], ...(catalog ? { country: [{ value: '', label: 'اختر دولة' }, ...catalog.countries.map(row => ({ value: row.id, label: row.name }))], university: [{ value: '', label: 'اختر جامعة' }, ...catalog.universities.map(row => ({ value: row.id, label: row.name }))] } : {}) };
  return <section><h3>الخدمات والمتابعة</h3><div className="website-toolbar">
    {resource === 'students' && <><Button disabled={busy} variant="secondary" onClick={() => choose('insurance')}>التأمين</Button><Button disabled={busy} variant="secondary" onClick={() => choose('equivalency')}>معادلة الشهادات</Button></>}
    {actionResource === 'applications' && Object.entries({ assignment: 'تعيين المستشار', visa: 'التأشيرة', journey: 'ما بعد القبول' }).map(([key, title]) => <Button disabled={busy} variant="secondary" key={key} onClick={() => choose(key)}>{title}</Button>)}
    {resource === 'services' && <Button disabled={busy} variant="secondary" onClick={() => choose('driver')}>تفاصيل السائق</Button>}
    {editFields.length > 0 && <Button disabled={busy} variant="secondary" onClick={() => choose('content')}>{['students','employees'].includes(resource) ? 'تحرير الحساب' : 'تحرير المحتوى'}</Button>}
  </div>{error && <p role="alert" className="website-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {kind && fields.length > 0 && <form onSubmit={save}><WebsiteFields form={form} setForm={setForm} fields={fields} options={options} disabled={busy || !writesEnabled} />
    {kind === 'visa' && <div><h4>متطلبات التأشيرة</h4>{(form.requirements || []).map((row, index) => <div className="website-toolbar" key={index}><input disabled={busy || !writesEnabled} value={row.label} placeholder="اسم المتطلب" onChange={e => setForm(current => ({ ...current, requirements: current.requirements.map((item, i) => i === index ? { ...item, label: e.target.value } : item) }))} /><label><input disabled={busy || !writesEnabled} type="checkbox" checked={row.done} onChange={e => setForm(current => ({ ...current, requirements: current.requirements.map((item, i) => i === index ? { ...item, done: e.target.checked } : item) }))} />مكتمل</label></div>)}<Button type="button" disabled={busy || !writesEnabled} variant="secondary" onClick={() => setForm(current => ({ ...current, requirements: [...current.requirements, { label: '', done: false }] }))}>إضافة متطلب</Button></div>}
    {writesEnabled && <Button type="submit" disabled={busy}>حفظ على الموقع</Button>}</form>}
  </section>;
}
