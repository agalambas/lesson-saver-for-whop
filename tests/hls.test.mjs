import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePlaylist,chooseVariant,safeName} from '../extension/hls.js';
const base='https://stream.mux.com/a/master.m3u8?token=x';
test('selects best muxed rendition and resolves URLs',()=>{const p=parsePlaylist('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200\nhigh.m3u8',base);assert.equal(chooseVariant(p).url,'https://stream.mux.com/a/high.m3u8');});
test('preserves segment order, query and initialization',()=>{const p=parsePlaylist('#EXTM3U\n#EXT-X-MAP:URI="init.mp4?x=1"\n#EXTINF:2,\ns1.m4s?sig=a\n#EXTINF:3,\n../s2.m4s\n#EXT-X-ENDLIST',base);assert.equal(p.map,'https://stream.mux.com/a/init.mp4?x=1');assert.deepEqual(p.segments,['https://stream.mux.com/a/s1.m4s?sig=a','https://stream.mux.com/s2.m4s']);assert.equal(p.duration,5);assert.equal(p.ended,true);});
test('rejects encrypted streams',()=>assert.throws(()=>parsePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"',base),/Encrypted/));
test('resolves a separate default audio track with the selected video',()=>{
 const p=parsePlaylist('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="English",DEFAULT=YES,URI="audio.m3u8?sig=x"\n#EXT-X-STREAM-INF:BANDWIDTH=100,AUDIO="a"\nv.m3u8',base);
 assert.equal(chooseVariant(p).audioUrl,'https://stream.mux.com/a/audio.m3u8?sig=x');
});
test('rejects byte ranges and invalid responses',()=>{assert.throws(()=>parsePlaylist('Forbidden',base),/playlist/);assert.throws(()=>parsePlaylist('#EXTM3U\n#EXT-X-BYTERANGE:123',base),/Byte-range/);});
test('sanitizes filenames',()=>assert.equal(safeName('../lesson: one?'),'.._lesson_ one_'));
