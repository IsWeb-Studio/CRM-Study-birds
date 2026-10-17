import test from 'node:test';
import assert from 'node:assert/strict';
import {MongoClient} from 'mongodb';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const uri=process.env.CATALOG_TEST_URI;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,diagnostic=()=>'',timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await pause(30);}throw new Error(`Timed out: ${diagnostic()}`);}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function payload(ids,phone='phone-test'){return {object:'whatsapp_business_account',entry:[{id:'waba-test',changes:[{field:'messages',value:{metadata:{phone_number_id:phone},contacts:[{wa_id:'111',profile:{name:'Test sender'}}],messages:ids.map(id=>({id,from:'111',type:'text',text:{body:`Text ${id}`},timestamp:'1760000000'}))}}]}]};}
async function freePort(){return new Promise(resolve=>{const server=net.createServer().listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});}

test('full CRM startup, Meta ingress, persisted processing and restart retain all historical records',{skip:!uri,timeout:90000},async()=>{
 assert.match(uri,/^mongodb:\/\/127\.0\.0\.1:\d+\//);
 const client=new MongoClient(uri);await client.connect();
 const db=client.db('crm_runtime_full_test'),state=db.collection('app_state'),inbox=db.collection('meta_webhook_inbox');
 let child,childExit,output='',provider,gateResponse,releaseGate=false,receiptFile='';
 const oldPayload=payload(['legacy-incoming']),legacyId=hash(oldPayload);
 const original={users:[{id:'admin-test',companyId:'company-test',name:'Admin',email:'admin@example.test',role:'admin',isActive:true,passwordHash:'test-not-a-real-password'}],companies:[{id:'company-test',name:'Isolated Test',status:'active'}],settings:{companyName:'Isolated Test'},educationCatalog:{universities:[],programs:[],scholarships:[]},leads:[],students:[{id:'keep-student',companyId:'company-test',name:'Keep student'}],applications:[],tasks:[],invoices:[{id:'keep-invoice',companyId:'company-test',studentId:'keep-student',number:'KEEP-1',total:100,status:'Paid',currency:'USD'}],payments:[],messages:[{id:'keep-message',companyId:'company-test',channelId:'channel-test',conversationId:'old-conversation',externalMessageId:'keep-external',text:'Keep old text',status:'delivered',createdAt:'2026-01-01T00:00:00.000Z'}],conversations:[],connectedChannels:[{id:'channel-test',companyId:'company-test',channelType:'whatsapp',phoneNumberId:'phone-test',status:'connected'}],webhookEvents:[{id:'keep-processed',provider:'meta',eventId:'d'.repeat(64),payload:{keep:'old payload'},processingStatus:'processed'},{id:'keep-pending',provider:'meta',eventId:legacyId,payload:oldPayload,processingStatus:'pending'}]};
 await state.insertOne({_id:'runtime-test',payload:original});
 await db.collection('education_catalog').insertOne({_id:'runtime-test',catalog:{universities:[],programs:[],scholarships:[]}});
 if(process.env.RUNTIME_ATOMIC_TEST==='1'){
  const root=process.cwd(),folder=await fs.mkdtemp(path.join(root,'.sync-staging/atomic-backup-'));
  const {backup}=createRequire(import.meta.url)(path.join(root,'server/scripts/backup-database.cjs'));
  const receipt={};
  for(const [side,name] of [['crm','crm_runtime_full_test'],['website','atomic_website_fixture']]){
   if(side==='website')await client.db(name).collection('sentinel').insertOne({_id:'keep',value:'Backup fixture'});
   const envFile=path.join(folder,side+'.env'),destination=path.join(folder,side);
   await fs.writeFile(envFile,`MONGODB_URI=${uri}\nMONGODB_DB_NAME=${name}\n`);
   await backup(envFile,destination);
   receipt[side]={directory:destination,manifestHash:createHash('sha256').update(await fs.readFile(path.join(destination,'manifest.json'))).digest('hex')};
  }
  receiptFile=path.join(folder,'receipt.json');await fs.writeFile(receiptFile,JSON.stringify(receipt));
 }
 const port=await freePort(),base=`http://127.0.0.1:${port}`;
 const serverDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
 async function launch(){
  output='';child=spawn(process.execPath,['--max-old-space-size=256','src/index.js'],{cwd:serverDir,windowsHide:true,env:{...process.env,DOTENV_CONFIG_PATH:path.join(serverDir,'no-env-runtime-test'),MONGODB_URI:uri,MONGODB_DB_NAME:'crm_runtime_full_test',MONGODB_COLLECTION:'app_state',MONGODB_DOCUMENT_ID:'runtime-test',JWT_SECRET:'runtime-test-only',CRM_ATOMIC_STORAGE_ENABLED:process.env.RUNTIME_ATOMIC_TEST==='1'?'true':'false',SYNC_BACKUP_RECEIPT_FILE:receiptFile,TOKEN_ENCRYPTION_KEY:'01234567890123456789012345678901',STUDY_BIRDS_ENABLED:'true',STUDY_BIRDS_SYNC_ENABLED:'false',STUDY_BIRDS_ALLOW_WRITES:'false',STUDY_BIRDS_API_URL:`http://127.0.0.1:${provider.address().port}/api`,STUDY_BIRDS_API_TOKEN:'fixture-token',VERCEL:'',PORT:String(port),NODE_ENV:'test',NODE_OPTIONS:''},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',data=>{output=(output+data).slice(-16000);});child.stderr.on('data',data=>{output=(output+data).slice(-16000);});
  childExit=new Promise(resolve=>child.once('exit',resolve));
 }
 async function stop(){if(child && child.exitCode===null && child.signalCode===null){child.kill('SIGTERM');await childExit;}child=null;}
 async function health(){try{return await fetch(`${base}/api/health`);}catch{return null;}}
 try{
  provider=http.createServer((req,res)=>{if(!releaseGate){gateResponse=res;return;}res.setHeader('Content-Type','application/json');res.end('{"crmIntegration":0}');});
  await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
  await launch();await until(()=>!!gateResponse,()=>output);
  const starting=await health();assert.equal(starting.status,503);assert.equal((await starting.json()).status,'starting');
  const early=await fetch(`${base}/api/integrations/meta/webhook`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload(['must-retry']))});assert.equal(early.status,503);
  assert.equal(await inbox.countDocuments({kind:'event'}),0);
  releaseGate=true;gateResponse.setHeader('Content-Type','application/json');gateResponse.end('{"crmIntegration":0}');
  await until(async()=>{const response=await health();return response?.status===200;},()=>output);
  const incoming=payload(['new-one','new-two']),started=Date.now();
  const send=body=>fetch(`${base}/api/integrations/meta/webhook`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const responses=await Promise.all(Array.from({length:8},()=>send(incoming)));assert(responses.every(response=>response.status===200));assert(Date.now()-started<5000);
  await until(()=>inbox.findOne({_id:hash(incoming),status:'processed'}),()=>output);
  await until(()=>inbox.findOne({_id:legacyId,status:'processed'}),()=>output);
  let saved=(await state.findOne({_id:'runtime-test'})).payload;
  assert.equal(saved.messages.filter(row=>['new-one','new-two','legacy-incoming'].includes(row.externalMessageId)).length,3);
  assert.equal(saved.messages.find(row=>row.id==='keep-message').text,'Keep old text');
  assert(saved.students.some(row=>row.id==='keep-student'));assert(saved.invoices.some(row=>row.id==='keep-invoice'));
  assert.deepEqual(saved.webhookEvents.find(row=>row.id==='keep-processed').payload,{keep:'old payload'});
  assert.deepEqual(saved.webhookEvents.find(row=>row.id==='keep-pending').payload,oldPayload);
  assert.equal(saved.webhookEvents.length,2);
  const unknown=payload(['retry-channel'],'unknown-phone');assert.equal((await send(unknown)).status,200);
  await until(()=>inbox.findOne({_id:hash(unknown),status:'failed'}),()=>output);
  assert.deepEqual((await inbox.findOne({_id:hash(unknown)})).payload,unknown);
  // Commit a read receipt, then replay an older status: it must not undo reading.
  const statusPayload=status=>({object:'whatsapp_business_account',entry:[{id:'waba-test',changes:[{field:'messages',value:{metadata:{phone_number_id:'phone-test'},statuses:[{id:'new-one',status,timestamp:'1760000001'}]}}]}]});
  for(const status of ['read','sent']){const body=statusPayload(status);assert.equal((await send(body)).status,200);await until(()=>inbox.findOne({_id:hash(body),status:'processed'}),()=>output);}
  assert.equal((await state.findOne({_id:'runtime-test'})).payload.messages.find(row=>row.externalMessageId==='new-one').status,'read');
  await stop();
  const pending=payload(['restart-incoming']);await inbox.insertOne({_id:hash(pending),kind:'event',payload:pending,status:'pending',attempts:0,receivedAt:new Date(),nextAttemptAt:new Date()});
  // Simulate expiry of the short crash lease; production waits for that expiry.
  await inbox.updateOne({_id:'__worker_lease__'},{$set:{leaseUntil:new Date(0)}});
  await launch();await until(async()=>{const response=await health();return response?.status===200;},()=>output);
  await until(()=>inbox.findOne({_id:hash(pending),status:'processed'}),()=>output);
  saved=(await state.findOne({_id:'runtime-test'})).payload;
  assert.equal(saved.messages.filter(row=>row.externalMessageId==='restart-incoming').length,1);
  assert.equal(saved.messages.filter(row=>row.externalMessageId==='new-one').length,1);
  assert.equal(saved.webhookEvents.length,2);assert(saved.students.some(row=>row.id==='keep-student'));assert(saved.invoices.some(row=>row.id==='keep-invoice'));
  assert.deepEqual((await inbox.findOne({_id:hash(incoming)})).payload,incoming);
  console.log(JSON.stringify({fullServerStartup:true,earlyWebhook503:true,duplicateEventsOnce:true,batchMessagesPreserved:true,legacyHistoryPreserved:true,restartRecovery:true,statusDoesNotRegress:true,atomicStorage:process.env.RUNTIME_ATOMIC_TEST==='1',heapLimitMB:256}));
 }finally{await stop();if(provider)await new Promise(resolve=>provider.close(resolve));await client.close();}
});
