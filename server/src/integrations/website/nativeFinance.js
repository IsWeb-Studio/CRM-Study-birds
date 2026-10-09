// Source balances already include mirrored CRM receipts; adding receipts again
// would double-count them. Independent invoices continue using the native ledger.
export function invoicePaidAmount(invoice, payments = []) {
  if (invoice.websiteSource?.paid !== undefined) return Math.min(Number(invoice.total || 0), Math.max(0,Number(invoice.websiteSource.paid || 0)));
  return payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}
