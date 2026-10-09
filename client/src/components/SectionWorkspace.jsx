import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import WebsitePage from '../pages/WebsitePage.jsx';
import WebsiteCommunication from '../pages/WebsiteCommunication.jsx';
import { websiteSections } from '../websiteSections.js';
import { Card } from './UI.jsx';

export default function SectionWorkspace({ module, children }) {
  const [params] = useSearchParams();
  const [source, setSource] = useState(params.get('resource') || !children ? 'website' : 'all');
  useEffect(() => { if (params.get('resource')) setSource('website'); }, [params]);
  return <div className="section-workspace">
    <Card><div className="website-toolbar"><strong>مصدر البيانات</strong>
      <label className="field"><span>عرض سجلات القسم</span><select aria-label="مصدر البيانات" value={source} onChange={e => setSource(e.target.value)}>
        {children && <option value="all">كل المصادر</option>}
        {children && <option value="crm">سجلات CRM</option>}
        <option value="website">سجلات الموقع</option>
      </select></label></div>
      <p>سجلات الموقع تُقرأ من مصدرها، وحفظ إجراءاتها يحدّث الموقع. سجلات CRM الحالية تحتفظ ببياناتها ووظائفها.</p>
    </Card>
    {children && source !== 'website' && <section aria-label="سجلات CRM"><h2 className="source-heading">سجلات CRM</h2>{children}</section>}
    {source !== 'crm' && <section aria-label="سجلات الموقع"><WebsitePage key={module} embedded resources={websiteSections[module] || []} />{module === 'inbox' && <WebsiteCommunication />}</section>}
  </div>;
}
