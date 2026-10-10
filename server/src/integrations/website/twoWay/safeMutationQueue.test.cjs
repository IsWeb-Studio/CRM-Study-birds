const test=require('node:test');
const assert=require('node:assert/strict');
const {createMutationQueue}=require('./safeMutationQueue.cjs');
test('failed mutations and failed writes cannot leak into future operations',async()=>{
  let cache={students:[{id:'s1',name:'A'}]},failWrite=false,invalidations=0;
  const mutate=createMutationQueue({read:async()=>cache,write:async data=>{if(failWrite)throw new Error('disk unavailable');cache=data;},onFailure:()=>{invalidations++;}});
  await assert.rejects(mutate(db=>{db.students[0].name='B';throw new Error('Remote rejected');}));
  assert.equal(cache.students[0].name,'A');
  failWrite=true;await assert.rejects(mutate(db=>{db.students[0].name='C';}));assert.equal(cache.students[0].name,'A');
  failWrite=false;await mutate(db=>{db.students.push({id:'s2',name:'D'});});
  assert.equal(cache.students.length,2);assert.equal(cache.students[0].name,'A');assert.equal(invalidations,2);
});
test('independent writers remain serialized after an error',async()=>{
  let cache={counter:0};
  const mutate=createMutationQueue({read:async()=>cache,write:async data=>{cache=data;}});
  const results=await Promise.allSettled([mutate(()=>{throw new Error('bad');}),...Array.from({length:5},()=>mutate(db=>{db.counter++;}))]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,5);assert.equal(cache.counter,5);
});
