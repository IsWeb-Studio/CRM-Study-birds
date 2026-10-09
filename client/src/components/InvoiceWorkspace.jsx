import React,{useState} from 'react';
import {api} from '../api.js';
import {Button,Field,Modal} from './UI.jsx';
export default function InvoiceWorkspace({invoice,onSaved}){
 const [open,setOpen]=useState(false),[plan,setPlan]=useState([]),[notes,setNotes]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <><Button variant="ghost" type="button" onClick={()=>{setPlan(invoice.installments || []);setNotes(invoice.notes || '');setError('');setOpen(true);}}>خطة الأقساط</Button><Modal open={open} onClose={()=>{if(!busy)setOpen(false);}} title={`خطة الأقساط · ${invoice.number}`}>
   <form className="form-grid" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await api(`/api/invoices/${invoice.id}/crm`,{method:'PATCH',body:JSON.stringify({notes,installments:plan.map(row=>({...row,amount:Number(row.amount)}))})});await onSaved?.();setOpen(false);}catch(e){setError(e.message);}finally{setBusy(false);}}}>
    {plan.map((row,index)=><React.Fragment key={row.id || index}><Field label={`مبلغ القسط ${index+1} (${invoice.currency})`}><input required type="number" min="0.01" step="0.01" value={row.amount} onChange={e=>setPlan(plan.map((row,i)=>i===index?{...row,amount:e.target.value}:row))}/></Field><Field label="تاريخ الاستحقاق"><input required type="date" value={row.dueDate} onChange={e=>setPlan(plan.map((row,i)=>i===index?{...row,dueDate:e.target.value}:row))}/></Field><Button type="button" variant="ghost" onClick={()=>setPlan(plan.filter((_,i)=>i!==index))}>إزالة القسط</Button></React.Fragment>)}
    <Button type="button" variant="secondary" disabled={plan.length>=36 || busy} onClick={()=>setPlan([...plan,{amount:'',dueDate:''}])}>إضافة قسط</Button><Field label="ملاحظات"><textarea value={notes} maxLength={10000} onChange={e=>setNotes(e.target.value)} /></Field>{error && <p role="alert">{error}</p>}<Button type="submit" disabled={busy}>حفظ الخطة</Button>
   </form></Modal></>;
}
