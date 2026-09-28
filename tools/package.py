from pathlib import Path
import json, zipfile, hashlib
root=Path(__file__).resolve().parents[1]
ext=root/'extension'
manifest=json.loads((ext/'manifest.json').read_text())
out=root/'dist';out.mkdir(exist_ok=True)
zip_path=out/f"lesson-saver-for-whop-{manifest['version']}.zip"
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for path in sorted(ext.rglob('*')):
        if not path.is_file() or path.name.startswith('.'):continue
        archive.write(path,path.relative_to(ext))
with zipfile.ZipFile(zip_path) as archive:
    assert 'manifest.json' in archive.namelist()
    assert archive.testzip() is None
print(zip_path)
print('SHA256',hashlib.sha256(zip_path.read_bytes()).hexdigest())
