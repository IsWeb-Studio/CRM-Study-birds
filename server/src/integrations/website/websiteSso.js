import jwt from 'jsonwebtoken';
import {signToken} from '../../auth.js';
export function resolveSsoAccount(proof,db,secret,used=new Map()) {
  if (!secret || secret.length < 32) throw Object.assign(new Error('ربط جلسات الموقع غير مهيأ.'),{status:503});
  const claims=jwt.verify(proof,secret,{algorithms:['HS256'],issuer:'study-birds',audience:'study-birds-crm'});
  if (!claims.jti || !claims.sub || !claims.companyId) throw Object.assign(new Error('طلب جلسة غير صالح.'),{status:401});
  for (const [key,expires] of used) if (expires < Date.now()) used.delete(key);
  if (used.has(claims.jti)) throw Object.assign(new Error('استُخدم طلب الجلسة بالفعل.'),{status:401});
  const user=db.users.find(row=>row.websiteAccountId === claims.sub && row.companyId === claims.companyId && row.isActive !== false);
  if (!user) throw Object.assign(new Error('الحساب غير مرتبط بمستخدم CRM نشط.'),{status:403});
  used.set(claims.jti,claims.exp*1000);
  return user;
}
export function mountWebsiteSso(app,{readDb}) {
  const used=new Map();
  app.post('/api/integrations/website/sso',async(req,res)=>{
    try {
      if (typeof req.body?.proof !== 'string' || req.body.proof.length > 2500) return res.status(400).json({message:'طلب جلسة غير صالح.'});
      const user=resolveSsoAccount(req.body.proof,await readDb(),process.env.STUDY_BIRDS_SSO_SECRET,used);
      const {passwordHash,...safe}=user;
      res.set('Cache-Control','no-store').json({token:signToken(user),user:safe});
    } catch(error) {res.status(error.status || 401).json({message:error.status ? error.message : 'توقيع الجلسة غير صالح أو منتهي.'});}
  });
}
