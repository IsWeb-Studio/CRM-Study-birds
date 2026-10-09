import React, { useEffect, useMemo, useState } from 'react';
import { api, formatDate } from '../api.js';
import { Card, Button, Badge, Spinner, Modal } from '../components/UI.jsx';

const labels = { status: 'الحالة', detailedStatus: 'مرحلة القبول', note: 'ملاحظة للطالب', staffNote: 'ملاحظة الموظف', adminNote: 'ملاحظة الإدارة', reviewNote: 'ملاحظة المراجعة', message: 'الرد', notes: 'ملاحظات', applicationStatus: 'حالة التقديم', assignedTo: 'معرّف الموظف بالموقع', type: 'نوع المستند', result: 'نتيجة الاستشارة', summary: 'ملخص الاستشارة', nextSteps: 'الخطوات التالية' };
const actionLabels = { status: 'تحديث الحالة', update: 'تحديث الطلب', review: 'مراجعة', reply: 'رد على التذكرة', assign: 'تعيين مسؤول', requestDocument: 'طلب مستند إضافي', outcome: 'نتيجة الاستشارة' };
const statuses = {
  applications: ['submitted', 'under-review', 'additional-documents-required', 'conditional-admission', 'payment-required', 'final-admission', 'rejected'],
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
  return value.name || value.title || value.ar || value.en || value.email || '—';
}
function person(row) { return text(row.student || row.user || row.partner || row.agent || row.parent || row.applicantProfile?.name || row.name); }
function title(row) { return text(row.program || row.serviceTitle || row.scholarship || row.subject || row.listing || row.title || row.name); }
const details = { name: 'الاسم', email: 'البريد', phone: 'الهاتف', status: 'الحالة', detailedStatus: 'مرحلة الطلب', university: 'الجامعة', program: 'البرنامج', student: 'الطالب', partner: 'الوكيل', parent: 'ولي الأمر', serviceTitle: 'الخدمة', notes: 'الملاحظات', adminNote: 'ملاحظة الإدارة', subject: 'الموضوع', message: 'الرسالة', airport: 'المطار', flightNumber: 'رقم الرحلة', arrivalDate: 'موعد الوصول', createdAt: 'تاريخ الإنشاء', updatedAt: 'آخر تحديث', amount: 'المبلغ', price: 'السعر', balance: 'الرصيد', documents: 'المستندات', suggestedFields: 'مجالات مقترحة', suggestedCountries: 'دول مقترحة' };

export default function WebsitePage() {
  const [connection, setConnection] = useState(null);
  const [resource, setResource] = useState('applications');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [operation, setOperation] = useState('');
  const [form, setForm] = useState({});
  async function load(key = resource) {
    setLoading(true); setError(''); setResult(null);
    try { setResult(await api(`/api/integrations/website/requests/${key}`)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { api('/api/integrations/website/status').then(setConnection).catch(e => setError(e.message)); }, []);
  useEffect(() => { if (connection?.ready) load(resource); }, [resource, connection?.ready]);
  const rows = useMemo(() => (result?.rows || []).filter(row => [person(row), title(row), row.status, row._id, row.email, row.phone].join(' ').toLowerCase().includes(search.trim().toLowerCase())), [result, search]);
  async function test() {
    setBusy(true); setError(''); setNotice('');
    try { const data = await api('/api/integrations/website/test', { method: 'POST' }); setNotice(`الاتصال ناجح: ${data.countries} دولة، ${data.universities} جامعة، ${data.programs} برنامج.`); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function start(row) {
    setSelected(row); setOperation(''); setForm({}); setError('');
    if (result?.detailSupported) {
      setBusy(true);
      try { const full = await api(`/api/integrations/website/requests/${resource}/${row._id}`); setSelected({ ...row, ...full, ...(resource === 'students' ? full.student : {}) }); }
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
  function choose(action) {
    setOperation(action);
    const fields = result.actions[action].fields;
    const values = {};
    for (const field of fields) {
      if (['version', 'expectedVersion'].includes(field)) values[field] = selected.__v ?? selected.version ?? 0;
      else if (field === 'detailedStatus') values[field] = selected.detailedStatus || statuses[resource]?.[0] || '';
      else if (field === 'status') values[field] = statuses[resource]?.includes(selected.status) ? selected.status : statuses[resource]?.[0] || selected.status || '';
      else if (field === 'result') values[field] = 'completed';
      else values[field] = typeof selected[field] === 'string' ? selected[field] : '';
    }
    setForm(values);
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      // Only explicitly populated fields are sent; hidden version fields preserve conflict detection.
      const payload = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ''));
      await api(`/api/integrations/website/requests/${resource}/${selected._id}/${operation}`, { method: 'POST', body: JSON.stringify(payload) });
      setSelected(null); setNotice('تم حفظ التحديث على الموقع.'); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const allowedActions = Object.keys(result?.actions || {}).filter(key => actionLabels[key]);
  return <div className="website-workspace">
    <Card><div className="website-toolbar"><div><h2>ربط موقع Study Birds</h2><p>طلبات الموقع وبياناته، مع بقاء أعمال CRM المستقلة كما هي.</p></div><Button onClick={test} disabled={busy || !connection?.ready}>اختبار الاتصال</Button></div>
      <p><Badge tone={connection?.ready ? 'success' : 'warning'}>{connection?.ready ? 'إعدادات الاتصال متوفرة' : 'بانتظار إعداد الاتصال'}</Badge> {connection?.apiUrl}</p>
      {!connection?.ready && <p>اضبط رابط API ورمز حساب الموقع على خادم CRM وفق دليل الربط. رمز الاتصال لا يظهر في المتصفح.</p>}
      {connection?.ready && !connection.writesEnabled && <p>الربط في وضع القراءة. تعديل طلبات الموقع معطّل حاليًا.</p>}
    </Card>
    {error && <div role="alert" className="website-error">{error}</div>}{notice && <div role="status" className="website-notice">{notice}</div>}
    <Card><div className="website-toolbar"><label className="field"><span>نوع الطلبات</span><select value={resource} disabled={loading || busy} onChange={e => { setResource(e.target.value); setSearch(''); }}>{(connection?.resources || []).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label className="field"><span>بحث في القائمة المعروضة</span><input type="search" placeholder="الاسم أو الخدمة أو رقم الطلب" value={search} onChange={e => setSearch(e.target.value)} /></label><Button variant="secondary" disabled={!connection?.ready || loading || busy} onClick={() => load()}>تحديث القائمة</Button></div>
      {loading ? <Spinner /> : <><p>{rows.length} سجل معروض {result?.fetchedAt && `• آخر قراءة: ${formatDate(result.fetchedAt)}`}</p>
      {result?.completeness === 'endpoint-limit' && <p className="website-hint">هذه قائمة السجلات التي أتاحتها واجهة الموقع؛ بعض الأقسام تضع حدًا لعدد السجلات.</p>}
      <div className="website-table-wrap"><table className="website-table"><thead><tr><th>الطالب / مقدم الطلب</th><th>الخدمة / البرنامج</th><th>الحالة</th><th>التاريخ</th><th>التفاصيل</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row._id || index}><td>{person(row)}</td><td>{title(row)}</td><td>{statusLabels[row.detailedStatus || row.status] || row.status || '—'}</td><td>{formatDate(row.createdAt)}</td><td><Button variant="secondary" onClick={() => start(row)}>عرض</Button></td></tr>)}</tbody></table></div>{!rows.length && !error && <p>لا توجد سجلات لعرضها.</p>}</>}
    </Card>
    <Card><h3>حدود الربط الحالية</h3><p>رسائل «تواصل معنا» تحتاج ربط صندوق البريد. محادثات الموقع مرتبطة بحساب المشارك وصلاحياته. التأمين والمعادلة يُداران ضمن ملف الطالب، ولا يُعاملان كطلبات مستقلة.</p></Card>
    <Modal open={Boolean(selected)} onClose={() => { if (!busy) setSelected(null); }} title="تفاصيل سجل الموقع" size="lg">
      {selected && <><p>رقم السجل: {selected._id || '—'}</p><dl className="website-details">{Object.entries(details).filter(([key]) => selected[key] != null).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{key === 'status' || key === 'detailedStatus' ? statusLabels[selected[key]] || text(selected[key]) : text(selected[key])}</dd></div>)}</dl>
      {error && <div role="alert" className="website-error">{error}</div>}
      {['documents', 'paymentProofs'].includes(resource) && <Button disabled={busy} variant="secondary" onClick={() => openFile(resource === 'documents' ? 'documents' : 'payment-proofs', selected._id)}>فتح الملف</Button>}
      {Array.isArray(selected.documents) && selected.documents.filter(doc => doc && typeof doc === 'object' && doc._id).map(doc => <Button key={doc._id} disabled={busy} variant="secondary" onClick={() => openFile('documents', doc._id)}>{doc.fileName || doc.type || 'فتح مستند'}</Button>)}
      {connection?.writesEnabled && allowedActions.length > 0 && <form onSubmit={save}><label className="field"><span>الإجراء</span><select value={operation} disabled={busy} onChange={e => choose(e.target.value)}><option value="">اختر إجراء</option>{allowedActions.map(key => <option key={key} value={key}>{actionLabels[key]}</option>)}</select></label>
      {operation && Object.keys(form).filter(field => !['version', 'expectedVersion'].includes(field)).map(field => <label className="field" key={field}><span>{labels[field] || field}</span>{(field === 'status' || field === 'detailedStatus' || field === 'result') ? <select disabled={busy} value={form[field]} onChange={e => setForm(current => ({ ...current, [field]: e.target.value }))}>{(field === 'result' ? ['completed', 'no-show'] : statuses[resource] || [form[field]]).map(value => <option key={value} value={value}>{statusLabels[value] || value}</option>)}</select> : <textarea disabled={busy} maxLength={1000} value={form[field]} onChange={e => setForm(current => ({ ...current, [field]: e.target.value }))} />}</label>)}
      <p>الحفظ يحدّث سجل الموقع الفعلي ويظهر للطالب حسب سلوك الموقع.</p><Button disabled={busy || !operation} type="submit">{busy ? 'جارٍ الحفظ...' : 'حفظ التحديث على الموقع'}</Button></form>}</>}
    </Modal>
  </div>;
}
