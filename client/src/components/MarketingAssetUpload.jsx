import React, {useState} from 'react';
import {api} from '../api.js';
import {Button,Card} from './UI.jsx';
export default function MarketingAssetUpload({onSaved}) {
 const [form,setForm]=useState({title:'',description:'',type:'asset',published:true});
 const [file,setFile]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reset,setReset]=useState(0);
 async function save(event){
  event.preventDefault();setError('');setNotice('');
  if(!file){setError('اختر ملفًا.');return;}
  if(file.size>5*1024*1024){setError('حجم الملف يجب ألا يتجاوز 5 ميجابايت.');return;}
  setBusy(true);
  try{const body=new FormData();for(const [key,value] of Object.entries(form))body.set(key,String(value));body.set('file',file);
   await api('/api/integrations/website/marketing-assets',{method:'POST',body});
   setFile(null);setForm({title:'',description:'',type:'asset',published:true});setReset(value=>value+1);setNotice('تمت إضافة المادة إلى الموقع.');onSaved?.();
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <Card><h3>إضافة مادة تسويق للوكلاء</h3><form onSubmit={save} className="website-action-form">
  <label className="field"><span>عنوان المادة</span><input required maxLength={160} disabled={busy} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
  <label className="field"><span>وصف المادة</span><textarea maxLength={5000} disabled={busy} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
  <label className="field"><span>نوع المادة</span><input maxLength={60} disabled={busy} value={form.type} onChange={e=>setForm({...form,type:e.target.value})}/></label>
  <label className="field"><span>ملف المادة، حتى 5 ميجابايت</span><input key={reset} type="file" required disabled={busy} onChange={e=>setFile(e.target.files?.[0] || null)}/></label>
  <label className="field"><span>نشر للوكلاء</span><input type="checkbox" disabled={busy} checked={form.published} onChange={e=>setForm({...form,published:e.target.checked})}/></label>
  {error && <p role="alert" className="website-error">{error}</p>}{notice && <p role="status">{notice}</p>}
  <Button type="submit" disabled={busy}>{busy?'جارٍ الرفع…':'رفع المادة إلى الموقع'}</Button>
 </form></Card>;
}
