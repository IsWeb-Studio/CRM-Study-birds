import React, { useContext, useEffect, useMemo, useState } from 'react';
import { UnifiedSectionContext } from '../components/UnifiedSectionContext.jsx';
import { api, formatDate } from '../api.js';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { mergeRecords } from '../unifiedRecords.js';
import { Card, Button, Badge, Spinner, Modal } from '../components/UI.jsx';
import WebsiteOperations from './WebsiteOperations.jsx';
import CommunityComments from '../components/CommunityComments.jsx';
import MarketingAssetUpload from '../components/MarketingAssetUpload.jsx';
import {websiteApplicationStatuses} from '../websiteApplicationStatuses.js';
import WebsiteWorkflowPanel, { LinkWebsiteRecordButton } from './WebsiteWorkflowPanel.jsx';
import { useAuth } from '../auth.jsx';
import { can, canOpenModule } from '../permissions.js';

const labels = { status: 'الحالة', detailedStatus: 'مرحلة القبول', note: 'ملاحظة للطالب', staffNote: 'ملاحظة الموظف', adminNote: 'ملاحظة الإدارة', reviewNote: 'ملاحظة المراجعة', message: 'الرد', notes: 'ملاحظات', applicationStatus: 'حالة التقديم', assignedTo: 'الموظف المسؤول', type: 'نوع المستند', result: 'نتيجة الاستشارة', summary: 'ملخص الاستشارة', nextSteps: 'الخطوات التالية', invoiceNumber: 'رقم الفاتورة', description: 'الوصف', amount: 'المبلغ', dueDate: 'الاستحقاق', invoiceUrl: 'رابط الفاتورة', category: 'الفئة', recommendationSummary: 'التوصية', isActive: 'حساب فعال', linkedUniversity: 'معرّف الجامعة', moderationNote: 'سبب الإشراف', name: 'الاسم', email: 'البريد الإلكتروني', employeeRole: 'دور الموظف', title: 'العنوان', published: 'منشور' };
const actionLabels = {lift:'رفع إيقاف النشر',cancel:'إلغاء الحجز',availability:'تفعيل أو إيقاف الموعد',escalate:'تصعيد التذكرة',emergency:'تحديد حالة الطوارئ', status: 'تحديث الحالة', update: 'تحديث الطلب', review: 'مراجعة', reply: 'رد على التذكرة', assign: 'تعيين مسؤول', requestDocument: 'طلب مستند إضافي', outcome: 'نتيجة الاستشارة' };
Object.assign(labels,{enabled:'الموعد متاح',escalated:'تصعيد للمدير',escalationNote:'سبب التصعيد',isEmergency:'حالة طارئة'});
const statuses = {
  financials: ['unpaid', 'pending-confirmation', 'paid', 'rejected'], paymentProofs: ['pending', 'approved', 'rejected'], communityPosts: ['published', 'hidden'],
  applications: Object.keys(websiteApplicationStatuses),
  services: ['pending', 'assigned', 'in-progress', 'en-route', 'completed', 'cancelled'],
  housing: ['confirmed', 'rejected', 'cancelled'], arrival: ['submitted', 'in-progress', 'completed'],
  scholarships: ['submitted', 'reviewing', 'accepted', 'rejected'], agencies: ['pending', 'approved', 'rejected'],
  verification: ['pending', 'approved', 'rejected'], payouts: ['pending', 'approved', 'rejected', 'paid'],
  parents: ['approved', 'rejected'], support: ['answered', 'closed'],
  documents: ['uploaded', 'under-review', 'approved', 'rejected', 'needs-revision', 'needs-translation', 'expired'],
};
const statusLabels = { submitted: 'تم الإرسال', 'under-review': 'قيد المراجعة', 'additional-documents-required': 'مستندات إضافية مطلوبة', 'conditional-admission': 'قبول مشروط', 'payment-required': 'الدفع مطلوب', 'final-admission': 'قبول نهائي', rejected: 'مرفوض', pending: 'بانتظار المعالجة', assigned: 'تم التعيين', 'in-progress': 'قيد التنفيذ', 'en-route': 'في الطريق', completed: 'مكتمل', cancelled: 'ملغي', confirmed: 'مؤكد', reviewing: 'قيد المراجعة', accepted: 'مقبول', approved: 'معتمد', paid: 'مدفوع', answered: 'تم الرد', closed: 'مغلق', 'no-show': 'لم يحضر' };
function text(value) {
  if (value == null) return '—';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return value.map(text).join('، ');
  return value.name || value.title || value.ar || value.en || value.email || JSON.stringify(value);
}
function person(row) { return text(row.student || row.user || row.partner || row.agent || row.parent || row.applicantProfile?.name || row.studentName || row.name); }
function title(row) { return text(row.program || row.serviceTitle || row.scholarship || row.subject || row.listing || row.title || row.question || row.invoiceNumber || row.name); }
const details = { name: 'الاسم', email: 'البريد', phone: 'الهاتف', status: 'الحالة', detailedStatus: 'مرحلة الطلب', university: 'الجامعة', program: 'البرنامج', student: 'الطالب', partner: 'الوكيل', parent: 'ولي الأمر', serviceTitle: 'الخدمة', notes: 'الملاحظات', adminNote: 'ملاحظة الإدارة', subject: 'الموضوع', message: 'الرسالة', airport: 'المطار', flightNumber: 'رقم الرحلة', arrivalDate: 'موعد الوصول', createdAt: 'تاريخ الإنشاء', updatedAt: 'آخر تحديث', amount: 'المبلغ', price: 'السعر', balance: 'الرصيد', documents: 'المستندات', suggestedFields: 'مجالات مقترحة', suggestedCountries: 'دول مقترحة', invoiceNumber: 'رقم الفاتورة', description: 'الوصف', dueDate: 'تاريخ الاستحقاق', category: 'الفئة', currency: 'العملة', reviewNote: 'ملاحظة المراجعة', body: 'المحتوى', quote: 'رأي الطالب', studentName: 'اسم الطالب', destination: 'وجهة الدراسة', employeeRole: 'دور الموظف', role: 'نوع الحساب', isActive: 'حساب فعال', stats: 'مؤشرات الموظف', author: 'الكاتب', moderationNote: 'سبب الإشراف', recommendationSummary: 'التوصية', contactEmail: 'بريد التواصل' };

export default function WebsitePage({ embedded = false, resources = null, dialogOnly = false, externalRecord = null, onDismiss, onSaved, localRows = [] }) {
  const { user } = useAuth();
  const { records } = useContext(UnifiedSectionContext);
  const [assignees,setAssignees]=useState([]);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [connection, setConnection] = useState(null);
  const [resource, setResource] = useState(() => (resources?.includes(new URLSearchParams(window.location.search).get('resource')) ? new URLSearchParams(window.location.search).get('resource') : resources?.[0]) || (resources ? '' : new URLSearchParams(window.location.search).get('resource') || 'applications'));
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [operation, setOperation] = useState('');
  const [form, setForm] = useState({});
  const availableResources = (connection?.resources || []).filter(item => !resources || resources.includes(item.key)).sort((a, b) => resources ? resources.indexOf(a.key) - resources.indexOf(b.key) : 0);
  useEffect(() => {
    const requested = searchParams.get('resource');
    if (requested && (!resources || resources.includes(requested))) setResource(requested);
  }, [searchParams, resources]);
  async function load(key = resource) {
    setLoading(true); setError(''); setResult(null);
    try { setResult(await api(`/api/integrations/website/requests/${key}`)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { api('/api/integrations/website/status').then(data => setConnection(data)).catch(e => setError(e.message)); }, [user]);
  useEffect(() => {
    if (!connection?.ready || !resource) return;
    let active = true;
    setLoading(true); setError(''); setResult(null); setSelected(null);
    (records[resource] ? Promise.resolve(records[resource]) : api(`/api/integrations/website/requests/${resource}`)).then(data => { if (active) setResult(data); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [resource, connection?.ready, records[resource]]);
  useEffect(() => { if (dialogOnly) return; const id = searchParams.get('id'); const row = result?.rows?.find(row => row._id === id); if (row) start(row); }, [result, searchParams, dialogOnly]);
  useEffect(() => { if (dialogOnly && externalRecord && result) start(externalRecord); }, [dialogOnly, externalRecord?._id, result]);
  const rows = useMemo(() => mergeRecords(localRows, (result?.rows || []).map(row => ({ ...row, websiteSource:{ resource, id:row._id } })), resource).filter(row => [person(row), title(row), row.status, row._id, row.email, row.phone].join(' ').toLowerCase().includes(search.trim().toLowerCase())), [localRows, result, resource, search]);
  async function test() {
    setBusy(true); setError(''); setNotice('');
    try { const data = await api('/api/integrations/website/test', { method: 'POST' }); setNotice(`الاتصال ناجح: ${data.countries} دولة، ${data.universities} جامعة، ${data.programs} برنامج.`); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function start(row) {
    setSelected(row); setOperation(''); setForm({}); setError('');
    if (row._id && !row.__crm && result?.detailSupported) {
      setBusy(true);
      try { const full = await api(`/api/integrations/website/requests/${resource}/${row._id}`); setSelected({ ...row, ...full, ...(resource === 'students' ? full.student : resource === 'communityPosts' ? full.post : resource==='agents'?full.partner:{}) }); }
      catch (e) { setError(e.message); } finally { setBusy(false); }
    }
  }
  async function openFile(kind, id) {
    setBusy(true); setError('');
    try {
      const data = await api(`/api/integrations/website/files/${kind}/${id}`, { method: 'POST' });
      if (!data.url || !data.url.startsWith('https://')) throw new Error('رابط الملف غير متوفر.');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function uploadDocument(file){
    if(!file)return;setBusy(true);setError('');
    try{const body=new FormData();body.set('file',file);await api(`/api/integrations/website/uploads/services/${selected._id}`,{method:'POST',body});await start(selected);onSaved?.();}catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function deleteRecord(row=selected) {
    if (!window.confirm('حذف السجل الأصلي من الموقع؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    setBusy(true);setError('');
    try {await api(`/api/integrations/website/content/${resource}/${row._id}/delete`,{method:'POST',body:'{}'});setSelected(null);onSaved?.();if (!dialogOnly) await load();}
    catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  async function choose(action) {
    if((resource==='support' && action==='assign') || (resource==='services' && action==='update')){try{setAssignees(await api(`/api/integrations/website/${resource==='support'?'support':'service'}-assignees`));}catch(e){setError(e.message);return;}}
    setOperation(action);if(!action){setForm({});return;}
    const fields = result.actions[action].fields;
    const values = {};
    for (const field of fields) {
      if (['version', 'expectedVersion'].includes(field)) values[field] = selected.__v ?? selected.version ?? 0;
      else if (field === 'detailedStatus') values[field] = selected.detailedStatus || statuses[resource]?.[0] || '';
      else if (field === 'status') values[field] = statuses[resource]?.includes(selected.status) ? selected.status : statuses[resource]?.[0] || selected.status || '';
      else if (field === 'result') values[field] = 'completed';
      else if (field === 'assignedTo') values[field] = selected[field]?._id || selected[field] || '';
      else values[field] = typeof selected[field] === 'string' || typeof selected[field] === 'number' || typeof selected[field] === 'boolean' ? selected[field] : '';
    }
    setForm(values);
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      // Only explicitly populated fields are sent; hidden version fields preserve conflict detection.
      const payload = Object.fromEntries(Object.entries(form).filter(([key,value])=>value!=='' || ['assignedTo','staffNote','adminNote','reviewNote','escalationNote','notes'].includes(key)));
      if(['support','services'].includes(resource) && payload.assignedTo==='')payload.assignedTo=null;
      await api(`/api/integrations/website/requests/${resource}/${selected._id}/${operation}`, { method: 'POST', body: JSON.stringify(payload) });
      setSelected(null); setNotice('تم حفظ التحديث على الموقع.'); onSaved?.(); if (!dialogOnly) await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const catalogResource=['countries','universities','programs','scholarshipCatalog','studyFields','contentServices','housingListings'].includes(resource);
  const canCreate=connection?.writesEnabled && result?.capabilities?.create && result?.createFields?.length>0;
  const allowedActions = Object.keys(result?.actions || {}).filter(key => actionLabels[key]);
  const recordDialog = (
    <Modal open={Boolean(selected)} onClose={() => { if (!busy) { setSelected(null); onDismiss?.(); } }} title="تفاصيل السجل" size="lg">
      {selected && <><p>رقم السجل: {selected._id || '—'}</p><dl className="website-details">{Object.entries(details).filter(([key]) => selected[key] != null).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{key === 'status' || key === 'detailedStatus' ? statusLabels[selected[key]] || text(selected[key]) : text(selected[key])}</dd></div>)}</dl>
      {resource==='communityPosts' && <CommunityComments postId={selected._id} comments={selected.comments || []} writable={connection?.writesEnabled && result?.capabilities?.edit} onSaved={()=>{start(selected);onSaved?.();}} />}
      {resource==='support' && <section><h3>سجل الردود</h3>{(selected.replies || []).map((reply,index)=><div className="student-card-row" key={reply._id || index}><strong>{text(reply.user)} · {formatDate(reply.createdAt)}</strong><p>{reply.message}</p></div>)}{!selected.replies?.length && <p>لا توجد ردود حتى الآن.</p>}</section>}
      {error && <div role="alert" className="website-error">{error}</div>}
      {!embedded && !dialogOnly && canOpenModule(user, 'website') && <LinkWebsiteRecordButton resource={resource} record={selected} />}
      {selected.__crm && canOpenModule(user, 'catalogManagement') && <Button onClick={() => navigate('/catalog-management')}>تحرير في الدليل الدراسي</Button>}
      {!selected.__crm && <WebsiteOperations resource={resource} record={selected} uploadSupported={result?.uploadSupported && result?.capabilities?.upload} editFields={selected._id ? result?.editFields || [] : result?.createFields || result?.editFields || []} writesEnabled={connection?.writesEnabled && result?.capabilities?.edit} onSaved={() => { setSelected(null); onSaved?.(); if (!dialogOnly) load(); }} />}
      {selected._id && !selected.__crm && connection?.writesEnabled && result?.deletable && result?.capabilities?.delete && <Button variant="danger" disabled={busy} onClick={()=>deleteRecord()}>حذف السجل</Button>}
      {resource==='services' && selected._id && connection?.writesEnabled && result?.capabilities?.upload && <label className="field"><span>إرفاق مستند للخدمة، حتى 5 ميجابايت</span><input type="file" disabled={busy} accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={e=>uploadDocument(e.target.files?.[0])}/></label>}
      {['documents', 'paymentProofs'].includes(resource) && <Button disabled={busy} variant="secondary" onClick={() => openFile(resource === 'documents' ? 'documents' : 'payment-proofs', selected._id)}>فتح الملف</Button>}
      {resource!=='services' && Array.isArray(selected.documents) && selected.documents.filter(doc => doc && typeof doc === 'object' && doc._id).map(doc => <Button key={doc._id} disabled={busy} variant="secondary" onClick={() => openFile('documents', doc._id)}>{doc.fileName || doc.type || 'فتح مستند'}</Button>)}
      {resource==='support' && selected.attachment && <Button variant="secondary" disabled={busy} onClick={()=>openFile('support-attachments',selected._id)}>فتح مرفق التذكرة</Button>}
      {resource==='services' && <section><h3>متابعة الخدمة</h3><p>المسؤول: {text(selected.assignedTo)} · ملاحظة الموظف: {selected.staffNote || '—'}</p>{(selected.statusHistory || []).map((item,index)=><p key={index}>{statusLabels[item.status] || item.status} · {formatDate(item.changedAt)} {item.note && `· ${item.note}`}</p>)}{selected.driverDetails?.name && <p>السائق: {selected.driverDetails.name} · {selected.driverDetails.phone}</p>}</section>}
      {resource==='services' && connection?.writesEnabled && allowedActions.includes('update') && <Button disabled={busy} onClick={()=>choose('update')}>تحديث الحالة وإسناد الموظف</Button>}
      {resource==='services' && (selected.documents || []).filter(doc=>doc._id).map(doc=><Button key={doc._id} disabled={busy} variant="secondary" onClick={async()=>{setBusy(true);try{const data=await api(`/api/integrations/website/service-files/${selected._id}/${doc._id}`,{method:'POST'});if(!data.url?.startsWith('https://'))throw new Error('رابط الملف غير متوفر');window.open(data.url,'_blank','noopener,noreferrer');}catch(e){setError(e.message);}finally{setBusy(false);}}}>{doc.fileName || 'فتح مستند الخدمة'}</Button>)}
      {connection?.writesEnabled && result?.capabilities?.edit && !selected.__crm && allowedActions.length > 0 && <form onSubmit={save}><label className="field"><span>الإجراء</span><select value={operation} disabled={busy} onChange={e => choose(e.target.value)}><option value="">اختر إجراء</option>{allowedActions.map(key => <option key={key} value={key}>{actionLabels[key]}</option>)}</select></label>
      {operation && Object.keys(form).filter(field => !['version', 'expectedVersion'].includes(field)).map(field => <label className="field" key={field}><span>{labels[field] || field}</span>{['support','services'].includes(resource) && field==='assignedTo' ? <select disabled={busy} value={form[field]} onChange={e=>setForm(current=>({...current,[field]:e.target.value}))}><option value="">بدون مسؤول</option>{assignees.map(row=><option value={row._id} key={row._id}>{row.name} · {row.email}</option>)}</select> : (field === 'status' || field === 'detailedStatus' || field === 'result') ? <select disabled={busy} value={form[field]} onChange={e => setForm(current => ({ ...current, [field]: e.target.value }))}>{(field === 'result' ? ['completed', 'no-show'] : statuses[resource] || [form[field]]).map(value => <option key={value} value={value}>{statusLabels[value] || value}</option>)}</select> : ['isActive', 'published','enabled','escalated','isEmergency'].includes(field) ? <input type="checkbox" checked={Boolean(form[field])} disabled={busy} onChange={e => setForm(current => ({ ...current, [field]: e.target.checked }))} /> : <textarea disabled={busy} maxLength={1000} value={form[field]} onChange={e => setForm(current => ({ ...current, [field]: e.target.value }))} />}</label>)}
      <p>الحفظ يحدّث السجل الأصلي.</p><Button disabled={busy || !operation} type="submit">{busy ? 'جارٍ الحفظ...' : 'حفظ التحديث'}</Button></form>}</>}
    </Modal>
  );
  if (dialogOnly) return <>{!selected && <Card>{error || (connection && !connection.ready ? 'الربط غير متاح حاليًا.' : 'جارٍ تحميل السجل…')}<Button variant="secondary" onClick={onDismiss}>إغلاق</Button></Card>}{recordDialog}</>;
  return <div className="website-workspace">
    {!embedded && <Card><div className="website-toolbar"><div><h2>إعدادات ربط موقع Study Birds</h2><p>عرض بيانات الموقع وإدارة إجراءاتها من هذا القسم.</p></div><Button onClick={test} disabled={busy || !connection?.ready}>اختبار الاتصال</Button></div>
      <p><Badge tone={connection?.ready ? 'success' : 'warning'}>{connection?.ready ? 'إعدادات الاتصال متوفرة' : 'بانتظار إعداد الاتصال'}</Badge> {connection?.apiUrl}</p>
      {!connection?.ready && <p>فعّل STUDY_BIRDS_ENABLED=true واضبط رابط API ورمز الحساب على خادم CRM وفق دليل الربط. رمز الاتصال لا يظهر في المتصفح.</p>}
      {connection?.ready && !connection.writesEnabled && <p>الربط في وضع القراءة. تعديل طلبات الموقع معطّل حاليًا.</p>}
    </Card>}
    {error && <div role="alert" className="website-error">{error}</div>}{notice && <div role="status" className="website-notice">{notice}</div>}
    <Card>{catalogResource && canCreate && <Button onClick={()=>setSelected({})}>إضافة سجل جديد إلى الموقع</Button>}<div className="website-toolbar"><label className="field"><span>نوع الطلبات</span><select value={resource} disabled={loading || busy} onChange={e => { setResource(e.target.value); setSearch(''); }}>{availableResources.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label className="field"><span>بحث في القائمة المعروضة</span><input type="search" placeholder="الاسم أو الخدمة أو رقم الطلب" value={search} onChange={e => setSearch(e.target.value)} /></label><Button variant="secondary" disabled={!connection?.ready || loading || busy} onClick={() => load()}>تحديث القائمة</Button></div>
      {loading ? <Spinner /> : <><p>{rows.length} سجل معروض {result?.fetchedAt && `• آخر قراءة: ${formatDate(result.fetchedAt)}`}</p>
      {result?.stale && <p role="status" className="website-hint">تعذر تحديث القائمة؛ المعروض آخر بيانات الموقع المحفوظة. {(result.warnings || []).join('، ')}</p>}
      {result?.completeness === 'endpoint-limit' && <p className="website-hint">هذه قائمة السجلات التي أتاحتها واجهة الموقع؛ بعض الأقسام تضع حدًا لعدد السجلات.</p>}
      <div className="website-table-wrap"><table className="catalog-table"><thead><tr><th>المصدر</th><th>{catalogResource?"اسم العنصر":"الاسم / مقدم الطلب"}</th><th>{catalogResource?"بيانات إضافية":"الخدمة / البرنامج"}</th><th>الحالة</th><th>التاريخ</th><th>التفاصيل</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row._id || index}><td><Badge tone={row.__crm ? 'neutral' : 'blue'}>{row.__crm ? 'CRM' : 'مرتبط'}</Badge></td><td>{catalogResource ? title(row) : person(row)}</td><td>{catalogResource?[resource==='countries'?row.code:resource==='studyFields'?row.description:text(row.university || row.country),row.degreeLevel,row.language].filter(Boolean).join(' · ') || '—':title(row)}</td><td>{statusLabels[row.detailedStatus || row.status] || row.status || '—'}</td><td>{formatDate(row.createdAt)}</td><td><div className="table-actions"><Button variant="secondary" onClick={() => start(row)}>{catalogResource && connection?.writesEnabled && result?.capabilities?.edit?"تعديل":resource==='services'?"إدارة الطلب":"عرض"}</Button>{catalogResource && !row.__crm && connection?.writesEnabled && result?.deletable && result?.capabilities?.delete && <Button variant="danger" disabled={busy} onClick={()=>deleteRecord(row)}>حذف</Button>}</div></td></tr>)}</tbody></table></div>{!rows.length && !error && <p>لا توجد سجلات لعرضها.</p>}</>}
    </Card>
    {!embedded && connection && canOpenModule(user, 'website') && <WebsiteWorkflowPanel connection={connection} resource={resource} onRefresh={() => load()} />}
    {!catalogResource && connection?.writesEnabled && result?.capabilities?.create && (result?.createFields || result?.editFields)?.length > 0 && !result?.singleton && <Button onClick={() => setSelected({})}>إضافة سجل جديد إلى الموقع</Button>}
    {resource==='marketingAssets' && connection?.writesEnabled && result?.uploadCreate && result?.capabilities?.create && <MarketingAssetUpload onSaved={()=>{setNotice('تمت إضافة المادة إلى الموقع.');onSaved?.();load();}} />}
    {recordDialog}
  </div>;
}
