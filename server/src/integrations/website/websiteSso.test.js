import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {resolveSsoAccount} from './websiteSso.js';
const secret='x'.repeat(64);
const db={users:[{id:'crm',companyId:'one',websiteAccountId:'site',role:'consultant',isActive:true},{id:'other',companyId:'two',websiteAccountId:'other-site',role:'admin'}]};
const proof=(claims={},options={})=>jwt.sign({companyId:'one',...claims},secret,{subject:'site',issuer:'study-birds',audience:'study-birds-crm',expiresIn:60,jwtid:'request',...options});
test('SSO resolves the linked CRM role and company rather than roles submitted by the website',()=>{
  assert.equal(resolveSsoAccount(proof({role:'admin'}),db,secret).role,'consultant');
  assert.throws(()=>resolveSsoAccount(proof({companyId:'two'}),db,secret));
  assert.throws(()=>resolveSsoAccount(proof(),{users:[{...db.users[0],isActive:false}]},secret));
});
test('SSO rejects replay, expired proofs, wrong audience and unsigned requests',()=>{
  const used=new Map();const signed=proof();resolveSsoAccount(signed,db,secret,used);
  assert.throws(()=>resolveSsoAccount(signed,db,secret,used));
  assert.throws(()=>resolveSsoAccount(proof({}, {expiresIn:-1}),db,secret));
  assert.throws(()=>resolveSsoAccount(proof({}, {audience:'other'}),db,secret));
  assert.throws(()=>resolveSsoAccount('unsigned',db,secret));
});
