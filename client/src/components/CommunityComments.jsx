import React,{useState} from 'react';
import {api,formatDate} from '../api.js';
import {Button} from './UI.jsx';
export default function CommunityComments({postId,comments,writable,onSaved}) {
 const [selected,setSelected]=useState(null),[status,setStatus]=useState('hidden'),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(e){e.preventDefault();setBusy(true);setError('');try{await api(`/api/integrations/website/community-posts/${postId}/comments/${selected._id}`,{method:'POST',body:JSON.stringify({status,moderationNote:note})});setSelected(null);onSaved?.();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section><h3>تعليقات المنشور</h3>{comments.map(row=><div key={row._id} className="student-card-row"><strong>{row.author?.name || 'طالب'} · {formatDate(row.createdAt)}</strong><p>{row.body}</p><span>{row.status==='hidden'?'مخفي':'منشور'}</span>{writable && <Button variant="secondary" disabled={busy} onClick={()=>{setSelected(row);setStatus(row.status);setNote(row.moderationNote || '');setError('');}}>إدارة التعليق</Button>}</div>)}{!comments.length && <p>لا توجد تعليقات.</p>}
 {selected && <form onSubmit={save}><label className="field"><span>حالة التعليق</span><select disabled={busy} value={status} onChange={e=>setStatus(e.target.value)}><option value="published">منشور</option><option value="hidden">مخفي</option></select></label><label className="field"><span>سبب الإشراف على التعليق</span><textarea required={status==='hidden'} maxLength={500} disabled={busy} value={note} onChange={e=>setNote(e.target.value)}/></label><Button type="submit" disabled={busy || !writable}>حفظ التعليق</Button></form>}
 {error && <p role="alert">{error}</p>}</section>;
}
