const {digest}=require('./syncMerge.cjs');
const {plan}=require('./twoWaySyncPlan.cjs');
// Adapters must validate business rules and perform compare-and-set writes.
// No raw Mongo collection mirroring: auth, accounting and ownership rules remain in adapters.
function createDurableSync({store,local,remote,assertReady}) {
  let flight;
  async function run() {
    if(flight)return flight;
    flight=(async()=>{
      await assertReady();
      // A distributed lease, supplied by the store, protects workers across processes.
      const lease=await store.acquire();
      if(!lease)return {busy:true};
      try {
        // Retry persistent jobs first. An unconfirmed HTTP result uses the SAME operation ID.
        async function deliver(job) {
          try {
            await store.assertLease(lease);
            const result=job.push ? await remote.apply(job) : {value:job.value,revision:job.expectedRevision};
            await store.markRemoteApplied(job.operationId,result);
            await store.assertLease(lease);
            if(job.pull)await local.apply({...job,value:result.value});
            await store.complete(job.operationId,{key:job.key,value:result.value,revision:result.revision});
          } catch(error) {
            await store.fail(job.operationId,{status:error.status===409?'conflict':'pending',message:error.message});
          }
        }
        for(const job of await store.pending())await deliver(job);
        const [left,right,checkpoints]=await Promise.all([local.snapshot(),remote.snapshot(),store.checkpoints()]);
        if(!left.complete || !right.complete)throw new Error('Incomplete manifests; no new jobs queued');
        const result=plan({local:left.rows,remote:right.rows,checkpoints,localComplete:true,remoteComplete:true});
        await store.saveReviews(result.conflicts,result.deletionReviews);
        for(const job of result.writes) {
          if(await store.hasOpenConflict(job.key))continue;
          await store.enqueue(job); // Durable BEFORE any remote write.
          await deliver(job);
        }
        return {planned:result.writes.length,conflicts:result.conflicts.length,deletionReviews:result.deletionReviews.length};
      } finally{await store.release(lease);}
    })();
    try{return await flight;}finally{flight=null;}
  }
  return {run};
}
function reviewId(key,value){return digest({key,value});}
module.exports={createDurableSync,reviewId};
