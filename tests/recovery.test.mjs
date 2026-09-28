import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import vm from 'node:vm';
const dir=new URL('../extension/',import.meta.url);
let serial=0;
async function setup(videos,fetcher){
 const dom=new JSDOM(await readFile(new URL('manager.html',dir),'utf8'),{url:'https://extension.test/manager.html?tab=42'});
 Object.assign(globalThis,{document:dom.window.document,window:dom.window,location:dom.window.location});
 let session={},store={},downloads=[],listeners=new Set(),cancelled=[];
 globalThis.fetch=fetcher;
 globalThis.chrome={runtime:{onMessage:{addListener:()=>{}}},storage:{session:{get:async()=>structuredClone(session),set:async v=>{session=structuredClone(v);}},local:{get:async()=>structuredClone(store),set:async v=>{store=structuredClone(v);}}},tabs:{query:async()=>[{id:42}],get:async()=>({id:42,url:'https://whop.com/lesson'}),sendMessage:async()=>({videos})},scripting:{executeScript:async()=>{}},downloads:{download:async o=>{downloads.push(o);return downloads.length;},search:async()=>[{state:'complete'}],onChanged:{addListener:l=>listeners.add(l),removeListener:l=>listeners.delete(l)},cancel:async id=>cancelled.push(id)}};
 await import(new URL('manager.js?test='+serial++,dir));await new Promise(r=>setImmediate(r));
 await document.getElementById('add').onclick();
 return {click:id=>document.getElementById(id).onclick(),get queue(){return store.queue;},downloads,listeners,cancelled,close:()=>dom.window.close()};
}
const video={id:'https://stream.mux.com/a.m3u8',url:'https://stream.mux.com/a.m3u8',title:'Lesson A',kind:'hls'};
function response(url,body,status=200){const r=new Response(body,{status});Object.defineProperty(r,'url',{value:url});return r;}
test('retries a truncated segment body, then completes',async()=>{
 let attempts=0;
 const h=await setup([video],async url=>{
  if(url.endsWith('.m3u8'))return response(url,'#EXTM3U\n#EXTINF:1,\none.ts\n#EXT-X-ENDLIST');
  attempts++;const r=response(url,'video bytes');if(attempts===1)r.arrayBuffer=async()=>{throw new Error('Connection lost during body');};return r;
 });
 await h.click('download');assert.equal(attempts,2);assert.equal(h.queue[0].status,'Complete');assert.equal(h.downloads.length,1);h.close();
});
test('an expired link fails once and does not prevent the next queued video',async()=>{
 let attempts=0;
 const second={id:'https://stream.mux.com/b.mp4',url:'https://stream.mux.com/b.mp4',kind:'file',title:'Lesson B'};
 const h=await setup([video,second],async url=>{attempts++;return response(url,'Expired',403);});
 await h.click('download');assert.equal(attempts,1);assert.equal(h.queue[0].status,'Failed');assert.match(h.queue[0].error,/403/);assert.equal(h.queue[1].status,'Complete');assert.equal(h.downloads.length,1);h.close();
});
test('Stop aborts the active request and retains unfinished queue entries',async()=>{
 let started;const ready=new Promise(r=>started=r);
 const h=await setup([video,{...video,id:video.id+'2',url:video.url+'2'}],async(url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true});started();}));
 const downloading=h.click('download');await ready;h.click('cancel');await downloading;
 assert.equal(h.queue[0].status,'Stopped');assert.equal(h.queue[1].status,'Ready');assert.equal(h.downloads.length,0);h.close();
});
test('download remains Saving until Chrome confirms completion',async()=>{
 const h=await setup([{...video,url:'https://stream.mux.com/a.mp4',kind:'file'}],async()=>{throw new Error('Unexpected fetch');});
 let observed;const ready=new Promise(r=>observed=r);
 chrome.downloads.search=async()=>{observed();return [{state:'in_progress'}];};
 const downloading=h.click('download');await ready;assert.match(document.getElementById('queue').textContent,/Saving/);
 for(const listener of h.listeners)listener({id:1,state:{current:'complete'}});
 await downloading;assert.equal(h.queue[0].status,'Complete');assert.equal(h.listeners.size,0);h.close();
});
test('the action opens Chrome side panel without creating tabs',async()=>{
 let setting;
 vm.runInNewContext(await readFile(new URL('background.js',dir),'utf8'),{console,chrome:{storage:{local:{setAccessLevel:async()=>{}}},sidePanel:{setPanelBehavior:async value=>{setting=value;}}}});
 assert.equal(setting.openPanelOnActionClick,true);
});
