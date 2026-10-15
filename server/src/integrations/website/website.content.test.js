import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebsiteClient } from './website.service.js';
const id = 'a'.repeat(24);
const config = () => ({ enabled: true, ready: true, baseUrl: 'https://website.example/api', token: 'test' });
const response = data => ({ ok: true, status: 200, json: async () => data });
test('editing a university preserves articles, gallery, tuition and student counts outside the editor', async () => {
  let payload;
  const original = { _id: id, name: 'University', country: { _id: 'b'.repeat(24), name: 'Turkey' }, articleTitle: 'Keep article', articleHeadings: ['Keep heading'], articleBodies: ['Keep body'], campusImages: ['https://files.example/image.png'], tuitionRange: { min: 1000, max: 5000 }, studentCount: 2000, specialtyCount: 20 };
  const client = createWebsiteClient({ config, fetchImpl: async (_url, options) => { if (options.method === 'PUT') { payload = JSON.parse(options.body); return response(payload); } return response(original); } });
  await client.editResource('universities', id, { city: 'New city' });
  assert.equal(payload.city, 'New city');
  assert.equal(payload.articleTitle, original.articleTitle);
  assert.deepEqual(payload.articleBodies, original.articleBodies);
  assert.deepEqual(payload.campusImages, original.campusImages);
  assert.deepEqual(payload.tuitionRange, original.tuitionRange);
  assert.equal(payload.studentCount, 2000);
  assert.equal(payload.country, original.country._id);
  assert.equal(payload._id, undefined);
});
test('content editor rejects fields outside the whitelist before any remote request', async () => {
  let requests = 0;
  const client = createWebsiteClient({ config, fetchImpl: async () => { requests++; return response({}); } });
  await assert.rejects(client.editResource('universities', id, { student: id }));
  await assert.rejects(client.editResource('applications', id, { status: 'accepted' }));
  assert.equal(requests, 0);
});

test('marketing uploads preserve metadata and published=false; deletion and upload invalidate cached lists',async()=>{
 const calls=[];
 const client=createWebsiteClient({config,fetchImpl:async(url,options)=>{calls.push({url,options});return response(options.method==='GET'?[{_id:id}]:{_id:id});}});
 await client.resource('marketingAssets');
 await client.createMarketingAsset({buffer:Buffer.from('file'),mimetype:'application/pdf',originalname:'agency.pdf'},{title:'Agency brochure',description:'Details',type:'brochure',published:false});
 const upload=calls.find(row=>row.options.method==='POST');assert.equal(upload.url,'https://website.example/api/admin/marketing-assets');assert.equal(upload.options.body.get('published'),'false');assert.equal(upload.options.body.get('file').name,'agency.pdf');
 await client.resource('marketingAssets');await client.deleteResource('marketingAssets',id);await client.resource('marketingAssets');assert.equal(calls.filter(row=>row.options.method==='GET').length,3);
 const before=calls.length;await assert.rejects(client.createMarketingAsset({buffer:Buffer.from('file')},{title:'Test',type:''}));await assert.rejects(client.createMarketingAsset({buffer:Buffer.from('file')},{title:'Test',role:'admin'}));assert.equal(calls.length,before);
});
test('new agents receive a company-scoped CRM identity and never send privilege fields',async()=>{
 let payload;
 const client=createWebsiteClient({config,fetchImpl:async(url,options)=>{assert.equal(url,'https://website.example/api/crm/partners');payload=JSON.parse(options.body);return response({_id:id});}});
 await client.editResource('agents',undefined,{name:'Agency',email:'agent@example.test',password:'AgentUnique!42',companyName:'Company'},'one');
 assert.equal(payload.companyId,'one');assert.match(payload.recordId,/^[a-f0-9]{64}$/);assert.equal(payload.profile.companyName,'Company');assert.equal(payload.role,undefined);
 await assert.rejects(client.editResource('agents',undefined,{name:'Agency',role:'admin'},'one'));
 await assert.rejects(client.editResource('agents',undefined,{name:'Agency',email:'agent@example.test'}));
});

test('community comment moderation verifies the parent and exposes only allowed status and note',async()=>{
 let writes=0;
 const comment='b'.repeat(24);
 const client=createWebsiteClient({config,fetchImpl:async(url,options)=>{if(options.method==='PATCH'){writes++;assert.equal(url,`https://website.example/api/admin/community-comments/${comment}`);return response({status:'hidden'});}return response({comments:[{_id:comment}]});}});
 await client.moderateComment(id,comment,{status:'hidden',moderationNote:'Spam'});assert.equal(writes,1);
 await assert.rejects(client.moderateComment(id,'c'.repeat(24),{status:'hidden',moderationNote:'Spam'}),{status:404});
 await assert.rejects(client.moderateComment(id,comment,{status:'hidden',moderationNote:'Spam',author:id}));assert.equal(writes,1);
});
test('suspensions use student identities to lift the suspension and settings remain a singleton',async()=>{
 const student='b'.repeat(24),calls=[];
 const client=createWebsiteClient({config,fetchImpl:async(url,options)=>{calls.push({url,options});return response(options.method==='GET'?[{_id:id,user:{_id:student,name:'Student'}}]:{});}});
 const data=await client.resource('communitySuspensions');assert.equal(data.rows[0]._id,student);assert.equal(data.rows[0].suspensionId,id);
 await client.action('communitySuspensions',student,'lift',{note:'Reviewed'});assert.equal(calls[1].url,`https://website.example/api/admin/community-suspensions/${student}`);assert.equal(calls[1].options.method,'DELETE');
 await assert.rejects(client.editResource('communitySettings',undefined,{blockedTerms:['Spam']}));
});

test('student offers and opportunities preserve immutable kinds and page through full source history',async()=>{
 const calls=[];
 const client=createWebsiteClient({config,fetchImpl:async(url,options)=>{calls.push({url,options});if(options.method==='GET'){const page=Number(new URL(url).searchParams.get('page'));return response({items:[{_id:page===1?id:'b'.repeat(24),kind:'offer',title:'Offer'}],pagination:{totalPages:2}});}return response({});}});
 const offers=await client.resource('studentOffers');assert.equal(offers.rows.length,2);assert.equal(offers.completeness,'paginated');assert.equal(new URL(calls[0].url).searchParams.get('kind'),'offer');
 await client.editResource('studentOffers',id,{title:'Updated'});const edited=calls.find(row=>row.options.method==='PUT');assert.equal(edited.url,`https://website.example/api/admin/community-posts/listings/${id}`);assert.equal(JSON.parse(edited.options.body).kind,'offer');
 await client.editResource('studentOpportunities',undefined,{title:'New',published:false});assert.equal(JSON.parse(calls.at(-1).options.body).kind,'opportunity');
});


test('catalog editors expose all country visa and article fields, university colors and program popularity', async () => {
  const { websiteResources } = await import('./website.service.js');
  const expected = {
    countries: ['name','code','description','heroImage','visaNotes','processingDays','visaFeeUsd','languageRequirements','visaNotesList','visaRequirements','universityCount','specialtyCount','averageTuition','articleTitle','articleTitleColor','articleHeadingColor','articleBodyColor','articleHeadings','articleBodies','featured'],
    universities: ['articleTitleColor','articleHeadingColor','articleBodyColor'],
    programs: ['popularity','requiredDocumentTypes','fieldsOfStudy'],
  };
  for (const [key, fields] of Object.entries(expected)) for (const field of fields) assert.ok(websiteResources[key].editFields.includes(field), `${key}: ${field}`);
  assert.ok(!websiteResources.countries.editFields.includes('heroSubtitle'));
});

test('country edits forward complete visa data and preserve untouched source requirements', async () => {
  let payload;
  const original = {_id:id,name:'Turkey',code:'TR',visaRequirements:[{docKey:'passport',label:'Passport'}],languageRequirements:['IELTS 6.5'],visaNotesList:['Keep note'],journeyStageRequirements:[{stage:'visa',documents:['passport']}],articleBodies:['Keep body'],visaFeeUsd:50};
  const client=createWebsiteClient({config,fetchImpl:async(_url,options)=>{if(options.method==='PUT'){payload=JSON.parse(options.body);return response(payload);}return response([original]);}});
  await client.editResource('countries',id,{processingDays:10,featured:true,articleTitleColor:'#123456'});
  assert.equal(payload.processingDays,10);
  assert.equal(payload.articleTitleColor,'#123456');
  assert.deepEqual(payload.visaRequirements,original.visaRequirements);
  assert.deepEqual(payload.languageRequirements,original.languageRequirements);
  assert.deepEqual(payload.journeyStageRequirements,original.journeyStageRequirements);
  assert.deepEqual(payload.articleBodies,original.articleBodies);
  assert.equal(payload.visaFeeUsd,50);
});

test('country creation and university colors and program popularity reach the website API',async()=>{
 const calls=[];
 const client=createWebsiteClient({config,fetchImpl:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return response({});}});
 await client.editResource('countries',undefined,{name:'Country',code:'XY',visaFeeUsd:0,visaRequirements:[{docKey:'passport',label:'Passport'}],featured:false});
 await client.editResource('universities',undefined,{name:'University',country:id,articleTitleColor:'#123456',articleHeadingColor:'#234567',articleBodyColor:'#345678'});
 await client.editResource('programs',undefined,{title:'Medicine',university:id,degreeLevel:'Bachelor',fieldOfStudy:'Medicine',fieldsOfStudy:['Medicine'],requiredDocumentTypes:['passport'],popularity:0});
 assert.equal(calls[0].url,'https://website.example/api/admin/countries');
 assert.equal(calls[0].body.featured,false);
 assert.deepEqual(calls[0].body.visaRequirements,[{docKey:'passport',label:'Passport'}]);
 assert.equal(calls[1].body.articleTitleColor,'#123456');
 assert.equal(calls[2].body.popularity,0);
 assert.deepEqual(calls[2].body.requiredDocumentTypes,['passport']);
});


test('CRM reply identity is signed by the gateway, not accepted from browser payloads',async()=>{
 const previous=process.env.STUDY_BIRDS_SSO_SECRET;process.env.STUDY_BIRDS_SSO_SECRET='fixture-shared-secret';
 try{
  const {createHmac}=await import('node:crypto');let sent;
  const client=createWebsiteClient({config,fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return response({});}});
  const actor={sub:'crm-employee',name:'Advisor',companyId:'one'};
  await client.action('support',id,'reply',{message:' Reply ',status:'answered'},actor);
  assert.equal(sent.crmActor.name,'Advisor');
  const {signature,...identity}=sent.crmActor;
  const expected=createHmac('sha256','fixture-shared-secret').update(JSON.stringify({ticketId:id,message:'Reply',status:'answered',...identity})).digest('hex');
  assert.equal(signature,expected);
  await assert.rejects(client.action('support',id,'reply',{message:'Reply',crmActor:{name:'Forged'}},actor));
 }finally{if(previous===undefined)delete process.env.STUDY_BIRDS_SSO_SECRET;else process.env.STUDY_BIRDS_SSO_SECRET=previous;}
});
