import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {MongoClient} from 'mongodb';
import {createWebhookInbox} from './durableWebhookInbox.js';
import {createMetaWebhookRuntime} from './metaWebhookRuntime.js';
import mutationQueue from '../website/twoWay/safeMutationQueue.cjs';
const uri=process.env.CATALOG_TEST_URI;
const until=async check=>{for(let i=0;i<200;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Timed out');};
test('durable webhook admission is fast under a blocked CRM writer and events survive restart without deletion',{skip:!uri,timeout:30000},async()=>{
 assert.match(uri,/^mongodb:\/\/127\.0\.0\.1:\d+\//);
 const client=new MongoClient(uri);await client.connect();let server,runtime,release;
 try{
  const collection=client.db().collection('test_webhook_inbox');
  let state={webhookEvents:[{id:'legacy',provider:'meta',eventId:'a'.repeat(64),payload:{legacy:true},processingStatus:'pending'}],messages:[]};
  const mutate=mutationQueue.createMutationQueue({read:async()=>state,write:async data=>{state=data;}});
  const block=new Promise(resolve=>release=resolve);const blocked=mutate(async()=>await block);
  let processed=0;
  const make=()=>createMetaWebhookRuntime({getCollection:async()=>collection,readDb:async()=>state,mutateDb:mutate,processRecord:(db,event)=>{if(!db.messages.some(row=>row.id===event.id))db.messages.push({id:event.id,payload:event.payload});processed++;}});
  runtime=make();const app=express();app.use(express.json());app.post('/webhook',runtime.handler);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const url=`http://127.0.0.1:${server.address().port}/webhook`,started=Date.now();
  const responses=await Promise.all(Array.from({length:12},()=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entry:['incoming']})})));
  assert(responses.every(response=>response.status===200));assert(Date.now()-started<3000,'HTTP acknowledgement must not wait for the CRM queue');
  assert.equal(await collection.countDocuments({_id:{$regex:'^[a-f0-9]{64}$'},payload:{entry:['incoming']}}),1);assert.equal(processed,0);
  release();await blocked;await until(()=>collection.findOne({kind:'event',status:'processed'}));
  await until(()=>collection.findOne({_id:'a'.repeat(64),status:'processed'}));
  assert.equal(state.messages.length,2);assert.equal(processed,2);
  await runtime.stop();
  const inbox=await runtime.getInbox();await inbox.accept('b'.repeat(64),{retained:'pending across restart'});
  runtime=make();await runtime.start();
  await until(()=>collection.findOne({_id:'b'.repeat(64),status:'processed'}));
  await until(()=>collection.findOne({_id:'a'.repeat(64),status:'processed'}));
  assert.equal(state.webhookEvents.length,1);assert.equal(state.webhookEvents[0].processingStatus,'processed');
  assert.equal(state.webhookEvents[0].payload.legacy,true);assert.equal(await collection.countDocuments({kind:'event'}),3);
  assert.equal(state.messages.length,3);
 }finally{release?.();await runtime?.stop();if(server)await new Promise(resolve=>server.close(resolve));await client.close();}
});
test('failed durable storage is not acknowledged and retryable failures retain payloads',{skip:!uri},async()=>{
 const runtime=createMetaWebhookRuntime({getCollection:async()=>{throw new Error('Storage unavailable');},readDb:async()=>({}),mutateDb:()=>{},processRecord:()=>{}});
 let status;await runtime.handler({body:{entry:[]}},{status(value){status=value;return this;},json(){}});assert.equal(status,503);
 const client=new MongoClient(uri);await client.connect();
 try{
  const collection=client.db().collection('test_webhook_retry');let clock=new Date(),fail=true,calls=0;
  const options={collection,clock:()=>clock,processEvent:async()=>{calls++;if(fail)throw new Error('CRM unavailable');}};
  let worker=createWebhookInbox(options);await worker.accept('c'.repeat(64),{original:'Never delete'});await worker.drain();
  assert.equal((await collection.findOne({_id:'c'.repeat(64)})).status,'failed');
  await worker.stop();clock=new Date(+clock+10000);fail=false;
  worker=createWebhookInbox(options);await worker.drain();await worker.stop();
  const record=await collection.findOne({_id:'c'.repeat(64)});assert.equal(record.status,'processed');assert.equal(record.payload.original,'Never delete');assert.equal(record.attempts,2);assert.equal(calls,2);
 }finally{await client.close();}
});
