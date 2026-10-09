import test from 'node:test';import assert from 'node:assert/strict';
import {conversationKey,updateConversationWorkspace} from './conversationWorkspace.js';
test('website conversation follow-up preserves source identity and prevents foreign or inactive assignees',()=>{
 const db={users:[{id:'one',companyId:'company',isActive:true},{id:'foreign',companyId:'other'},{id:'inactive',companyId:'company',isActive:false}]};
 const id='a'.repeat(24);
 updateConversationWorkspace(db,'company',id,{assignedUserId:'one',status:'pending',tags:['VIP']},'actor');
 assert.equal(db.websiteConversationMetadata[conversationKey('company',id)].assignedUserId,'one');
 assert.equal(db.websiteConversationMetadata[conversationKey('other',id)],undefined);
 for(const assignedUserId of ['foreign','inactive'])assert.throws(()=>updateConversationWorkspace(db,'company',id,{assignedUserId},'actor'),{status:400});
 assert.throws(()=>updateConversationWorkspace(db,'company',id,{status:'invalid'},'actor'),{status:400});
 assert.throws(()=>updateConversationWorkspace(db,'company',id,{companyId:'other'},'actor'),{status:400});
});
