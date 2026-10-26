"""Loopback-only desktop web application. Run with --no-browser for development."""
import argparse
import json
import os
from pathlib import Path
import secrets
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
import webbrowser

from uke import VERSION, BUILD_DATE
from uke.music import convert
from uke.export import svg, midi, musicxml

ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
TOKEN = secrets.token_urlsafe(32)
MAX_BODY = 18 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Never persist user images, scores, endpoint settings or API keys.

    def reply(self, status, data, content_type="application/json; charset=utf-8"):
        if isinstance(data, dict):
            data = json.dumps(data, ensure_ascii=False).encode()
        elif isinstance(data, str):
            data = data.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src blob:; frame-ancestors 'none'")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def valid_host(self):
        host = self.headers.get("Host", "")
        return host in ("127.0.0.1:%d" % self.server.server_port, "localhost:%d" % self.server.server_port)

    def do_GET(self):
        if not self.valid_host():
            return self.reply(403, {"error": "只允许本机访问。"})
        path = urlparse(self.path).path
        if path == "/api/session":
            return self.reply(200, {"token": TOKEN, "version": VERSION, "buildDate": BUILD_DATE})
        files = {"/": ("index.html", "text/html; charset=utf-8"),
                 "/app.js": ("app.js", "text/javascript; charset=utf-8"),
                 "/style.css": ("style.css", "text/css; charset=utf-8"),
                 "/demo.png": ("demo.png", "image/png")}
        if path not in files:
            return self.reply(404, {"error": "文件不存在。"})
        name, mime = files[path]
        file = ROOT / "web" / name
        if not file.is_file():
            return self.reply(404, {"error": "文件不存在。"})
        self.reply(200, file.read_bytes(), mime)

    def do_POST(self):
        if not self.valid_host() or not secrets.compare_digest(self.headers.get("X-Session-Token", ""), TOKEN):
            return self.reply(403, {"error": "会话已失效，请刷新页面。"})
        origin = self.headers.get("Origin")
        if origin and origin not in ("http://127.0.0.1:%d" % self.server.server_port, "http://localhost:%d" % self.server.server_port):
            return self.reply(403, {"error": "请求来源不被允许。"})
        if self.headers.get_content_type() != "application/json":
            return self.reply(415, {"error": "请求须为 JSON。"})
        try:
            size = int(self.headers.get("Content-Length", 0))
            if size < 2 or size > MAX_BODY:
                return self.reply(413, {"error": "请求过大或为空，请先裁剪图片。"})
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError("请求内容须为 JSON 对象。")
            path = urlparse(self.path).path
            if path == "/api/recognize":
                from uke.ocr import decode_image, vision_ocr
                return self.reply(200, vision_ocr(decode_image(data.get("image")), data.get("settings", {})))
            if path == "/api/convert":
                result = convert(data)
                result["svg"] = svg(result)
                return self.reply(200, result)
            if path in ("/api/export/midi", "/api/export/musicxml", "/api/export/svg"):
                result = convert(data)
                if path.endswith("midi"):
                    return self.reply(200, midi(result), "audio/midi")
                if path.endswith("musicxml"):
                    return self.reply(200, musicxml(result), "application/vnd.recordare.musicxml+xml")
                return self.reply(200, svg(result), "image/svg+xml; charset=utf-8")
            if path == "/api/quit":
                self.reply(200, {"ok": True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return
            return self.reply(404, {"error": "接口不存在。"})
        except ImportError:
            return self.reply(503, {"error": "图片处理依赖未安装。请运行 启动.cmd 安装 Pillow。"})
        except (ValueError, TypeError, OverflowError, KeyError) as exc:
            return self.reply(400, {"error": str(exc)[:600]})
        except Exception:
            return self.reply(500, {"error": "处理失败，请检查输入或重试。接口密钥与图片不会写入日志。"})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.daemon_threads = True
    url = "http://127.0.0.1:%d" % server.server_port
    if sys.stdout:
        print("JianpuUke %s (%s) %s" % (VERSION, BUILD_DATE, url), flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
