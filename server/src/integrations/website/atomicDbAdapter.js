import atomic from './twoWay/atomicAppStore.cjs';
export function createAtomicDbAdapter({db,client,id,stateCollection,readModels,createEmpty,validate,normalizeCatalog,importCatalog,ttlMs=5000}){
 const store=atomic.createAtomicAppStore({db,client,id,stateCollection,readModels});
 const snapshots=new WeakMap();let cached,expires=0,indexFlight;
 async function ensureIndexes(){
  if(!indexFlight)indexFlight=(async()=>{
   for(const name of readModels){const collection=db.collection(`read_${name}`);await collection.createIndex({companyId:1,id:1},{unique:true});await collection.createIndex({companyId:1,updatedAt:-1,createdAt:-1});}
   await db.collection('read_conversations').createIndex({companyId:1,status:1,assignedUserId:1,priority:1,lastMessageAt:-1});
   await db.collection('read_students').createIndex({companyId:1,name:1});await db.collection('read_leads').createIndex({companyId:1,name:1});
   await db.collection('read_applications').createIndex({companyId:1,studentId:1});await db.collection('read_invoices').createIndex({companyId:1,studentId:1});await db.collection('read_payments').createIndex({companyId:1,invoiceId:1});await db.collection('read_messages').createIndex({companyId:1,conversationId:1,createdAt:-1});
  })().catch(error=>{indexFlight=null;throw error;});
  await indexFlight;
 }
 async function fresh(){
  const {record,catalog,token}=await store.read();
  if(record && !validate(record.payload))throw new Error('Invalid stored CRM data; refusing to replace it');
  const data=record?.payload || createEmpty();
  data.educationCatalog=normalizeCatalog(catalog?.catalog || data.educationCatalog);
  if(!record && !catalog)data.educationCatalog=await importCatalog().catch(()=>normalizeCatalog());
  snapshots.set(data,token);cached=data;expires=Date.now()+ttlMs;return data;
 }
 async function read(){return cached && Date.now()<expires?cached:fresh();}
 async function write(data,{base=data}={}){
  const token=snapshots.get(base);if(!token)throw Object.assign(new Error('Refresh the storage snapshot before saving'),{status:409});
  await ensureIndexes();
  const catalog=normalizeCatalog(data.educationCatalog),payload={...data,educationCatalog:normalizeCatalog()};
  const next=await store.commit({payload,catalog,base:token,previous:base});
  snapshots.set(data,next);cached=data;expires=Date.now()+ttlMs;return data;
 }
 async function readCollection(name){
  if(!readModels.includes(name))throw new Error('Unknown read model');await ensureIndexes();
  const data=await fresh();if(!snapshots.get(data).readModelsReady)await write(data);
  return db.collection(`read_${name}`);
 }
 function invalidate(){cached=null;expires=0;}
 return {fresh,read,write,readCollection,invalidate,needsWrite:base=>!snapshots.get(base)?.readModelsReady};
}
