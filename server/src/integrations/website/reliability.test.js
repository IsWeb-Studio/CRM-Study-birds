import {allowModule,allowAction} from '../../auth.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebsiteClient,mountWebsiteRoutes} from './website.service.js';
import {loadCatalogSnapshot} from './catalogSnapshot.js';
const config=()=>({enabled:true,ready:true,baseUrl:'https://source.test/api',token:'test'});
const ok=data=>({ok:true,status:200,json:async()=>data});
test('scholarship permission failure preserves the rest of the catalog and marks it incomplete',async()=>{
 const client=createWebsiteClient({config,fetchImpl:async url=>url.includes('scholarships')?{ok:false,status:403,json:async()=>({})}:ok([{_id:'a'.repeat(24),name:'University'}])});
 const data=await client.catalog();assert.equal(data.universities.length,1);assert.equal(data.complete,false);assert.equal(data.warnings[0].resource,'scholarships');
});
test('concurrent lists share one upstream read and a successful write invalidates it',async()=>{
 let reads=0;
 const client=createWebsiteClient({config,fetchImpl:async(url,options)=>{if(options.method==='GET'){reads++;return ok([{_id:'a'.repeat(24),status:'pending'}]);}return ok({});}});
 await Promise.all([client.resource('support'),client.resource('support')]);assert.equal(reads,1);
 await client.action('support','a'.repeat(24),'reply',{message:'Reply',status:'answered'});await client.resource('support');assert.equal(reads,2);
});
test('source catalog snapshots survive outages, preserve successful empty lists, and remain company-scoped',async()=>{
 const db={};let writes=0,offline=false;
 const client={catalog:async()=>{if(offline)throw Error('Offline');return {universities:[],countries:[],programs:[],scholarships:[],complete:true,warnings:[]};}};
 const read=async()=>db,mutate=async fn=>{writes++;return fn(db);};
 await loadCatalogSnapshot(client,read,mutate,'one');await loadCatalogSnapshot(client,read,mutate,'one');assert.equal(writes,1);
 offline=true;const cached=await loadCatalogSnapshot(client,read,mutate,'one');assert.equal(cached.stale,true);assert.deepEqual(cached.universities,[]);
 await assert.rejects(loadCatalogSnapshot(client,read,mutate,'two'),/Offline/);
});

test('directory gateway keeps the last source list during outages but never conceals a permission denial',async()=>{
 const db={},routes=[];let failure=null,writes=0;
 const app=Object.fromEntries(['get','post','put'].map(method=>[method,(path,...handlers)=>routes.push({path,handlers})]));
 const client={resource:async()=>{if(failure)throw failure;return {rows:[{_id:'b'.repeat(24),name:'University'}]};}};
 mountWebsiteRoutes(app,{client,allowModule,allowAction,readDb:async()=>db,mutateDb:async fn=>{writes++;return fn(db);}});
 const route=routes.find(row=>row.path==='/api/integrations/website/requests/:resource');
 const req={user:{role:'admin',companyId:'one',sub:'actor'},params:{resource:'universities'}};let output;
 const res={json:data=>{output=data;}};
 const invoke=()=>route.handlers[1](req,res,error=>{throw error;});
 await invoke();await invoke();assert.equal(writes,1);
 failure=Object.assign(new Error('Offline'),{status:502});await invoke();assert.equal(output.stale,true);assert.equal(output.rows[0].name,'University');
 failure=Object.assign(new Error('Forbidden'),{status:403});await assert.rejects(invoke(),{status:403});
});
