import React, { useContext, useState } from 'react';
import WebsitePage from '../pages/WebsitePage.jsx';
import { Button } from './UI.jsx';
import { UnifiedSectionContext } from './UnifiedSectionContext.jsx';
export default function SourceRecordActions({ record, onSaved, label = 'إدارة السجل' }) {
  const [open, setOpen] = useState(false);
  const { refresh } = useContext(UnifiedSectionContext);
  const source = record?.websiteSource;
  if (!source) return null;
  return <><Button variant="secondary" type="button" onClick={() => setOpen(true)}>{label}</Button>
    {open && <WebsitePage dialogOnly resources={[source.resource]} externalRecord={source.record || { _id:source.id }} onDismiss={() => setOpen(false)} onSaved={() => { setOpen(false); refresh(); onSaved?.(); }} />}
  </>;
}
