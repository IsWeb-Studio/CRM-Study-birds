const test=require('node:test');
const assert=require('node:assert/strict');
const {createDurableSync}=require('./durableTwoWaySync.cjs');
function fixture(){
  const jobs=new Map(),points={},writes=[];let ready=true,failResponse=false,applied=false;
  const remoteRows=[];
  const store={acquire:async()=>({owner:'worker'}),assertLease:async()=>{},release:async()=>{},pending:async()=>[...jobs.values()].filter(j=>j.status==='pending'),checkpoints:async()=>points,
    saveReviews:async()=>{},hasOpenConflict:async()=>false,enqueue:async j=>{if(!jobs.has(j.operationId))jobs.set(j.operationId,{...j,status:'pending'});},
    markRemoteApplied:async(id,result)=>{jobs.get(id).result=result;},complete:async(id,point)=>{jobs.get(id).status='done';points[point.key]=point;},fail:async(id,error)=>{jobs.get(id).status=error.status;}};
  const local={snapshot:async()=>({complete:true,rows:[{key:'tasks:t1',value:{title:'A'}}]}),apply:async()=>{}};
  const remote={snapshot:async()=>({complete:true,rows:remoteRows}),apply:async(job)=>{
    writes.push(job.operationId);
    if(!applied){remoteRows.push({key:job.key,value:job.value,revision:1});applied=true;}
    if(failResponse){failResponse=false;throw new Error('Response lost after commit');}
    return {value:job.value,revision:1};
  }};
  const worker=createDurableSync({store,local,remote,assertReady:async()=>{if(!ready)throw new Error('Backup unavailable');}});
  return {worker,store,local,remote,jobs,writes,setReady:value=>{ready=value;},loseResponse:()=>{failResponse=true;}};
}
test('backup failure prevents leases, snapshots and writes',async()=>{
  const f=fixture();f.setReady(false);await assert.rejects(f.worker.run());assert.equal(f.jobs.size,0);assert.equal(f.writes.length,0);
});
test('lost response retries the original durable operation',async()=>{
  const f=fixture();f.loseResponse();await f.worker.run();assert.equal([...f.jobs.values()][0].status,'pending');
  await f.worker.run();assert.equal(f.writes[0],f.writes[1]);assert.equal([...f.jobs.values()].filter(j=>j.status==='pending').length,0);
});
test('incomplete page never queues a record',async()=>{
  const f=fixture();f.remote.snapshot=async()=>({complete:false,rows:[]});
  await assert.rejects(f.worker.run(),/Incomplete/);assert.equal(f.jobs.size,0);
});
test('local concurrent edit remains an unresolved conflict',async()=>{
  const f=fixture();f.local.snapshot=async()=>({complete:true,rows:[]});f.remote.snapshot=async()=>({complete:true,rows:[{key:'tasks:t2',value:{title:'B'},revision:1}]});
  f.local.apply=async()=>{throw Object.assign(new Error('Changed locally'),{status:409});};
  await f.worker.run();assert.equal([...f.jobs.values()][0].status,'conflict');assert.equal([...f.jobs.values()][0].result.revision,1);
});
