import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadQueue,saveQueue} from '../extension/queue-store.js';
function mock(localData={},sessionData={}) {
 return {local:{data:localData,async get(){return structuredClone(this.data)},async set(v){this.data=structuredClone(v)}},session:{data:sessionData,async get(){return structuredClone(this.data)},async set(v){this.data=structuredClone(v)}}};
}
test('signed links are in session memory, never persistent queue storage',async()=>{
 const storage=mock();const item={id:'https://stream.mux.com/video.m3u8',url:'https://stream.mux.com/video.m3u8?token=secret',title:'Example',page:'https://whop.com/private',status:'Ready'};
 await saveQueue([item],storage);
 assert.equal(JSON.stringify(storage.local.data).includes('secret'),false);
 assert.equal(JSON.stringify(storage.local.data).includes('private'),false);
 assert.equal((await loadQueue(storage))[0].url,item.url);
 storage.session.data={};const [restored]=await loadQueue(storage);assert.equal(restored.status,'Rescan needed');assert.equal(restored.url,undefined);
});
test('migrates existing stored URLs out of persistent storage and removes discarded links',async()=>{
 const storage=mock({queue:[{id:'v1',url:'https://stream.mux.com/v.m3u8?token=old',status:'Ready'}]});
 const queue=await loadQueue(storage);await saveQueue(queue,storage);assert.equal(storage.local.data.queue[0].url,undefined);assert.equal(storage.session.data.mediaUrls.v1,queue[0].url);
 await saveQueue([],storage);assert.deepEqual(storage.session.data.mediaUrls,{});
});
