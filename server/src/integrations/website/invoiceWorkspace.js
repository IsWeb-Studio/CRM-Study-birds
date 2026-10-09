import {randomUUID} from 'node:crypto';
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export function updateInvoiceWorkspace(db,companyId,id,body){
  const row=db.invoices.find(row=>row.id===id && row.companyId===companyId);
  if(!row)throw Object.assign(new Error('الفاتورة غير موجودة.'),{status:404});
  if(Object.keys(body).some(key=>!['notes','installments'].includes(key)) || body.notes!==undefined && (typeof body.notes!=='string' || body.notes.length>10000))fail('بيانات الخطة غير صالحة.');
  let installments;
  if(body.installments!==undefined){
    if(!Array.isArray(body.installments) || body.installments.length>36)fail('خطة الأقساط غير صالحة.');
    installments=body.installments.map((item,index)=>{
      if(typeof item!=='object' || !item || !Number.isFinite(item.amount) || item.amount<=0 || !/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate || '') || Number.isNaN(Date.parse(item.dueDate)))fail('حدد مبلغًا وتاريخًا صحيحًا لكل قسط.');
      const old=item.id && row.installments?.find(row=>row.id===item.id);
      if(item.id && !old)fail('القسط غير موجود.');
      return {...old,id:old?.id || randomUUID(),label:String(item.label || `قسط ${index+1}`).slice(0,100),amount:item.amount,dueDate:item.dueDate,createdAt:old?.createdAt || new Date().toISOString()};
    });
    if(new Set(installments.map(row=>row.id)).size!==installments.length)fail('قسط مكرر.');
    if(installments.length && Math.abs(installments.reduce((sum,row)=>sum+row.amount,0)-Number(row.total || 0))>0.01)fail('مجموع الأقساط يجب أن يساوي إجمالي الفاتورة.');
    for(const payment of db.payments || [])if(payment.companyId===companyId && payment.invoiceId===id && payment.installmentId){
      const installment=installments.find(row=>row.id===payment.installmentId);
      const paid=(db.payments || []).filter(row=>row.companyId===companyId && row.invoiceId===id && row.installmentId===payment.installmentId).reduce((sum,row)=>sum+Number(row.amount || 0),0);
      if(!installment || installment.amount<paid)fail('لا يمكن حذف قسط له دفعات أو تخفيضه عن المدفوع.');
    }
  }
  if(installments)row.installments=installments;
  if(body.notes!==undefined)row.notes=body.notes;
  row.updatedAt=new Date().toISOString();return row;
}
export function mountInvoiceWorkspace(app,{allowModule,allowAction,mutateDb}){
  app.patch('/api/invoices/:id/crm',allowModule('finance'),allowAction('createInvoice'),async(req,res)=>res.json(await mutateDb(db=>{
    const row=updateInvoiceWorkspace(db,req.user.companyId,req.params.id,req.body || {});
    db.activities ||= [];db.activities.unshift({id:randomUUID(),companyId:req.user.companyId,actorId:req.user.sub,actorName:req.user.name,action:'updated',entityType:'invoice',entityId:row.id,details:'تحديث خطة الأقساط',createdAt:row.updatedAt});db.activities=db.activities.slice(0,500);return row;
  })));
}
