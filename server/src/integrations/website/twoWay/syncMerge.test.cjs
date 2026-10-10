const test = require('node:test');
const assert = require('node:assert/strict');
const { merge, digest } = require('./syncMerge.cjs');
test('independent nested edits are preserved in both directions', () => {
  const base = { name:'A', profile:{phone:'1', city:'X'} };
  const local = { ...base, profile:{phone:'2', city:'X'} };
  const remote = { ...base, name:'B', profile:{phone:'1', city:'Y'} };
  const result = merge(base,local,remote);
  assert.deepEqual(result, {value:{name:'B',profile:{phone:'2',city:'Y'}},conflicts:[]});
  assert.deepEqual(merge(base,remote,local).value,result.value);
});
test('overlapping edits retain all versions for review', () => {
  const result=merge({name:'A'},{name:'B'},{name:'C'});
  assert.equal(result.value.name,'B');
  assert.deepEqual(result.conflicts,[{path:'name',base:'A',local:'B',remote:'C'}]);
});
test('arrays do not lose concurrent items by automatic replacement', () => {
  assert.equal(merge({items:[1]},{items:[1,2]},{items:[1,3]}).conflicts.length,1);
});
test('field removal conflicting with an edit requires review', () => {
  assert.equal(merge({x:'a'},{},{x:'b'}).conflicts.length,1);
});
test('identity hashing is deterministic and rejects operator injection', () => {
  assert.equal(digest({b:1,a:2}),digest({a:2,b:1}));
  assert.throws(()=>digest(JSON.parse('{"__proto__":{"admin":true}}')));
});
