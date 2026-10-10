const {randomUUID}=require('node:crypto');
const {digest}=require('./syncMerge.cjs');
function createMongoSyncStore({db,client,namespace,leaseMs=60000}) {
  if(!namespace)throw new Error('Sync namespace required');
  const jobs=db.collection('two_way_sync_jobs'),state=db.collection('two_way_sync_state'),reviews=db.collection('two_way_sync_reviews');
  const owner=randomUUID(),leaseId=digest([namespace,'lease']);
  const scoped=id=>digest([namespace,id]);
  return {
    async acquire(){
      const now=new Date();
      try {
        const row=await state.findOneAndUpdate({_id:leaseId,$or:[{expiresAt:{$lte:now}},{owner}]},{$set:{namespace,owner,expiresAt:new Date(+now+leaseMs)}},{upsert:true,returnDocument:'after'});
        return row?.owner===owner ? {id:leaseId,owner} : null;
      }catch(error){if(error.code===11000)return null;throw error;}
    },
    async assertLease(lease){
      const result=await state.updateOne({_id:lease.id,owner:lease.owner,expiresAt:{$gt:new Date()}},{$set:{expiresAt:new Date(Date.now()+leaseMs)}});
      if(result.matchedCount!==1)throw Object.assign(new Error('Sync worker lost its lease'),{status:409});
    },
    async release(lease){await state.updateOne({_id:lease.id,owner:lease.owner},{$set:{expiresAt:new Date(0)}});},
    async pending(){return jobs.find({namespace,status:'pending'}).sort({createdAt:1}).toArray();},
    async checkpoints(){const rows=await state.find({namespace,kind:'checkpoint'}).toArray();return Object.fromEntries(rows.map(row=>[row.key,row]));},
    async enqueue(job){await jobs.updateOne({_id:scoped(job.operationId)},{$setOnInsert:{...job,namespace,status:'pending',createdAt:new Date()}},{upsert:true});},
    async markRemoteApplied(id,result){await jobs.updateOne({_id:scoped(id)},{$set:{remoteResult:result,remoteAppliedAt:new Date()}});},
    async complete(id,point){
      const session=client.startSession();
      try{await session.withTransaction(async()=>{
        await state.updateOne({_id:scoped(point.key)},{$set:{namespace,kind:'checkpoint',...point,updatedAt:new Date()}},{upsert:true,session});
        await jobs.updateOne({_id:scoped(id)},{$set:{status:'done',completedAt:new Date()}},{session});
      });}finally{await session.endSession();}
    },
    async fail(id,error){await jobs.updateOne({_id:scoped(id)},{$set:{...error,lastAttemptAt:new Date()},$inc:{attempts:1}});},
    // An unconfirmed older operation also blocks fresh operations for the same entity.
    async hasOpenConflict(key){return !!(await jobs.findOne({namespace,key,status:{$in:['pending','conflict']}}) || await reviews.findOne({namespace,key,status:'open'}));},
    async saveReviews(conflicts,deletions){
      for(const [kind,rows] of [['conflict',conflicts],['deletion',deletions]])for(const row of rows) {
        const id=scoped(digest({kind,...row}));
        await reviews.updateOne({_id:id},{$setOnInsert:{namespace,kind,...row,status:'open',createdAt:new Date()}},{upsert:true});
      }
    },
  };
}
module.exports={createMongoSyncStore};
