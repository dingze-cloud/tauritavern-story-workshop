"""Serve only this plugin as a read-only smart-HTTP Git repository; no hosting account required."""
import argparse
import http.server
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import urllib.parse


def git(args, **kwargs):
    result = subprocess.run(['git', *args], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs)
    return result.stdout


def prepare(source, destination):
    source = source.resolve()
    if not (source / 'manifest.json').is_file():
        raise RuntimeError('Plugin directory must contain manifest.json.')
    work = destination / 'work'
    shutil.copytree(source, work, ignore=shutil.ignore_patterns('.git', 'credentials*', '.env*', 'node_modules'))
    git(['init', '--initial-branch=main', str(work)])
    git(['-C', str(work), 'add', '.'])
    git(['-C', str(work), '-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', '-c', 'user.name=Story Workshop', '-c', 'user.email=local@story-workshop.invalid', 'commit', '-m', 'Install Story Workshop'])
    repo = destination / 'story-workshop.git'
    git(['clone', '--bare', str(work), str(repo)])
    git(['-C', str(repo), 'config', 'http.receivepack', 'false'])
    return repo


def lan_addresses():
    addresses = set()
    try:
        for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = item[4][0]
            if not ip.startswith('127.'):
                addresses.add(ip)
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(('192.0.2.1', 80))
            addresses.add(sock.getsockname()[0])
    except OSError:
        pass
    return sorted(addresses)


def handler(project_root):
    class GitHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.run_git()

        def do_POST(self):
            self.run_git()

        def run_git(self):
            parsed = urllib.parse.urlsplit(self.path)
            if parsed.path == '/':
                body = ('Story Workshop local installation server\n'
                        'TauriTavern > Extensions > Install extension\n'
                        'Repository URL: http://<computer-LAN-IP>:' + str(self.server.server_port) + '/story-workshop.git\n'
                        'Keep this window open until installation finishes.\n').encode()
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if parsed.path not in ['/story-workshop.git/info/refs', '/story-workshop.git/git-upload-pack']:
                self.send_error(404)
                return
            if self.command == 'POST' and parsed.path != '/story-workshop.git/git-upload-pack':
                self.send_error(405)
                return
            length = int(self.headers.get('Content-Length', '0'))
            if length > 2097152 or length < 0:
                self.send_error(413)
                return
            env = os.environ.copy()
            env.update({
                'GIT_PROJECT_ROOT': str(project_root), 'GIT_HTTP_EXPORT_ALL': '1',
                'PATH_INFO': parsed.path, 'QUERY_STRING': parsed.query,
                'REQUEST_METHOD': self.command, 'CONTENT_TYPE': self.headers.get('Content-Type', ''),
                'CONTENT_LENGTH': str(length), 'REMOTE_ADDR': self.client_address[0],
                'GIT_PROTOCOL': self.headers.get('Git-Protocol', ''),
            })
            try:
                result = subprocess.run(['git', 'http-backend'], input=self.rfile.read(length), capture_output=True, env=env, timeout=90)
                output = result.stdout
                separator = b'\r\n\r\n' if b'\r\n\r\n' in output else b'\n\n'
                headers, body = output.split(separator, 1)
                parsed_headers = []
                status = 200
                for line in headers.decode('utf-8').splitlines():
                    name, value = line.split(':', 1)
                    if name.lower() == 'status':
                        status = int(value.strip().split()[0])
                    else:
                        parsed_headers.append((name, value.strip()))
                self.send_response(status)
                for name, value in parsed_headers:
                    self.send_header(name, value)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (subprocess.SubprocessError, ValueError, OSError):
                self.send_error(500, 'Git service failed')

        def log_message(self, fmt, *args):
            print('Git install:', fmt % args, flush=True)

    return GitHandler


def main():
    parser = argparse.ArgumentParser(description='Local, read-only Git installer for Story Workshop.')
    parser.add_argument('--lan', action='store_true', help='Listen on local network so your phone can install.')
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--source', type=Path)
    args = parser.parse_args()
    if not shutil.which('git'):
        raise RuntimeError('Git is required on the computer. The phone does not need Python or Git.')
    here = Path(__file__).resolve().parent
    source = args.source or (here / 'story-workshop' if (here / 'story-workshop').exists() else here.parent / 'src')
    with tempfile.TemporaryDirectory(prefix='story-workshop-install-') as temporary:
        root = Path(temporary)
        prepare(source, root)
        server = http.server.ThreadingHTTPServer(('0.0.0.0' if args.lan else '127.0.0.1', args.port), handler(root))
        addresses = lan_addresses() if args.lan else ['127.0.0.1']
        print('Story Workshop installation server is ready.', flush=True)
        print('On your phone: TauriTavern > Extensions > Install extension', flush=True)
        for address in addresses:
            print(f'http://{address}:{server.server_port}/story-workshop.git', flush=True)
        print('Keep this window open. Press Ctrl+C after installation.', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Installation server failed:', error, file=sys.stderr)
        sys.exit(1)
