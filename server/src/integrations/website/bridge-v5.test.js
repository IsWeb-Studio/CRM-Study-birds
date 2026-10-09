import test from 'node:test';
import assert from 'node:assert/strict';
import {mountAccountBridge} from './accountBridge.js';
import {createWebsiteClient} from './website.service.js';
test('student creation links the source identity and never stores a plaintext password in CRM',async()=>{
  const previous=process.env.STUDY_BIRDS_ALLOW_WRITES;process.env.STUDY_BIRDS_ALLOW_WRITES='true';
  try{
    const routes=[],db={students:[]},id='a'.repeat(24);let writes=0;
    mountAccountBridge({post:(...args)=>routes.push(args),patch:(...args)=>routes.push(args)},{allowAction:()=>()=>{},allowModule:()=>()=>{},client:{request:async()=>({_id:id,name:'Student',email:'student@test.example'})},readDb:async()=>db,mutateDb:async fn=>{writes++;return fn(db);}});
    const handler=routes.find(row=>row[0]==='/api/students').at(-1);
    const req={body:{name:'Student',email:'student@test.example',password:'UniqueSecret!42',profile:{phone:'123'}},user:{companyId:'one'}};
    const res={status(){return this;},json(){}};
    await handler(req,res);await handler(req,res);assert.equal(db.students.length,1);assert.equal(db.students[0].websiteSource.id,id);assert.equal(db.students[0].websiteSource.readOnly,false);assert.ok(!JSON.stringify(db).includes(req.body.password));assert.equal(writes,2);
  }finally{if(previous===undefined)delete process.env.STUDY_BIRDS_ALLOW_WRITES;else process.env.STUDY_BIRDS_ALLOW_WRITES=previous;}
});
test('a failed source account creation never creates an unlinked CRM student',async()=>{
  const previous=process.env.STUDY_BIRDS_ALLOW_WRITES;process.env.STUDY_BIRDS_ALLOW_WRITES='true';
  try{
    const routes=[];let writes=0;
    mountAccountBridge({post:(...args)=>routes.push(args),patch:(...args)=>routes.push(args)},{allowAction:()=>()=>{},allowModule:()=>()=>{},client:{request:async()=>{throw new Error('source unavailable');}},readDb:async()=>({students:[]}),mutateDb:()=>writes++});
    await assert.rejects(routes.find(row=>row[0]==='/api/students').at(-1)({body:{email:'one@test.example'},user:{companyId:'one'}},{}));assert.equal(writes,0);
  }finally{if(previous===undefined)delete process.env.STUDY_BIRDS_ALLOW_WRITES;else process.env.STUDY_BIRDS_ALLOW_WRITES=previous;}
});
test('private document forwarding keeps multipart encoding and does not expose authorization in the body',async()=>{
  const client=createWebsiteClient({config:()=>({enabled:true,ready:true,baseUrl:'https://site.test/api',token:'private-token'}),fetchImpl:async(url,options)=>{
    assert.equal(url,'https://site.test/api/crm/applications/'+ 'a'.repeat(24)+'/documents');assert.equal(options.body instanceof FormData,true);assert.equal(options.headers['Content-Type'],undefined);assert.equal(options.headers.Authorization,'Bearer private-token');assert.equal(options.body.get('type'),'passport');assert.equal(options.body.has('token'),false);return {ok:true,json:async()=>({_id:'b'.repeat(24)})};
  }});
  const body=new FormData();body.set('type','passport');body.set('file',new Blob(['%PDF-1.4 test'],{type:'application/pdf'}),'passport.pdf');
  await client.request(`/crm/applications/${'a'.repeat(24)}/documents`,{method:'POST',body});
});
