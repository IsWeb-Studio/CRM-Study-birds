import React,{useState} from 'react';
import {api,formatMoney,formatDate} from '../api.js';
import {Button,Modal} from './UI.jsx';
export default function FinancialReconciliation({invoice,canImport,onSaved}){
 const [open,setOpen]=useState(false),[view,setView]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setOpen(true);setBusy(true);setError('');try{setView(await api(`/api/invoices/${invoice.id}/reconciliation`));}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function reconcile(){setBusy(true);setError('');try{setView(await api(`/api/invoices/${invoice.id}/reconciliation`,{method:'POST',body:JSON.stringify({version:view.version,proofIds:view.proofs.filter(row=>row.status==='approved' && !row.imported && row.amount>0).map(row=>row._id)})}));await onSaved?.();}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function openProof(id){try{const link=await api(`/api/integrations/website/files/payment-proofs/${id}`,{method:'POST'});if(!link.url?.startsWith('https://'))throw new Error('الرابط غير متاح');window.open(link.url,'_blank','noopener,noreferrer');}catch(e){setError(e.message);}}
 return <><Button variant="secondary" onClick={load}>مطابقة دفعات الموقع</Button><Modal open={open} onClose={()=>{if(!busy)setOpen(false);}} title={`مطابقة الفاتورة · ${invoice.number}`} size="lg">
  {error && <p role="alert">{error}</p>}{view && <>
   <dl className="website-details">{Object.entries({total:'إجمالي الفاتورة',paid:'المحصّل بالموقع',wallet:'المدفوع من المحفظة',crm:'المدفوع عبر CRM',crmReceipts:'السندات المسجلة في CRM',proofTotal:'الإثباتات المعتمدة',unallocated:'فرق بلا إثبات',overlap:'فرق متعارض'}).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{formatMoney(view[key],view.currency)}</dd></div>)}</dl>
   <h3>إثباتات الدفع</h3>{view.proofs.map(row=><div className="history-row" key={row._id}><div><strong>{formatMoney(row.amount,view.currency)}</strong><span>{({approved:'معتمد',pending:'قيد المراجعة',rejected:'مرفوض'})[row.status] || row.status} · {row.imported?'سند مستورد':'لم يُستورد'}</span></div><Button variant="ghost" onClick={()=>openProof(row._id)}>فتح الإثبات</Button></div>)}
   <h3>حركات المحفظة المرتبطة</h3>{view.walletEntries.map(row=><p key={row._id}>{row.direction==='credit'?'إضافة رصيد':'خصم رصيد'} · {formatMoney(row.amount,view.currency)} · {formatDate(row.createdAt)}</p>)}
   <h3>تاريخ رصيد CRM بالموقع</h3>{view.history.map((row,index)=><p key={row._id || index}>الرصيد المسجل {formatMoney(row.amount,view.currency)} · {formatDate(row.changedAt)}</p>)}
   {view.conflicts.length>0 && <p role="alert">تغيّرت حالة إثبات مستورد؛ راجعه قبل المطابقة.</p>}
   <p>استيراد الإثباتات المعتمدة يضيف سنداتها إلى هذه الفاتورة مرة واحدة، دون تغيير رصيد الموقع. الفرق بلا إثبات يبقى للمراجعة.</p>
   {canImport && <Button disabled={busy || view.overlap>0.01 || view.conflicts.length>0 || !view.proofs.some(row=>row.status==='approved' && !row.imported && row.amount>0)} onClick={reconcile}>استيراد السندات المعتمدة</Button>}
  </>}
 </Modal></>;
}
