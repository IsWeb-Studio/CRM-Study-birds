import {createWebhookInbox} from './durableWebhookInbox.js';
import {createHash} from 'node:crypto';
export function createMetaWebhookRuntime({getCollection,readDb,mutateDb,processRecord,initCollections=()=>{},log=()=>{}}){
 let inboxPromise,recoveryFlight,retryTimer,recovered=false,stopped=false;
 async function getInbox(){
  if(!inboxPromise)inboxPromise=(async()=>{
   const collection=await getCollection();
   await collection.createIndex({kind:1,status:1,nextAttemptAt:1,receivedAt:1});
   await collection.createIndex({kind:1,status:1,leaseUntil:1});
   return createWebhookInbox({collection,log,processEvent:async(event,assertLease)=>{
    await mutateDb(async db=>{
     await assertLease();initCollections(db);
     const legacy=(db.webhookEvents || []).find(row=>row.provider==='meta' && row.eventId===event._id);
     if(legacy?.processingStatus==='processed')return;
     processRecord(db,legacy || {id:event._id,payload:event.payload});
     if(legacy){legacy.processingStatus='processed';legacy.processedAt=new Date().toISOString();legacy.error='';}
    });
   }});
  })().catch(error=>{inboxPromise=null;throw error;});
  return inboxPromise;
 }
 async function handler(req,res){
  try{
   const payload=req.body || {},eventId=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
   const inbox=await getInbox(),result=await inbox.accept(eventId,payload);
   log('info',result.duplicate?'durable duplicate received':'event durably received',{eventId});
   res.status(200).json({received:true});inbox.start();start().catch(error=>log('error','legacy recovery deferred',{message:error.message}));
  }catch(error){log('error','event persistence failed',{message:error.message});res.status(503).json({message:'Webhook storage temporarily unavailable'});}
 }
 async function start(){
  if(stopped)return;
  if(recoveryFlight)return recoveryFlight;
  recoveryFlight=(async()=>{
   const inbox=await getInbox();inbox.start();
   if(recovered)return;
   const db=await readDb();
   for(const event of db.webhookEvents || [])if(event.provider==='meta' && ['pending','failed'].includes(event.processingStatus) && /^[a-f0-9]{64}$/.test(event.eventId || '') && event.payload)await inbox.accept(event.eventId,event.payload);
   recovered=true;clearTimeout(retryTimer);retryTimer=null;inbox.kick();
  })();
  try{return await recoveryFlight;}
  catch(error){
   if(!stopped && !retryTimer){retryTimer=setTimeout(()=>{retryTimer=null;start().catch(error=>log('error','inbox recovery retry failed',{message:error.message}));},30000);retryTimer.unref?.();}
   throw error;
  }finally{recoveryFlight=null;}
 }
 async function stop(){stopped=true;clearTimeout(retryTimer);retryTimer=null;await recoveryFlight?.catch(()=>{});if(inboxPromise)await (await inboxPromise).stop();}
 return {handler,start,stop,getInbox};
}
