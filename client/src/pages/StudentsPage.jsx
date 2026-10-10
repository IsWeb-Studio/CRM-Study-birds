import {WebsiteFields} from './WebsiteOperations.jsx';
import StudentWorkspace from '../components/StudentWorkspace.jsx';
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, GraduationCap, Mail, Phone, Receipt, Search, UserSquare2, WalletCards } from 'lucide-react';
import { api, formatDate, formatMoney, initials } from '../api.js';
import { Badge, Button, Card, Field, Modal, Progress, Spinner } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { tr } from '../i18n.js';
import { UnifiedSectionContext } from '../components/UnifiedSectionContext.jsx';
import {can} from '../permissions.js';
import {mergeRecords,normalizeWebsiteRecord} from '../unifiedRecords.js';
import SourceRecordActions from '../components/SourceRecordActions.jsx';

const profileFields=['englishFullName','passportNumber','dateOfBirth','gpa','bio','address','intake','nativeLanguage','currentEducation','currentEducationLevel','currentResidenceCountry','currentResidenceRegion','otherLanguages','targetCountries','parentInfo','emergencyContact','englishTest'];
export default function StudentsPage() {
  const { user } = useAuth();
  const {refresh,writesEnabled,records} = useContext(UnifiedSectionContext);
  const [createOpen,setCreateOpen] = useState(false), [createBusy,setCreateBusy] = useState(false), [error,setError] = useState('');
  const [form,setForm] = useState({name:'',email:'',password:'',phone:'',nationality:''});
  const [linkTarget,setLinkTarget] = useState(null);
  const [accountId,setAccountId]=useState('');
  async function createStudent(event) {
    event.preventDefault();setCreateBusy(true);setError('');
    try {
      const profile=Object.fromEntries(['phone','nationality',...profileFields].filter(key=>form[key]!==undefined && form[key]!=='').map(key=>[key,['otherLanguages','targetCountries'].includes(key)?String(form[key]).split('\n').map(value=>value.trim()).filter(Boolean):key==='dateOfBirth'?new Date(form[key]).toISOString():form[key]]));
      const student = await api(linkTarget ? `/api/students/${linkTarget.id}/account` : '/api/students',{method:'POST',body:JSON.stringify(linkTarget ? accountId ? {accountId} : {password:form.password} : {name:form.name,email:form.email,password:form.password,profile})});
      setOpenedStudent(student);setSelectedId(student.id);setPage(1);setSearchValue('');setQuery('');setReload(value=>value+1);
      setCreateOpen(false);setForm({name:'',email:'',password:'',phone:'',nationality:''});refresh();
    } catch(e) {setError(e.message);} finally {setCreateBusy(false);}
  }
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [localStudents, setStudents] = useState([]);
  const students=useMemo(()=>{const ids=new Set(localStudents.map(row=>row.websiteSource?.id));return mergeRecords(localStudents,(records.students?.rows || []).filter(row=>ids.has(row._id)).map(row=>normalizeWebsiteRecord('students',row)),'students');},[localStudents,records.students]);
  const [page,setPage]=useState(1),[pageInfo,setPageInfo]=useState({total:0,totalPages:1}),[reload,setReload]=useState(0),[openedStudent,setOpenedStudent]=useState(null);
  const [searchValue,setSearchValue]=useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(()=>{if(searchValue.trim()===query)return;const timer=setTimeout(()=>{setPage(1);setQuery(searchValue.trim());},300);return()=>clearTimeout(timer);},[searchValue,query]);
  useEffect(() => {
    let active=true;setLoading(true);
    api(`/api/students?page=${page}&limit=50&q=${encodeURIComponent(query)}`)
      .then(data=>{if(!active)return;const items=data.items || [];setStudents(items);setSelectedId(current=>current || items[0]?.id || null);setPageInfo({total:data.total ?? items.length,totalPages:data.totalPages || 1});setError('');})
      .catch(e=>{if(active)setError(e.message);})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  }, [page,query,reload,records.students?.nativePayload]);

  useEffect(() => {
    const studentId = searchParams.get('studentId');
    if(studentId){setSelectedId(studentId);api(`/api/students?page=1&limit=1&id=${encodeURIComponent(studentId)}`).then(data=>setOpenedStudent(data.items?.[0] || null)).catch(e=>setError(e.message));}
  }, [searchParams]);

  const shown=students;
  const selected = shown.find(student => student.id === selectedId) || (openedStudent?.id===selectedId?openedStudent:null) || null;
  const selectedWhatsApp = String(selected?.phone || '').replace(/[^\d]/g, '');
  const totalApplications = students.reduce((sum, student) => sum + (student.applications?.length || 0), 0);
  const totalInvoices = students.reduce((sum, student) => sum + (student.invoices?.length || 0), 0);
  const outstanding = students.reduce(
    (sum, student) =>
      sum +
      (student.invoices || []).reduce((invoiceSum, invoice) => {
        const paid = invoice.paid ?? (invoice.payments || []).reduce((paymentSum, payment) => paymentSum + Number(payment.amount || 0), 0);
        return invoiceSum + Math.max(0, Number(invoice.total || 0) - paid);
      }, 0),
    0
  );



  return (
    <>
      {writesEnabled && can(user,'createApplication') && <Button onClick={()=>{setAccountId('');setLinkTarget(null);setForm({name:'',email:'',password:'',phone:'',nationality:''});setError('');setCreateOpen(true);}}>إنشاء حساب طالب</Button>}
      <Modal open={createOpen} onClose={()=>{if (!createBusy) setCreateOpen(false);}} title="إنشاء طالب وحسابه في الموقع">
        <form className="form-grid" onSubmit={createStudent}>
          {['name','email','phone','nationality'].map(key=><Field key={key} label={{name:'الاسم',email:'البريد الإلكتروني',phone:'الهاتف',nationality:'الجنسية'}[key]}><input required={['name','email'].includes(key)} type={key === 'email' ? 'email' : 'text'} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} disabled={createBusy || Boolean(linkTarget)} /></Field>)}
          {linkTarget && <Field label="معرّف حساب الموقع الموجود (اختياري)" hint="لربط حساب موجود بنفس البريد؛ اتركه فارغًا لإنشاء حساب جديد."><input pattern="[a-fA-F0-9]{24}" value={accountId} onChange={e=>setAccountId(e.target.value)} disabled={createBusy} /></Field>}
          {!(linkTarget && accountId) && <Field label="كلمة المرور" hint="8 أحرف على الأقل؛ اخلط أحرفًا وأرقامًا ورموزًا."><input required minLength={8} type="password" autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} disabled={createBusy} /></Field>}
          {!linkTarget && <WebsiteFields form={form} setForm={setForm} fields={profileFields} options={{currentEducationLevel:[{value:'',label:'غير محدد'},{value:'high-school',label:'الثانوية'},{value:'bachelor',label:'بكالوريوس'},{value:'master',label:'ماجستير'},{value:'phd',label:'دكتوراه'}]}} disabled={createBusy}/>}{error && <p role="alert">{error}</p>}<Button type="submit" disabled={createBusy}>إنشاء الحساب</Button>
        </form>
      </Modal>
      {error && !createOpen && <p role="alert">{error}</p>}
      <div className="kpi-grid student-kpis">
        <Card className="kpi-card">
          <div className="kpi-icon"><UserSquare2 /></div>
          <div className="kpi-meta">
            <span>إجمالي الطلاب</span>
            <strong>{pageInfo.total}</strong>
            <small>طلاب مرتبطون بالنظام</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><GraduationCap /></div>
          <div className="kpi-meta">
            <span>طلبات القبول</span>
            <strong>{totalApplications}</strong>
            <small>طلبات الصفحة المعروضة</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><Receipt /></div>
          <div className="kpi-meta">
            <span>الفواتير</span>
            <strong>{totalInvoices}</strong>
            <small>فواتير الصفحة المعروضة</small>
          </div>
        </Card>
        <Card className="kpi-card">
          <div className="kpi-icon"><WalletCards /></div>
          <div className="kpi-meta">
            <span>الأرصدة المستحقة</span>
            <strong>{formatMoney(outstanding)}</strong>
            <small>المتبقي في الصفحة المعروضة</small>
          </div>
        </Card>
      </div>

      <div className="students-layout">
        <Card className="students-panel">
          <div className="panel-toolbar">
            <div className="search-box">
              <Search />
              <input value={searchValue} onChange={event => setSearchValue(event.target.value)} placeholder="ابحث بالاسم أو البريد أو الهاتف أو الجنسية..." />
            </div>
            <Badge tone="purple">{shown.length} طالب</Badge>
          </div>

          {loading && <p role="status">جارٍ تحميل ملفات الطلاب...</p>}
          <div className="students-list" aria-busy={loading}>
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
          <div className="panel-toolbar"><Button variant="secondary" disabled={loading || page<=1} onClick={()=>setPage(value=>value-1)}>السابق</Button><span>صفحة {page} من {pageInfo.totalPages} · {pageInfo.total} طالب</span><Button variant="secondary" disabled={loading || page>=pageInfo.totalPages} onClick={()=>setPage(value=>value+1)}>التالي</Button></div>
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

              {can(user,'createApplication') && !selected.websiteSource?.readOnly && <StudentWorkspace key={selected.id} student={selected} onSaved={refresh} />}
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
