import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import vm from 'node:vm';
const dir=new URL('../extension/',import.meta.url);
test('detects signed Mux source inside nested shadow DOM without storing blob URLs',async()=>{
 const dom=new JSDOM('<mux-player title="Lesson one"></mux-player>',{url:'https://whop.com/course/lesson'});
 const p=dom.window.document.querySelector('mux-player');const shadow=p.attachShadow({mode:'open'});shadow.innerHTML='<mux-video src="https://stream.mux.com/abc.m3u8?token=private"></mux-video>';
 shadow.querySelector('mux-video').attachShadow({mode:'open'}).innerHTML='<video src="blob:https://whop.com/example"></video>';
 let listener;vm.runInNewContext(await readFile(new URL('content.js',dir),'utf8'),{document:dom.window.document,location:dom.window.location,chrome:{runtime:{onMessage:{addListener:l=>listener=l}}},URL});
 let result;listener({type:'scan'},{},r=>result=r);assert.equal(result.videos.length,1);assert.equal(result.videos[0].title,'Lesson one');assert.equal(result.videos[0].url,'https://stream.mux.com/abc.m3u8?token=private');
});
test('scan, select, deduplicate, persist, ordered HLS download, completion, skip completed',async()=>{
 const dom=new JSDOM(await readFile(new URL('manager.html',dir),'utf8'),{url:'https://extension.test/manager.html?tab=42'});
 Object.assign(globalThis,{document:dom.window.document,window:dom.window,location:dom.window.location});
 let session={},store={},downloads=[],savedBlob;const listeners=new Set();
 const video={id:'https://stream.mux.com/abc.m3u8',url:'https://stream.mux.com/abc.m3u8?token=x',title:'Lesson / One',kind:'hls',page:'https://whop.com/lesson'};
 globalThis.chrome={runtime:{onMessage:{addListener:()=>{}}},storage:{session:{get:async()=>structuredClone(session),set:async v=>{session=structuredClone(v);}},local:{get:async()=>structuredClone(store),set:async v=>{store=structuredClone(v);}}},tabs:{query:async()=>[{id:42}],get:async()=>({id:42,url:video.page}),sendMessage:async()=>({videos:[video]})},scripting:{executeScript:async()=>{}},downloads:{download:async options=>{savedBlob=await(await fetch(options.url)).arrayBuffer();downloads.push(options);return downloads.length;},search:async()=>[{state:'complete'}],onChanged:{addListener:l=>listeners.add(l),removeListener:l=>listeners.delete(l)},cancel:async()=>{}}};
 const realFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{
  if(url.startsWith('blob:'))return realFetch(url,options);
  const data=url.includes('abc.m3u8')?'#EXTM3U\n#EXTINF:1,\n1.ts\n#EXTINF:1,\n2.ts\n#EXT-X-ENDLIST':url.endsWith('1.ts')?'segment-one':'segment-two';
  const response=new Response(data);Object.defineProperty(response,'url',{value:url});return response;
 };
 await import(new URL('manager.js',dir));
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(document.querySelectorAll('#detected input').length,1);
 await document.getElementById('add').onclick();await document.getElementById('add').onclick();assert.equal(store.queue.length,1);
 await document.getElementById('download').onclick();assert.equal(downloads.length,1);assert.equal(downloads[0].filename,'Whop Videos/Lesson _ One.ts');assert.equal(new TextDecoder().decode(savedBlob),'segment-onesegment-two');assert.equal(store.queue[0].status,'Complete');assert.equal(listeners.size,0);
 await document.getElementById('download').onclick();assert.equal(downloads.length,1);
 await document.getElementById('clear').onclick();assert.equal(store.queue.length,0);
 globalThis.fetch=realFetch;dom.window.close();
});
