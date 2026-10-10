function createMutationQueue({read,write,onFailure=()=>{}}) {
  let queue=Promise.resolve();
  return mutator=>{
    queue=queue.catch(()=>undefined).then(async()=>{
      // A failed mutator must never modify the cached committed snapshot.
      const data=structuredClone(await read());
      try {
        const result=await mutator(data);
        await write(data);
        return result;
      }catch(error){await onFailure(error);throw error;}
    });
    return queue;
  };
}
module.exports={createMutationQueue};
