const {Immer,isDraft,current}=require('immer');
// Keep the existing serialized writer and rollback contract. Only touched branches
// are copied; the large catalogue and historical messages stay shared when unchanged.
const immer=new Immer({autoFreeze:false});
function snapshot(value,seen=new WeakMap()) {
  if(isDraft(value))return current(value);
  if(!value || typeof value!=='object' || value instanceof Date || Buffer.isBuffer(value))return value;
  if(seen.has(value))return seen.get(value);
  const result=Array.isArray(value)?[]:{};seen.set(value,result);
  for(const key of Object.keys(value))result[key]=snapshot(value[key],seen);
  return result;
}
function cloneSnapshot(value){return structuredClone(isDraft(value)?current(value):value);}
function createMutationQueue({read,write,onFailure=()=>{},needsWrite=()=>false}) {
 let queue=Promise.resolve();
 return mutator=>{
  queue=queue.catch(()=>undefined).then(async()=>{
   let draft;
   try{
    const base=await read();draft=immer.createDraft(base);
    const response=snapshot(await mutator(draft));
    const data=immer.finishDraft(draft);draft=null;
    // No-op and duplicate operations need no Mongo write or read-model rebuild.
    if(data!==base || needsWrite(base))await write(data,{base});
    return response;
   }catch(error){if(draft){try{immer.finishDraft(draft);}catch{}}await onFailure(error);throw error;}
  });
  return queue;
 };
}
module.exports={createMutationQueue,cloneSnapshot};
