"""Serve dist/ under the real Pages base path: http://127.0.0.1:8803/legalization-lesson03-legality-metrics/"""
import functools
import http.server
import os
import sys

BASE = "/legalization-lesson03-legality-metrics"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dist")


class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = path.split("?", 1)[0].split("#", 1)[0]
        if not p.startswith(BASE):
            return os.path.join(ROOT, "__nope__")
        return super().translate_path(p[len(BASE):] or "/")

    def send_error(self, code, message=None, explain=None):
        if code == 404 and os.path.exists(os.path.join(ROOT, "404.html")):
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(open(os.path.join(ROOT, "404.html"), "rb").read())
            return
        super().send_error(code, message, explain)

    def send_head(self):
        # minimal single-range support so <video> can seek (GitHub Pages supports ranges too)
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or not rng.startswith("bytes=") or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        a, _, b = rng[6:].partition("-")
        start = int(a) if a else max(0, size - int(b))
        end = int(b) if a and b else size - 1
        end = min(end, size - 1)
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        n = getattr(self, "_remaining", None)
        if n is None:
            return super().copyfile(source, outputfile)
        while n > 0:
            chunk = source.read(min(65536, n))
            if not chunk:
                break
            outputfile.write(chunk)
            n -= len(chunk)
        self._remaining = None

    def log_message(self, *a):
        pass


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8803
http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(H, directory=ROOT)).serve_forever()
