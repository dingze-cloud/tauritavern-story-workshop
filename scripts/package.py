from pathlib import Path
import hashlib
import json
import sys
import zipfile

sys.stdout.reconfigure(encoding='utf-8')
root = Path(__file__).resolve().parent.parent
out = root / 'artifacts'
out.mkdir(exist_ok=True)
version = json.loads((root / 'src' / 'manifest.json').read_text(encoding='utf-8'))['version']
plugin_files = [p for p in (root / 'src').iterdir() if p.is_file()]
with zipfile.ZipFile(out / f'story-workshop-{version}.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in plugin_files:
        archive.write(file, f'story-workshop/{file.name}')
    archive.write(root / 'README.md', 'story-workshop/README.md')
with zipfile.ZipFile(out / f'story-workshop-install-kit-{version}.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in plugin_files:
        archive.write(file, f'story-workshop/{file.name}')
    archive.write(root / 'README.md', '手机安装说明.md')
    archive.write(root / 'scripts' / 'serve-install.py', 'serve-install.py')
    archive.write(root / 'scripts' / '启动手机安装.cmd', '启动手机安装.cmd')
with zipfile.ZipFile(out / f'story-workshop-source-{version}.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for folder in ['src', 'scripts', 'tests']:
        for file in (root / folder).rglob('*'):
            if file.is_file() and '__pycache__' not in file.parts:
                archive.write(file, file.relative_to(root).as_posix())
    verification = root / 'docs' / '验证.md'
    if verification.is_file():
        archive.write(verification, 'docs/验证.md')
    for name in ['README.md', 'manifest.json', 'package.json', 'package-lock.json', '.gitignore']:
        if (root / name).is_file():
            archive.write(root / name, name)
summary = []
for file in sorted(out.glob(f'*{version}.zip')):
    summary.append({'file': file.name, 'bytes': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
(out / 'checksums.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
