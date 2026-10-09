import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { websiteSections } from '../websiteSections.js';
import WebsitePage from '../pages/WebsitePage.jsx';
import { Card, Button } from './UI.jsx';
import { UnifiedSectionContext } from './UnifiedSectionContext.jsx';
import SourceRecordActions from './SourceRecordActions.jsx';
import { useAuth } from '../auth.jsx';
import { can } from '../permissions.js';

const primary = { students:'students', admissions:'applications', finance:'financials', hr:'employees', programs:'programs', universities:'programs',scholarships:'scholarshipCatalog' };
const nativeLabels = { students:'الطلاب', admissions:'طلبات القبول', finance:'الفواتير', hr:'الموظفون', programs:'البرامج', universities:'الدليل الجامعي', consultancy:'العملاء المحتملون', inbox:'المحادثات', reception:'الاستقبال', scholarships:'دليل المنح', settings:'إعدادات المؤسسة', catalogManagement:'تحرير الدليل' };
export default function SectionWorkspace({ module, children }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(() => params.get('resource') && params.get('resource') !== primary[module] ? params.get('resource') : children ? 'main' : websiteSections[module]?.[0]);
  const [records, setRecords] = useState({}), [connection, setConnection] = useState(null), [errors, setErrors] = useState([]), [loading, setLoading] = useState(false);
  const [legacyCatalog, setLegacyCatalog] = useState({});
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const requestVersion = ++version.current;
    setLoading(true);
    try {
      const status = await api('/api/integrations/website/status'); if (version.current !== requestVersion) return; setConnection(status);
      if (!status.ready) { setRecords({}); setLoading(false); return; }
      const keys = (websiteSections[module] || []).filter(key => status.resources.some(item => item.key === key));
      if (module === 'inbox') keys.push('messaging','mail');
      const results = await Promise.allSettled(keys.map(key => api(key === 'messaging' ? '/api/integrations/website/messaging/contacts' : key === 'mail' ? '/api/integrations/website/section-mail' : `/api/integrations/website/requests/${key}`)));
      const next = {}, failed = [];
      if (version.current !== requestVersion) return;
      results.forEach((result, i) => { if (result.status === 'fulfilled') next[keys[i]] = ['messaging','mail'].includes(keys[i]) ? { rows:result.value } : result.value; else failed.push(`${status.resources.find(item => item.key === keys[i])?.label || (keys[i] === 'mail' ? 'البريد' : 'المحادثات')}: ${result.reason.message}`); });
      if (['universities', 'programs', 'catalogManagement'].includes(module)) {
        try { const legacy = await api('/api/education-catalog?source=crm'); if (version.current === requestVersion) setLegacyCatalog(legacy); } catch (e) { failed.push(e.message); }
      }
      if (version.current !== requestVersion) return;
      setRecords(current => ({ ...current, ...next })); setErrors(failed);
    } catch (e) { if (version.current === requestVersion) setErrors([e.message]); } finally { if (version.current === requestVersion) setLoading(false); }
  }, [module]);
  useEffect(() => { setRecords({}); setErrors([]); refresh(); return () => { version.current++; }; }, [refresh]);
  useEffect(() => { const resource = params.get('resource'); setTab(resource && websiteSections[module]?.includes(resource) ? resource === primary[module] ? 'main' : resource : children ? 'main' : websiteSections[module]?.[0]); }, [params, module]);
  const resources = (connection?.resources || []).filter(item => websiteSections[module]?.includes(item.key) && item.key !== primary[module]);
  const notificationRecord = params.get('resource') === primary[module] && records[primary[module]]?.rows?.find(row => row._id === params.get('id'));
  const dismissNotification = () => { const next = new URLSearchParams(params); next.delete('id'); setParams(next, { replace:true }); };
  const localRows = (legacyCatalog[tab] || []).map((row, index) => typeof row === 'string' ? { id:`crm:${tab}:${index}`, name:row, __crm:true } : { ...row, __crm:true });
  return <UnifiedSectionContext.Provider value={{ records, refresh, ready:connection?.ready, writesEnabled:connection?.writesEnabled }}><div className="section-workspace">
    <Card><div className="panel-toolbar"><div className="table-actions">
      {children && <Button variant={tab === 'main' ? 'primary' : 'ghost'} onClick={() => setTab('main')}>{nativeLabels[module] || 'السجلات'}</Button>}
      {resources.map(item => <Button key={item.key} variant={tab === item.key ? 'primary' : 'ghost'} onClick={() => setTab(item.key)}>{item.label.replace('الموقع','').trim()}</Button>)}
    </div><div className="table-actions">{['programs','universities'].includes(module) && connection?.writesEnabled && can(user, 'manageWebsite') && <SourceRecordActions label="إضافة برنامج" record={{websiteSource:{resource:'programs',record:{}}}} />}{module === 'universities' && connection?.writesEnabled && can(user,'manageWebsite') && <SourceRecordActions label="إضافة جامعة" record={{websiteSource:{resource:'universities',record:{}}}} />}{module === 'scholarships' && connection?.writesEnabled && can(user,'manageWebsite') && <SourceRecordActions label="إضافة منحة" record={{websiteSource:{resource:'scholarshipCatalog',record:{}}}} />}<Button variant="secondary" disabled={loading} onClick={refresh}>تحديث</Button></div></div></Card>
    {errors.map(error => <p key={error} role="alert" className="website-error">{error}</p>)}
    {connection && !connection.ready && <p role="status">ربط الموقع غير مفعّل؛ السجلات الحالية متاحة.</p>}
    {tab === 'main' && (module === 'catalogManagement' ? <WebsitePage embedded resources={['countries','universities','programs','scholarshipCatalog','studyFields']} /> : children)}
    {tab !== 'main' && <WebsitePage key={tab} embedded resources={[tab]} localRows={localRows} />}
    {notificationRecord && <WebsitePage dialogOnly resources={[primary[module]]} externalRecord={notificationRecord} onDismiss={dismissNotification} onSaved={() => { dismissNotification(); refresh(); }} />}
  </div></UnifiedSectionContext.Provider>;
}
