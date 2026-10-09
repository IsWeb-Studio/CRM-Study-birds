import {randomUUID} from 'node:crypto';
import {websitePaid,materializeWebsiteRows} from './nativeRecords.js';
const idOf=value=>typeof value==='string'?value:value?._id;
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
export function reconciliationPreview(db,companyId,localInvoice,snapshot){
 const invoice=snapshot.invoice;
 if(idOf(invoice)!==localInvoice.websiteSource?.id || idOf(invoice.student)!==(db.students || []).find(row=>row.id===localInvoice.studentId && row.companyId===companyId)?.websiteSource?.id)fail('هوية الفاتورة أو الطالب لا تتطابق.');
 const payments=(db.payments || []).filter(row=>row.companyId===companyId && row.invoiceId===localInvoice.id);
 const paid=websitePaid(invoice),wallet=Number(invoice.walletCreditApplied || 0),crm=Number(invoice.crmPaidAmount || 0);
 const proofs=(snapshot.proofs || []).filter(row=>idOf(row.invoice)===invoice._id && idOf(row.student)===idOf(invoice.student)).map(row=>({...row,imported:payments.some(payment=>payment.websiteSource?.resource==='paymentProofs' && payment.websiteSource.id===row._id)}));
 const approved=proofs.filter(row=>row.status==='approved' && Number.isFinite(row.amount) && row.amount>0);
 const proofTotal=approved.reduce((sum,row)=>sum+row.amount,0);
 const available=Math.max(0,paid-wallet-crm);
 const conflicts=payments.filter(payment=>payment.websiteSource?.resource==='paymentProofs' && !proofs.some(proof=>proof._id===payment.websiteSource.id && proof.status==='approved' && proof.amount===payment.amount && (payment.currency || 'USD')===(invoice.currency || 'USD'))).map(payment=>payment.websiteSource.id);
 return {version:invoice.__v || 0,currency:invoice.currency || 'USD',total:invoice.amount,paid,wallet,crm,proofTotal,unallocated:Math.max(0,available-proofTotal),overlap:Math.max(0,proofTotal-available),conflicts,crmReceipts:payments.filter(row=>!row.websiteSource).reduce((sum,row)=>sum+Number(row.amount || 0),0),proofs,walletEntries:snapshot.wallet || [],history:invoice.crmPaymentHistory || []};
}
export function reconcileProofReceipts(db,companyId,localInvoice,snapshot,body,actor){
 const view=reconciliationPreview(db,companyId,localInvoice,snapshot);
 if(!body || Object.keys(body).some(key=>!['version','proofIds'].includes(key)) || body.version!==view.version || !Array.isArray(body.proofIds) || !body.proofIds.length || new Set(body.proofIds).size!==body.proofIds.length)fail('حدّث المطابقة واختر إثباتات صحيحة.');
 if(view.overlap>0.01 || view.conflicts.length)fail('توجد دفعات متعارضة تحتاج مراجعة قبل استيراد السندات.');
 const chosen=body.proofIds.map(id=>view.proofs.find(row=>row._id===id));
 if(chosen.some(row=>!row || row.status!=='approved' || !Number.isFinite(row.amount) || row.amount<=0))fail('لا يمكن استيراد إثبات غير معتمد أو بمبلغ غير صحيح.');
 db.payments ||= [];
 for(const proof of chosen){
  const existing=db.payments.find(row=>row.companyId===companyId && row.websiteSource?.resource==='paymentProofs' && row.websiteSource.id===proof._id);
  if(existing){if(existing.invoiceId!==localInvoice.id || existing.amount!==proof.amount)fail('السند مرتبط بفاتورة أو مبلغ مختلف.');continue;}
  db.payments.push({id:randomUUID(),companyId,invoiceId:localInvoice.id,receiptNumber:`WEB-${proof._id}`,amount:proof.amount,currency:view.currency,method:'إثبات دفع من الموقع',reference:proof._id,date:(proof.reviewedAt || proof.createdAt || '').slice(0,10),createdAt:proof.reviewedAt || proof.createdAt,statement:localInvoice.description,locked:true,receivedBy:'Study Birds',notes:proof.reviewNote || '',websiteSource:{resource:'paymentProofs',id:proof._id,readOnly:true,invoiceVersion:view.version},importedBy:actor.sub,importedAt:new Date().toISOString()});
 }
 materializeWebsiteRows(db,companyId,'financials',[snapshot.invoice],actor.sub);
 db.activities ||= [];db.activities.unshift({id:randomUUID(),companyId,actorId:actor.sub,actorName:actor.name,action:'reconciled',entityType:'invoice',entityId:localInvoice.id,details:'مطابقة إثباتات الموقع، دون تغيير رصيد الموقع',createdAt:new Date().toISOString()});
 return reconciliationPreview(db,companyId,localInvoice,snapshot);
}
export function mountFinancialReconciliation(app,{allowModule,allowAction,readDb,mutateDb,client}){
 const locate=(db,req)=>{const row=db.invoices.find(row=>row.companyId===req.user.companyId && row.id===req.params.id);if(!row?.websiteSource?.id)fail('الفاتورة غير مرتبطة بالموقع.',404);return row;};
 app.get('/api/invoices/:id/reconciliation',allowModule('finance'),async(req,res)=>{const db=await readDb(),row=locate(db,req);const snapshot=await client.request(`/crm/invoices/${row.websiteSource.id}/reconciliation`);res.json(reconciliationPreview(db,req.user.companyId,row,snapshot));});
 app.post('/api/invoices/:id/reconciliation',allowModule('finance'),allowAction('recordPayment'),async(req,res)=>res.json(await mutateDb(async db=>{const row=locate(db,req),snapshot=await client.request(`/crm/invoices/${row.websiteSource.id}/reconciliation`);return reconcileProofReceipts(db,req.user.companyId,row,snapshot,req.body,req.user);})));
}
