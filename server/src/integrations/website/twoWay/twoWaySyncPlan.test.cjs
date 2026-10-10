const test=require('node:test');
const assert=require('node:assert/strict');
const {plan}=require('./twoWaySyncPlan.cjs');
const row=(value,revision=1)=>({key:'tasks:stable-id',value,revision});
test('CRM creation uses a repeatable operation identity',()=>{
  const input={local:[row({title:'T'})],remote:[]};
  const a=plan(input),b=plan(input);
  assert.equal(a.writes[0].operationId,b.writes[0].operationId);assert.equal(a.writes[0].push,true);
});
test('website creation is imported with source identity, not matched by title',()=>{
  const result=plan({local:[],remote:[row({title:'T'})]});
  assert.equal(result.writes[0].pull,true);assert.equal(result.writes[0].push,false);
});
test('ambiguous old records never overwrite one another',()=>{
  const result=plan({local:[row({title:'A'})],remote:[row({title:'B'})]});
  assert.equal(result.writes.length,0);assert.equal(result.conflicts[0].reason,'unlinked-existing-data');
});
test('a partial response never causes a deletion',()=>{
  const result=plan({local:[row({title:'A'})],remote:[],checkpoints:{'tasks:stable-id':{value:{title:'A'}}}});
  assert.equal(result.writes.length,0);assert.equal(result.deletionReviews[0].complete,false);
});
test('even a complete confirmed deletion only produces a review',()=>{
  const result=plan({local:[],remote:[row({title:'A'})],checkpoints:{'tasks:stable-id':{value:{title:'A'}}},localComplete:true,remoteComplete:true});
  assert.equal(result.writes.length,0);assert.equal(result.deletionReviews[0].complete,true);
});
test('nonoverlapping edits converge and shared field edits block',()=>{
  const input={local:[row({a:2,b:1})],remote:[row({a:1,b:2},2)],checkpoints:{'tasks:stable-id':{value:{a:1,b:1}}}};
  assert.deepEqual(plan(input).writes[0].value,{a:2,b:2});
  input.remote=[row({a:3,b:1},2)];assert.equal(plan(input).conflicts.length,1);
});
test('duplicate identities fail instead of silently losing rows',()=>{
  assert.throws(()=>plan({local:[row({a:1}),row({a:2})],remote:[]}));
});
