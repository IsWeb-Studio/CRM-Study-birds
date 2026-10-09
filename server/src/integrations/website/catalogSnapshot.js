import {createHash} from 'node:crypto';
export async function loadCatalogSnapshot(client,readDb,mutateDb,companyId){
 const previous=(await readDb()).websiteCatalogSnapshots?.[companyId];
 let catalog;
 try{catalog=await client.catalog();}catch(error){if(!previous || error.status===403)throw error;return {...previous.catalog,stale:true,warnings:[{message:error.message}]};}
 const failed=new Set((catalog.warnings || []).filter(row=>row.status!==403).map(row=>row.resource));
 const merged={...catalog,stale:false};
 for(const key of ['countries','universities','programs','scholarships'])if(failed.has(key) && previous?.catalog[key]){merged[key]=previous.catalog[key];merged.stale=true;}
 const fingerprint=createHash('sha256').update(JSON.stringify(['countries','universities','programs','scholarships'].map(key=>merged[key]))).digest('hex');
 if(fingerprint!==previous?.fingerprint)await mutateDb(db=>{db.websiteCatalogSnapshots ||= {};db.websiteCatalogSnapshots[companyId]={fingerprint,catalog:merged};});
 return merged;
}
