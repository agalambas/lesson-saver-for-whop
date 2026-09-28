from pathlib import Path
import concurrent.futures,hashlib,json,subprocess,urllib.request
repos=[('ffmpeg.wasm-core','ffmpegwasm/ffmpeg.wasm','v12.15'),('ffmpeg.wasm-wrapper','ffmpegwasm/ffmpeg.wasm','v12.15'),('ffmpeg','FFmpeg/FFmpeg','n5.1.4'),('x264','ffmpegwasm/x264','4-cores'),('x265','ffmpegwasm/x265','3.4'),('libvpx','ffmpegwasm/libvpx','v1.13.1'),('lame','ffmpegwasm/lame','master'),('ogg','ffmpegwasm/Ogg','v1.3.4'),('theora','ffmpegwasm/theora','v1.1.1'),('opus','ffmpegwasm/opus','v1.3.1'),('vorbis','ffmpegwasm/vorbis','v1.3.3'),('zlib','ffmpegwasm/zlib','v1.2.11'),('libwebp','ffmpegwasm/libwebp','v1.3.2'),('freetype','ffmpegwasm/freetype2','VER-2-10-4'),('fribidi','fribidi/fribidi','v1.0.9'),('harfbuzz','harfbuzz/harfbuzz','5.2.0'),('libass','libass/libass','0.15.0'),('zimg','sekrit-twc/zimg','release-3.0.5')]
root=Path(__file__).resolve().parents[1]/'dist/source-materials';root.mkdir(parents=True,exist_ok=True)
def run(item):
 name,repo,ref=item
 meta=json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/commits/{ref}']))
 sha=meta['sha'];url=f'https://codeload.github.com/{repo}/tar.gz/{sha}';p=root/f'{name}-{sha[:12]}.tar.gz'
 if not p.exists():
  with urllib.request.urlopen(url,timeout=120) as res,p.open('wb') as out:
   while chunk:=res.read(1024*1024):out.write(chunk)
 return {'name':name,'repository':f'https://github.com/{repo}','build_ref':ref,'commit':sha,'commit_date':meta['commit']['committer']['date'],'archive':p.name,'url':url,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for future in concurrent.futures.as_completed([pool.submit(run,r) for r in repos]):
  try:r=future.result();results.append(r);print(r['name'],r['commit'][:12],r['commit_date'],r['bytes'],flush=True)
  except Exception as e:print('ERROR',str(e),flush=True)
(root/'SOURCES.json').write_text(json.dumps(sorted(results,key=lambda x:x['name']),indent=2)+'\n')
assert len(results)==len(repos),f'Only {len(results)} of {len(repos)} sources collected'
