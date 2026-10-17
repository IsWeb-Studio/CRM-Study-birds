import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {installReadiness} from './startupReadiness.js';
test('port and health respond during initialization; work is not falsely acknowledged before readiness',async()=>{
 const app=express(),readiness=installReadiness(app);let accepted=0;
 app.post('/webhook',(_req,res)=>{accepted++;res.json({received:true});});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try{
  const url=`http://127.0.0.1:${server.address().port}`;
  let response=await fetch(`${url}/api/health`);assert.equal(response.status,503);assert.equal((await response.json()).status,'starting');
  response=await fetch(`${url}/webhook`,{method:'POST'});assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'10');assert.equal(accepted,0);
  readiness.markReady();response=await fetch(`${url}/api/health`);assert.equal(response.status,200);
  response=await fetch(`${url}/webhook`,{method:'POST'});assert.equal(response.status,200);assert.equal(accepted,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
