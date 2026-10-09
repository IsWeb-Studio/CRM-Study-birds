import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, GraduationCap, Mail, Phone, Receipt, Search, UserSquare2, WalletCards } from 'lucide-react';
import { api, formatDate, formatMoney, initials } from '../api.js';
import { Badge, Button, Card, Field, Modal, Progress, Spinner } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { tr } from '../i18n.js';
import { UnifiedSectionContext, useUnifiedRecords } from '../components/UnifiedSectionContext.jsx';
import {can} from '../permissions.js';
import SourceRecordActions from '../components/SourceRecordActions.jsx';

export default function StudentsPage() {
  const { user } = useAuth();
  const {refresh,writesEnabled} = useContext(UnifiedSectionContext);
  const [createOpen,setCreateOpen] = useState(false), [createBusy,setCreateBusy] = useState(false), [error,setError] = useState('');
  const [form,setForm] = useState({name:'',email:'',password:'',phone:'',nationality:''});
  const [linkTarget,setLinkTarget] = useState(null);
  const [accountId,setAccountId]=useState('');
  async function createStudent(event) {
    event.preventDefault();setCreateBusy(true);setError('');
    try {
      const student = await api(linkTarget ? `/api/students/${linkTarget.id}/account` : '/api/students',{method:'POST',body:JSON.stringify(linkTarget ? accountId ? {accountId} : {password:form.password} : {name:form.name,email:form.email,password:form.password,profile:{phone:form.phone,nationality:form.nationality}})});
      const data = await api('/api/students?page=1&limit=200');setStudents(data.items || []);setSelectedId(student.id);
      setCreateOpen(false);setForm({name:'',email:'',password:'',phone:'',nationality:''});refresh();
    } catch(e) {setError(e.message);} finally {setCreateBusy(false);}
  }
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [localStudents, setStudents] = useState([]);
  const students = useUnifiedRecords(localStudents, 'students');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    api('/api/students?page=1&limit=200')
      .then(data => {
        const items = data.items || [];
        setStudents(items);
        if (items[0]) setSelectedId(items[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const studentId = searchParams.get('studentId');
    if (studentId) setSelectedId(studentId);
  }, [searchParams]);

  const shown = useMemo(
    () =>
      students.filter(student =>
        [
          student.name,
          student.email,
          student.phone,
          student.nationality,
          ...(student.applications || []).flatMap(application => [
            application.program,
            application.university,
            application.country,
            application.status,
            application.intake
          ])
        ]
          .some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))
      ),
    [students, query]
  );

  const selected = shown.find(student => student.id === selectedId) || students.find(student => student.id === selectedId) || null;
  const selectedWhatsApp = String(selected?.phone || '').replace(/[^\d]/g, '');
  const totalApplications = students.reduce((sum, student) => sum + (student.applications?.length || 0), 0);
  const totalInvoices = students.reduce((sum, student) => sum + (student.invoices?.length || 0), 0);
  const outstanding = students.reduce(
    (sum, student) =>
      sum +
      (student.invoices || []).reduce((invoiceSum, invoice) => {
        const paid = (invoice.payments || []).reduce((paymentSum, payment) => paymentSum + Number(payment.amount || 0), 0);
        return invoiceSum + Math.max(0, Number(invoice.total || 0) - paid);
      }, 0),
    0
  );

  if (loading) return <div className="loading-page"><Spinner />جارٍ تحميل ملفات الطلاب...</div>;

  return (
    <>
      {writesEnabled && can(user,'createApplication') && <Button onClick={()=>{setAccountId('');setLinkTarget(null);setForm({name:'',email:'',password:'',phone:'',nationality:''});setError('');setCreateOpen(true);}}>إنشاء حساب طالب</Button>}
      <Modal open={createOpen} onClose={()=>{if (!createBusy) setCreateOpen(false);}} title="إنشاء طالب وحسابه في الموقع">
        <form className="form-grid" onSubmit={createStudent}>
          {['name','email','phone','nationality'].map(key=><Field key={key} label={{name:'الاسم',email:'البريد الإلكتروني',phone:'الهاتف',nationality:'الجنسية'}[key]}><input required={['name','email'].includes(key)} type={key === 'email' ? 'email' : 'text'} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} disabled={createBusy || Boolean(linkTarget)} /></Field>)}
          {linkTarget && <Field label="معرّف حساب الموقع الموجود (اختياري)" hint="لربط حساب موجود بنفس البريد؛ اتركه فارغًا لإنشاء حساب جديد."><input pattern="[a-fA-F0-9]{24}" value={accountId} onChange={e=>setAccountId(e.target.value)} disabled={createBusy} /></Field>}
          {!(linkTarget && accountId) && <Field label="كلمة المرور" hint="8 أحرف على الأقل؛ اخلط أحرفًا وأرقامًا ورموزًا."><input required minLength={8} type="password" autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} disabled={createBusy} /></Field>}
          {error && <p role="alert">{error}</p>}<Button type="submit" disabled={createBusy}>إنشاء الحساب</Button>
        </form>
      </Modal>
      <div className="kpi-grid student-kpis">
        <Card className="kpi-card">
          <div className="kpi-icon"><UserSquare2 /></div>
          <div className="kpi-meta">
            <span>إجمالي الطلاب</span>
            <strong>{students.length}</strong>
            <small>طلاب مرتبطون بالنظام</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><GraduationCap /></div>
          <div className="kpi-meta">
            <span>طلبات القبول</span>
            <strong>{totalApplications}</strong>
            <small>طلبات نشطة ومكتملة</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><Receipt /></div>
          <div className="kpi-meta">
            <span>الفواتير</span>
            <strong>{totalInvoices}</strong>
            <small>فواتير مرتبطة بالطلاب</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><WalletCards /></div>
          <div className="kpi-meta">
            <span>الأرصدة المستحقة</span>
            <strong>{formatMoney(outstanding)}</strong>
            <small>إجمالي المتبقي على الطلاب</small>
          </div>
        </Card>
      </div>

      <div className="students-layout">
        <Card className="students-panel">
          <div className="panel-toolbar">
            <div className="search-box">
              <Search />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث عن طالب..." />
            </div>
            <Badge tone="purple">{shown.length} طالب</Badge>
          </div>

          <div className="students-list">
            {shown.map(student => {
              const latestApplication = student.applications?.[0];
              const latestInvoice = student.invoices?.[0];
              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => setSelectedId(student.id)}
                  className={`student-row ${selected?.id === student.id ? 'selected' : ''}`}
                >
                  <div className="avatar soft">{initials(student.name)}</div>
                  <div className="student-main">
                    <div>
                      <strong>{student.name}</strong>
                      <Badge tone={latestApplication ? 'blue' : 'neutral'}>{latestApplication ? tr(latestApplication.status) : 'بدون طلب'}</Badge>
                    </div>
                    <p>{student.nationality || '—'}</p>
                    <span>{student.email || student.phone || 'لا توجد بيانات تواصل'}</span>
                    <small>{latestInvoice ? `${formatMoney(latestInvoice.total, latestInvoice.currency)} آخر فاتورة` : 'بدون فواتير'}</small>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="student-detail">
          {selected ? (
            <>
              <div className="detail-hero">
                <div className="hero-icon"><UserSquare2 /></div>
                <div>
                  <p className="eyebrow">ملف الطالب</p>
                  <h2>{selected.name}</h2>
                  <span>{selected.nationality || 'الجنسية غير محددة'} · أضيف في {formatDate(selected.createdAt)}</span>
                </div>
              </div>

              <div className="student-contact-grid">
                <div><Phone size={16} /><span>{selected.phone || 'لا يوجد رقم هاتف'}</span></div>
                <div><Mail size={16} /><span>{selected.email || 'لا يوجد بريد إلكتروني'}</span></div>
              </div>

              <div className="student-quick-actions">
                {writesEnabled && can(user,'createApplication') && !selected.websiteSource && <Button onClick={()=>{setAccountId('');setLinkTarget(selected);setForm({name:selected.name || '',email:selected.email || '',phone:selected.phone || '',nationality:selected.nationality || '',password:''});setError('');setCreateOpen(true);}}>إنشاء حساب الموقع لهذا الطالب</Button>}
                <SourceRecordActions record={selected} />
                {selected.phone && <a className="btn btn-secondary" href={`tel:${selected.phone}`}>اتصال</a>}
                {selected.email && <a className="btn btn-secondary" href={`mailto:${selected.email}`}>إيميل</a>}
                {selectedWhatsApp && <a className="btn btn-secondary" href={`https://wa.me/${selectedWhatsApp}`} target="_blank" rel="noreferrer">واتساب</a>}
                {!!selected.applications?.length && <Button type="button" onClick={() => navigate(`/admissions?applicationId=${selected.applications[0].id}`)}>القبول</Button>}
                {!!selected.invoices?.length && user.role !== 'admissions' && <Button type="button" onClick={() => navigate(`/finance?invoiceId=${selected.invoices[0].id}`)}>المالية</Button>}
              </div>

              <div className="student-section">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">القبول</p>
                    <h2>طلبات القبول</h2>
                  </div>
                  <Badge tone="purple">{selected.applications?.length || 0}</Badge>
                </div>

                <div className="student-stack">
                  {selected.applications?.length ? (
                    selected.applications.map(application => (
                      <div className="student-card-row" key={application.id}>
                        <div>
                          <strong>{application.program}</strong>
                          <span>{application.university} · {application.country}</span>
                          <small>{tr(application.status)} · {application.intake || 'بدون فصل محدد'}</small>
                        </div>
                        <div className="student-side-meta">
                          <Badge tone={application.status.includes('Acceptance') ? 'green' : application.status.includes('Rejected') ? 'red' : 'blue'}>
                            {tr(application.status)}
                          </Badge>
                          <div className="student-progress">
                            <Progress value={application.documentProgress} />
                            <small>{application.documentProgress}% مستندات</small>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="document-empty compact-empty">
                      <FileText />
                      <strong>لا توجد طلبات قبول</strong>
                      <span>هذا الطالب لا يملك طلبات مرتبطة حتى الآن.</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="student-section">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">المالية</p>
                    <h2>الفواتير والمدفوعات</h2>
                  </div>
                  <Badge tone="purple">{selected.invoices?.length || 0}</Badge>
                </div>

                <div className="student-stack">
                  {selected.invoices?.length ? (
                    selected.invoices.map(invoice => {
                      if (user.role === 'admissions') {
                        return (
                          <div className="student-card-row" key={`${selected.id}-${invoice.paymentStatus || 'status'}`}>
                            <div>
                              <strong>رسوم التقديم الجامعي</strong>
                              <span>المعروض لموظف القبول: حالة السداد فقط</span>
                            </div>
                            <div className="student-finance-meta">
                              <Badge tone={invoice.paymentStatus === 'Paid' ? 'green' : 'red'}>
                                {invoice.paymentStatus === 'Paid' ? 'مدفوع' : 'غير مدفوع'}
                              </Badge>
                            </div>
                          </div>
                        );
                      }
                      const paid = (invoice.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
                      const balance = Math.max(0, Number(invoice.total || 0) - paid);
                      return (
                        <div className="student-card-row" key={invoice.id}>
                          <div>
                            <strong>{invoice.number}</strong>
                            <span>{invoice.description}</span>
                            <small>استحقاق {formatDate(invoice.dueDate)} · {invoice.currency}</small>
                          </div>
                          <div className="student-finance-meta">
                            <strong>{formatMoney(invoice.total, invoice.currency)}</strong>
                            <small>مدفوع {formatMoney(paid, invoice.currency)}</small>
                            <small>متبقٍ {formatMoney(balance, invoice.currency)}</small>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="document-empty compact-empty">
                      <Receipt />
                      <strong>لا توجد فواتير</strong>
                      <span>لم يتم إنشاء أي فاتورة لهذا الطالب بعد.</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="select-placeholder">
              <UserSquare2 />
              <h3>اختر طالبًا</h3>
              <p>اختر طالبًا من القائمة لمراجعة طلباته وفواتيره وبياناته الأساسية.</p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
