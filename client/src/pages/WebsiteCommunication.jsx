import React, { useEffect, useState } from 'react';
import { api, formatDate } from '../api.js';
import { Button, Card } from '../components/UI.jsx';
import { useAuth } from '../auth.jsx';
import { can } from '../permissions.js';

export default function WebsiteCommunication() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState([]), [messages, setMessages] = useState([]), [mails, setMails] = useState([]);
  const [recipient, setRecipient] = useState(''), [body, setBody] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [enabled, setEnabled] = useState(false);
  const [connection, setConnection] = useState(false);
  useEffect(() => { let active = true; api('/api/integrations/website/status').then(data => { if (active) { setEnabled(data.writesEnabled && can(user, 'manageWebsite')); setConnection(data.ready); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [user]);
  async function run(task) { setBusy(true); setError(''); try { await task(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function choose(id) { setRecipient(id); setMessages([]); if (id) setMessages(await api(`/api/integrations/website/messaging/${id}`)); }
  return <Card><h2>بريد ومحادثات الموقع</h2>{error && <p role="alert" className="website-error">{error}</p>}
    <div className="website-toolbar"><Button disabled={busy} variant="secondary" onClick={() => run(async () => setMails(await api('/api/integrations/website/section-mail')))}>تحميل بريد تواصل معنا</Button><Button disabled={busy || !connection} variant="secondary" onClick={() => run(async () => setContacts(await api('/api/integrations/website/messaging/contacts')))}>تحميل محادثات الموقع</Button></div>
    <p>البريد يظهر بعد إعداد موصل صندوق البريد. المحادثات المتاحة تخص حساب الموقع المتصل وصلاحياته.</p>
    {mails.map(row => <article key={row.id}><h3>{row.subject}</h3><p>{row.name} — {row.email} — {formatDate(row.receivedAt)}</p><p style={{ whiteSpace: 'pre-wrap' }}>{row.message}</p></article>)}
    <label className="field"><span>جهة الاتصال</span><select disabled={busy} value={recipient} onChange={e => run(() => choose(e.target.value))}><option value="">اختر محادثة</option>{contacts.map(row => <option key={row._id} value={row._id}>{row.name || row.email}</option>)}</select></label>
    {messages.map(row => <article key={row._id}><p style={{ whiteSpace: 'pre-wrap' }}>{row.body}</p><small>{formatDate(row.createdAt)}</small></article>)}
    {enabled && recipient && <form onSubmit={e => { e.preventDefault(); run(async () => { await api(`/api/integrations/website/messaging/${recipient}`, { method: 'POST', body: JSON.stringify({ body }) }); setBody(''); await choose(recipient); }); }}><label className="field"><span>الرسالة</span><textarea disabled={busy} maxLength={4000} value={body} onChange={e => setBody(e.target.value)} /></label><Button disabled={busy || !body.trim()}>إرسال</Button></form>}
  </Card>;
}
