// Start listening before slow database/catalog initialization. Requests are retried,
// never acknowledged as accepted work while the service is still starting.
export function installReadiness(app,{buildCommit=null}={}){
 let ready=false;
 app.get('/api/health',(_req,res)=>res.status(ready?200:503).json({status:ready?'ok':'starting',time:new Date().toISOString(),websiteIntegration:15,buildCommit}));
 app.use((_req,res,next)=>{if(ready)return next();res.set('Retry-After','10');res.status(503).json({message:'Service is starting; retry shortly'});});
 return {markReady(){ready=true;}};
}
