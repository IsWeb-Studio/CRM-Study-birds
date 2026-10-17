const test=require('node:test'),assert=require('node:assert/strict');
const uri=process.env.CATALOG_TEST_URI;
test('atomic CRM storage rejects stale writers, rolls back projections and retains removed views',{skip:!uri},async()=>{
 assert.match(uri,/^mongodb:\/\/127\.0\.0\.1:\d+\//);
 const {MongoClient}=require('mongodb'),{createAtomicAppStore}=require('./atomicAppStore.cjs');
 const client=new MongoClient(uri);await client.connect();
 try{
  const db=client.db('atomic_storage_test');await db.createCollection('read_students');
  const first=createAtomicAppStore({db,client,id:'state',readModels:['students']}),second=createAtomicAppStore({db,client,id:'state',readModels:['students']});
  const a={id:'one',companyId:'a',name:'Keep A'},b={id:'one',companyId:'b',name:'Keep B'};
  let base=await first.read();await first.commit({base:base.token,payload:{students:[a,b],notes:'Original'},catalog:{programs:[{id:'p'}]}});
  const left=await first.read(),right=await second.read();
  const results=await Promise.allSettled([
   first.commit({base:left.token,previous:left.record.payload,payload:{students:[{...a,name:'Left'},b],notes:'Left'},catalog:left.catalog.catalog}),
   second.commit({base:right.token,previous:right.record.payload,payload:{students:[{...a,name:'Right'},b],notes:'Right'},catalog:right.catalog.catalog})
  ]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal(results.find(row=>row.status==='rejected').reason.status,409);
  base=await first.read();const beforeState=await db.collection('app_state').findOne({_id:'state'}),beforeCatalog=await db.collection('education_catalog').findOne({_id:'state'});
  await assert.rejects(first.commit({base:base.token,previous:base.record.payload,payload:{students:[a,a],notes:'Must roll back'},catalog:{programs:[]}}),/Invalid read model/);
  assert.deepEqual(await db.collection('app_state').findOne({_id:'state'}),beforeState);assert.deepEqual(await db.collection('education_catalog').findOne({_id:'state'}),beforeCatalog);
  assert.equal(await db.collection('read_students').countDocuments({}),2);
  // Catalogue-only changes made by another writer must conflict too.
  base=await first.read();await db.collection('education_catalog').updateOne({_id:'state'},{$inc:{revision:1}});
  await assert.rejects(first.commit({base:base.token,previous:base.record.payload,payload:{students:[a],notes:'Stale catalog'},catalog:{programs:[]}}),{status:409});
  assert.deepEqual(await db.collection('app_state').findOne({_id:'state'}),beforeState);
  // Preserve unknown views and isolate equal IDs belonging to different companies.
  await db.collection('read_students').insertOne({id:'unknown',companyId:'third',name:'Unlinked view'});
  base=await first.read();await first.commit({base:base.token,previous:base.record.payload,payload:{students:[b],notes:'Explicit removal of A'},catalog:base.catalog.catalog});
  assert.equal(await db.collection('read_students').countDocuments({id:'one',companyId:'a'}),0);
  assert.equal((await db.collection('read_students').findOne({id:'one',companyId:'b'})).name,'Keep B');
  assert.equal(await db.collection('read_students').countDocuments({id:'unknown',companyId:'third'}),1);
  const archive=await db.collection('read_model_history').findOne({companyId:'a',entityId:'one'});assert(archive);assert.equal(archive.projection.id,'one');
  assert.equal((await first.read()).record.payload.students.length,1);
  // Initial revision is compatible with old documents; no destructive migration.
  await db.collection('app_state').insertOne({_id:'legacy',payload:{students:[a]}});
  await db.collection('education_catalog').insertOne({_id:'legacy',catalog:{programs:[{id:'legacy-p'}]}});
  const legacy=createAtomicAppStore({db,client,id:'legacy'});const old=await legacy.read();await legacy.commit({base:old.token,previous:old.record.payload,payload:old.record.payload,catalog:old.catalog.catalog});
  assert.equal((await legacy.read()).record.revision,1);assert.equal((await legacy.read()).catalog.catalog.programs[0].id,'legacy-p');
 }finally{await client.close();}
});
