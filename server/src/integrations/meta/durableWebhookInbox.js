import {randomUUID} from 'node:crypto';

// Durable admission is independent of the legacy app-state mutation queue.
// Documents have no TTL: payloads and processing history are retained.
export function createWebhookInbox({collection,processEvent,clock=()=>new Date(),log=()=>{},leaseMs=120000}) {
 const owner=randomUUID();let flight;let stopped=false;let timer;
 async function accept(eventId,payload){
  try{await collection.insertOne({_id:eventId,kind:'event',payload,status:'pending',attempts:0,receivedAt:clock(),nextAttemptAt:clock()},{writeConcern:{w:'majority'},maxTimeMS:5000,timeoutMS:5000});return {duplicate:false};}
  catch(error){if(error.code===11000)return {duplicate:true};throw error;}
 }
 async function drain(){
  if(stopped || flight)return flight;
  flight=(async()=>{
   // A global lease serializes inbox workers across deployments as well as events.
   const now=clock();let acquired;
   try{acquired=await collection.findOneAndUpdate({_id:'__worker_lease__',$or:[{leaseUntil:{$lte:now}},{owner}]},{$set:{kind:'lease',owner,leaseUntil:new Date(+now+leaseMs)}},{upsert:true,returnDocument:'after'});}
   catch(error){if(error.code===11000)return;throw error;}
   if(acquired?.owner!==owner)return;
   let leaseLost=false;
   const heartbeat=setInterval(()=>{collection.updateOne({_id:'__worker_lease__',owner},{$set:{leaseUntil:new Date(+clock()+leaseMs)}}).then(result=>{if(result.matchedCount!==1)leaseLost=true;}).catch(()=>{leaseLost=true;});},Math.max(100,Math.floor(leaseMs/3)));heartbeat.unref?.();
   try{
    for(let count=0;count<5 && !stopped && !leaseLost;count++){
     const started=clock(),token=randomUUID();
     const event=await collection.findOneAndUpdate({kind:'event',$or:[{status:{$in:['pending','failed']},nextAttemptAt:{$lte:started}},{status:'processing',leaseUntil:{$lte:started}}]},{$set:{status:'processing',token,leaseUntil:new Date(+started+leaseMs)},$inc:{attempts:1}},{sort:{receivedAt:1},returnDocument:'after'});
     if(!event)break;
     const renew=setInterval(()=>{collection.updateOne({_id:event._id,token,status:'processing'},{$set:{leaseUntil:new Date(+clock()+leaseMs)}}).catch(()=>{leaseLost=true;});},Math.max(100,Math.floor(leaseMs/3)));renew.unref?.();
     try{
      await processEvent(event,async()=>{
       if(leaseLost || !await collection.findOne({_id:'__worker_lease__',owner,leaseUntil:{$gt:clock()}}))throw new Error('Webhook worker lease lost');
      });
      await collection.updateOne({_id:event._id,token},{$set:{status:'processed',processedAt:clock(),error:''},$unset:{token:'',leaseUntil:''}});
     }catch(error){
      const delay=Math.min(3600000,1000 * 2 ** Math.min(event.attempts,12));
      await collection.updateOne({_id:event._id,token},{$set:{status:'failed',error:String(error.message || 'Processing failed').slice(0,500),nextAttemptAt:new Date(+clock()+delay)},$unset:{token:'',leaseUntil:''}});
      log('error','durable event processing failed',{eventId:event._id});
     }finally{clearInterval(renew);}
    }
   }finally{clearInterval(heartbeat);await collection.updateOne({_id:'__worker_lease__',owner},{$set:{leaseUntil:new Date(0)}});}
  })();
  try{return await flight;}finally{flight=null;}
 }
 function kick(){if(!stopped)setImmediate(()=>drain().catch(error=>log('error','inbox worker unavailable',{message:error.message})));}
 function start(){stopped=false;if(!timer){timer=setInterval(kick,2000);timer.unref?.();}kick();return stop;}
 async function stop(){stopped=true;clearInterval(timer);timer=null;await flight;}
 async function stats(){return {pending:await collection.countDocuments({kind:'event',status:{$in:['pending','processing']}}),failed:await collection.countDocuments({kind:'event',status:'failed'})};}
 return {accept,drain,kick,start,stop,stats};
}
