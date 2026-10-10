// Safety status only. Domain adapters must be reviewed before enabling a worker.
export function twoWayReadiness(env=process.env) {
  return {
    backendFoundationReady:true,
    automaticSyncActive:false,
    domainAdaptersComplete:false,
    backupReceiptConfigured:Boolean(env.SYNC_BACKUP_RECEIPT_FILE),
    websiteConfigured:env.STUDY_BIRDS_ENABLED==='true' && Boolean(env.STUDY_BIRDS_API_TOKEN),
    deletionMode:'review-only',
    safeguards:['stable-identities','three-way-merge','durable-outbox','idempotent-operations','distributed-worker-lease','backup-gate'],
  };
}
export function mountTwoWayReadiness(app,{allowModule,allowRoles}) {
  app.get('/api/integrations/website/two-way/status',allowModule('website'),allowRoles('admin','management'),(req,res)=>res.set('Cache-Control','no-store').json(twoWayReadiness()));
}
