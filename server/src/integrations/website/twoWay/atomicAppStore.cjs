const {isDeepStrictEqual}=require('node:util');
const {createHash}=require('node:crypto');
const conflict=()=>Object.assign(new Error('تغيرت البيانات على خادم آخر. حدّث الصفحة وراجع التغييرات قبل الحفظ مجددًا.'),{status:409});
const revisionMatch=(id,revision)=>({_id:id,...(revision===0?{$or:[{revision:0},{revision:{$exists:false}}]}:{revision})});
const key=row=>JSON.stringify([row.companyId || '',row.id]);
function createAtomicAppStore({db,client,id,stateCollection='app_state',readModels=[]}) {
 const state=db.collection(stateCollection),directory=db.collection('education_catalog');
 async function read(){
  const session=client.startSession();let snapshot;
  try{await session.withTransaction(async()=>{
   const record=await state.findOne({_id:id},{session});
   const catalog=await directory.findOne({_id:id},{session});
   snapshot={record,catalog,token:{stateExists:!!record,catalogExists:!!catalog,stateRevision:record?.revision ?? 0,catalogRevision:catalog?.revision ?? 0,readModelsReady:record?.readModelsVersion===1}};
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});return snapshot;}finally{await session.endSession();}
 }
 async function commit({payload,catalog,base,previous}){
  if(!base)throw conflict();
  const next={stateExists:true,catalogExists:true,stateRevision:base.stateRevision+1,catalogRevision:base.catalogRevision+1,readModelsReady:true};
  const session=client.startSession();
  try{await session.withTransaction(async()=>{
   const changed={payload,revision:next.stateRevision,readModelsVersion:1,updatedAt:new Date().toISOString()};
   if(base.stateExists){const result=await state.updateOne(revisionMatch(id,base.stateRevision),{$set:changed},{session});if(result.matchedCount!==1)throw conflict();}
   else await state.insertOne({_id:id,...changed},{session});
   const changedCatalog={catalog,revision:next.catalogRevision,updatedAt:changed.updatedAt};
   if(base.catalogExists){const result=await directory.updateOne(revisionMatch(id,base.catalogRevision),{$set:changedCatalog},{session});if(result.matchedCount!==1)throw conflict();}
   else await directory.insertOne({_id:id,...changedCatalog},{session});
   for(const name of readModels){
    const rows=Array.isArray(payload[name])?payload[name]:[],before=Array.isArray(previous?.[name])?previous[name]:[];
    if(base.readModelsReady && (rows===before || isDeepStrictEqual(rows,before)))continue;
    const keys=new Set(rows.map(key));
    if(rows.some(row=>typeof row.id!=='string' || !row.id) || keys.size!==rows.length)throw new Error(`Invalid read model identities: ${name}`);
    const collection=db.collection(`read_${name}`);
    if(rows.length)await collection.bulkWrite(rows.map(row=>({replaceOne:{filter:{id:row.id,companyId:row.companyId},replacement:row,upsert:true}})),{session,ordered:true});
    for(const old of before){
     if(keys.has(key(old)))continue;
     const filter={id:old.id,companyId:old.companyId};
     const projection=await collection.findOne(filter,{session});
     if(!projection)continue;
     // Retain the removed derived view before its exact, company-scoped removal.
     const archiveId=createHash('sha256').update(JSON.stringify([id,name,old.companyId,old.id,next.stateRevision])).digest('hex');
     await db.collection('read_model_history').updateOne({_id:archiveId},{$setOnInsert:{stateId:id,resource:name,companyId:old.companyId,entityId:old.id,revision:next.stateRevision,projection,archivedAt:changed.updatedAt}},{upsert:true,session});
     await collection.deleteOne({_id:projection._id,...filter},{session});
    }
    // Unknown projections are retained for explicit inventory/review; no bulk cleanup.
   }
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});return next;
  }catch(error){if(error.code===11000)throw conflict();throw error;}finally{await session.endSession();}
 }
 return {read,commit};
}
module.exports={createAtomicAppStore};
