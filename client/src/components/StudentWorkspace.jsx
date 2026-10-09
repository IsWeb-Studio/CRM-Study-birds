import React,{useEffect,useState} from 'react';
import {api,formatDate} from '../api.js';
import {Button,Field} from './UI.jsx';
export default function StudentWorkspace({student,onSaved}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[title,setTitle]=useState(''),[dueDate,setDueDate]=useState('');
  const path=`/api/students/${student.id}/crm`;
  useEffect(()=>{let active=true;setData(null);setError('');setTitle('');setDueDate('');api(path).then(value=>{if(active)setData(value);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[path]);
  async function run(action){setBusy(true);setError('');try{await action();onSaved?.();}catch(e){setError(e.message);}finally{setBusy(false);}}
  if(!data)return error ? <p role="alert">{error}</p> : <p>جارٍ تحميل المتابعة...</p>;
  return <div className="student-section"><div className="section-head"><h2>المتابعة والمهام</h2></div>
    <form className="form-grid" onSubmit={event=>{event.preventDefault();run(()=>api(path,{method:'PATCH',body:JSON.stringify({notes:data.notes,consultantId:data.consultantId})}));}}>
      <Field label="المستشار"><select value={data.consultantId} onChange={e=>setData({...data,consultantId:e.target.value})}><option value="">غير مسند</option>{data.consultants.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
      <Field label="ملاحظات المتابعة"><textarea maxLength={20000} value={data.notes} onChange={e=>setData({...data,notes:e.target.value})} /></Field><Button type="submit" disabled={busy}>حفظ المتابعة</Button>
    </form>
    <form className="form-grid" onSubmit={event=>{event.preventDefault();run(async()=>{const task=await api(`${path}/tasks`,{method:'POST',body:JSON.stringify({title,dueDate})});setData({...data,tasks:[task,...data.tasks]});setTitle('');});}}>
      <Field label="مهمة جديدة"><input required maxLength={300} value={title} onChange={e=>setTitle(e.target.value)} /></Field><Field label="موعد المتابعة"><input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} /></Field><Button type="submit" disabled={busy}>إضافة مهمة</Button>
    </form><div className="student-stack">{data.tasks.map(task=><div className="student-card-row" key={task.id}><strong>{task.title}</strong><span>{task.status==='done'?'مكتملة':'مفتوحة'} · {task.dueDate ? formatDate(task.dueDate) : 'بدون موعد'}</span></div>)}</div>
    {error && <p role="alert">{error}</p>}
  </div>;
}
