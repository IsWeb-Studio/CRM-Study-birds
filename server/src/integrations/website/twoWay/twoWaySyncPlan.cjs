const {merge,equal,digest}=require('./syncMerge.cjs');
// Complete manifests only. Partial list responses cannot prove a deletion.
function plan({local,remote,checkpoints={},localComplete=false,remoteComplete=false}) {
  const writes=[],conflicts=[],deletionReviews=[];
  const indexed=rows=>{
    const map=new Map();
    for(const row of rows){if(!row?.key || map.has(row.key))throw new Error('Missing or duplicate sync identity');map.set(row.key,row);}
    return map;
  };
  const left=indexed(local),right=indexed(remote);
  for(const key of new Set([...left.keys(),...right.keys(),...Object.keys(checkpoints)])) {
    const l=left.get(key),r=right.get(key),base=checkpoints[key];
    if(l?.deleted || r?.deleted || base && (!l || !r)) {
      deletionReviews.push({key,local:l || null,remote:r || null,baseline:base,complete:localComplete && remoteComplete});
      continue;
    }
    if(!l && !r)continue;
    if(!base && l && r && !equal(l.value,r.value)) {
      conflicts.push({key,reason:'unlinked-existing-data',local:l,remote:r});continue;
    }
    const result=l && r ? merge(base?.value,l.value,r.value) : {value:(l || r).value,conflicts:[]};
    if(result.conflicts.length){conflicts.push({key,reason:'concurrent-edit',...result,local:l,remote:r});continue;}
    const revision=r?.revision || 0;
    const operationId=digest({key,revision,value:result.value});
    writes.push({key,value:result.value,expectedRevision:revision,operationId,localBefore:l?.value,remoteBefore:r?.value,
      push:!r || !equal(result.value,r.value),pull:!l || !equal(result.value,l.value)});
  }
  return {writes,conflicts,deletionReviews};
}
module.exports={plan};
