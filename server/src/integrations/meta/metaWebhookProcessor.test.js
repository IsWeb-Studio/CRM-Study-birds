import test from 'node:test';
import assert from 'node:assert/strict';
import {processMetaWebhookRecord} from './metaWebhookProcessor.js';
const channel={id:'channel',companyId:'company',channelType:'whatsapp',phoneNumberId:'phone'};
const payload={entry:[{id:'entry',changes:[{field:'messages',value:{metadata:{phone_number_id:'phone'},contacts:[{wa_id:'111',profile:{name:'First'}},{wa_id:'222',profile:{name:'Second'}}],messages:[{id:'m1',from:'111',type:'text',text:{body:'One'}},{id:'m2',from:'222',type:'text',text:{body:'Two'}}]}}]}]};
test('all messages and matching contacts are processed, preserving the original payload',()=>{
 const before=JSON.stringify(payload),messages=[];
 processMetaWebhookRecord({connectedChannels:[channel]},{id:'event',payload},{storeInboundMessage:(_db,_company,_channel,message)=>messages.push(message),updateMessageStatus:()=>{}});
 assert.deepEqual(messages.map(row=>row.externalMessageId),['m1','m2']);
 assert.deepEqual(messages.map(row=>row.externalSenderName),['First','Second']);
 assert.equal(JSON.stringify(payload),before);
});
test('unmatched channels fail for durable retry instead of being silently discarded',()=>{
 assert.throws(()=>processMetaWebhookRecord({connectedChannels:[]},{payload},{storeInboundMessage:()=>{},updateMessageStatus:()=>{}}),/No connected/);
});
