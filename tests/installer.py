"""Exercise the exact Git smart-HTTP transport that mobile extension installation uses."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import threading
import urllib.request

root = Path(__file__).resolve().parent.parent
expected_version = json.loads((root / 'src' / 'manifest.json').read_text(encoding='utf-8'))['version']
spec = importlib.util.spec_from_file_location('installer', root / 'scripts' / 'serve-install.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='story-workshop-install-test-') as temporary:
    base = Path(temporary)
    source = base / 'server'
    source.mkdir()
    module.prepare(root / 'src', source)
    server = module.http.server.ThreadingHTTPServer(('127.0.0.1', 0), module.handler(source))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f'http://127.0.0.1:{server.server_port}/story-workshop.git'
        for name in ['clone1', 'clone2']:
            result = subprocess.run(['git', 'clone', '--depth', '1', url, str(base / name)], capture_output=True, text=True, timeout=60)
            assert result.returncode == 0, result.stderr
            manifest = json.loads((base / name / 'manifest.json').read_text(encoding='utf-8'))
            assert manifest['version'] == expected_version
            assert (base / name / manifest['js']).is_file()
        print('PASS: smart HTTP advertisement, protocol negotiation, shallow clone and plugin manifest/entry (twice).')
        try:
            urllib.request.urlopen(url + '/../../README.md')
            raise AssertionError('Path should not be served')
        except urllib.error.HTTPError as error:
            assert error.code == 404
        print('PASS: service only exposes read-only Git install routes.')
    finally:
        server.shutdown()
        server.server_close()
