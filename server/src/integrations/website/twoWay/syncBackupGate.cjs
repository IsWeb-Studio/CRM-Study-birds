const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
// Receipt and files live outside Git. Both complete exports must be readable by the server.
async function assertBackups(env=process.env) {
  if(!env.SYNC_BACKUP_RECEIPT_FILE)throw Object.assign(new Error('Verified backups are required'),{status:503});
  const receipt=JSON.parse(await fs.readFile(env.SYNC_BACKUP_RECEIPT_FILE,'utf8'));
  if(receipt.website?.directory && receipt.crm?.directory && path.resolve(receipt.website.directory)===path.resolve(receipt.crm.directory))throw new Error('Distinct backups of both databases are required');
  for(const side of ['website','crm']) {
    const item=receipt[side];
    if(!item?.directory || !/^[a-f\d]{64}$/.test(item.manifestHash || ''))throw new Error('Invalid backup receipt');
    const manifestBytes=await fs.readFile(path.join(item.directory,'manifest.json'));
    if(createHash('sha256').update(manifestBytes).digest('hex')!==item.manifestHash)throw new Error('Backup manifest changed');
    const manifest=JSON.parse(manifestBytes);
    if(manifest.format!=='study-birds-bson-v1' || !manifest.consistentSnapshot || !Array.isArray(manifest.collections) || !manifest.collections.length)throw new Error('Incomplete database backup');
    await fs.access(path.join(item.directory,'VERIFIED'));
    for(const collection of manifest.collections) {
      if(!/^\d+\.bson$/.test(collection.file))throw new Error('Invalid backup path');
      const bytes=await fs.readFile(path.join(item.directory,collection.file));
      if(createHash('sha256').update(bytes).digest('hex')!==collection.sha256)throw new Error('Backup checksum failed');
    }
  }
  return receipt;
}
module.exports={assertBackups};
