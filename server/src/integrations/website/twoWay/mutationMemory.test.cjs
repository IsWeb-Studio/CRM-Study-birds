const test=require('node:test'),assert=require('node:assert/strict');
const {createMutationQueue,cloneSnapshot}=require('./safeMutationQueue.cjs');
test('large untouched catalogue and histories retain identity while touched rows are isolated',async()=>{
 const original={educationCatalog:{programs:Array.from({length:30000},(_,i)=>({id:String(i),title:`Program ${i}`,body:'History '.repeat(80)}))},webhookEvents:[{id:'old',payload:{keep:true}}],messages:[{id:'m1',text:'Original'},{id:'m2',text:'Keep'}],settings:{value:1}};
 let cache=original,writes=0;
 const mutate=createMutationQueue({read:async()=>cache,write:async data=>{cache=data;writes++;}});
 const response=await mutate(async db=>{await Promise.resolve();db.messages[0].text='Changed';return {message:db.messages[0],history:cloneSnapshot(db.webhookEvents[0])};});
 assert.equal(cache.educationCatalog,original.educationCatalog);assert.equal(cache.webhookEvents,original.webhookEvents);
 assert.equal(cache.messages[1],original.messages[1]);assert.notEqual(cache.messages[0],original.messages[0]);
 assert.equal(original.messages[0].text,'Original');assert.equal(response.message.text,'Changed');assert.equal(response.history.payload.keep,true);
 await mutate(db=>db.messages.find(row=>row.id==='m1'));assert.equal(writes,1,'read-only duplicate operations never rewrite Mongo');
 await assert.rejects(mutate(db=>{db.messages.push({id:'not-saved'});delete db.settings.value;throw new Error('Rejected');}));
 assert.equal(cache.messages.length,2);assert.equal(cache.settings.value,1);
});


test('repeated small writes fit a 256 MB heap without duplicating 90 MB of retained history',()=>{
 const {spawnSync}=require('node:child_process');
 const result=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=256','-e',`
  const assert=require('node:assert/strict');
  const {createMutationQueue}=require(${JSON.stringify(require.resolve('./safeMutationQueue.cjs'))});
  const rows=(count)=>Array.from({length:count},(_,i)=>({id:String(i),body:Buffer.alloc(1024,65+i%25).toString()}));
  const catalogue={programs:rows(50000)},history=rows(40000);
  let cache={educationCatalog:catalogue,webhookEvents:history,counter:0};
  const mutate=createMutationQueue({read:async()=>cache,write:async data=>{cache=data;}});
  (async()=>{global.gc();const before=process.memoryUsage().heapUsed;
   for(let i=0;i<100;i++)await mutate(db=>{db.counter++;});
   global.gc();const after=process.memoryUsage().heapUsed;
   assert.equal(cache.educationCatalog,catalogue);assert.equal(cache.webhookEvents,history);assert.equal(cache.counter,100);
   assert(after-before<12*1024*1024,'Small writes retained too much extra heap');
   console.log(JSON.stringify({beforeMB:Math.round(before/1048576),afterMB:Math.round(after/1048576),records:90000,writes:100}));
  })().catch(error=>{console.error(error);process.exitCode=1;});
 `],{encoding:'utf8',timeout:30000,windowsHide:true});
 assert.equal(result.status,0,result.stderr || result.error?.message);console.log(result.stdout.trim());
});
