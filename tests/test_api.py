import base64
from io import BytesIO
import json
import threading
import unittest
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image
import app
from uke.ocr import vision_ocr, decode_image


class MockVision(BaseHTTPRequestHandler):
    requests = []
    mode = "ok"

    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.requests.append((body, self.headers.get("Authorization")))
        if self.mode == "error":
            self.send_response(401)
            self.end_headers()
            return
        if self.mode == "redirect":
            self.send_response(302)
            self.send_header("Location", "http://127.0.0.1:1/should-not-follow")
            self.end_headers()
            return
        obj = {"text": "1 2 3 4", "key": "C", "meter": "4/4", "uncertain": ["请核对"]}
        content = json.dumps(obj) if self.mode == "ok" else "[]" if self.mode == "array" else "not-json"
        raw = json.dumps({"choices": [{"message": {"content": content}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


class APITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        cls.mock = ThreadingHTTPServer(("127.0.0.1", 0), MockVision)
        for server in (cls.server, cls.mock):
            threading.Thread(target=server.serve_forever, daemon=True).start()
        cls.base = "http://127.0.0.1:%d" % cls.server.server_port
        cls.endpoint = "http://127.0.0.1:%d/v1/chat/completions" % cls.mock.server_port
        buf = BytesIO()
        Image.new("RGB", (80, 40), "white").save(buf, "PNG")
        cls.image = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    @classmethod
    def tearDownClass(cls):
        for server in (cls.server, cls.mock):
            server.shutdown()
            server.server_close()

    def request(self, path, body, token=app.TOKEN):
        request = urllib.request.Request(self.base+path, json.dumps(body).encode(),
                    {"Content-Type": "application/json", "X-Session-Token": token})
        return urllib.request.urlopen(request)

    def test_loopback_session_and_static(self):
        with urllib.request.urlopen(self.base + "/api/session") as response:
            self.assertEqual(json.load(response)["token"], app.TOKEN)
        with urllib.request.urlopen(self.base + "/") as response:
            self.assertIn("简谱小尤", response.read().decode())
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request("/api/convert", {"text": "1"}, token="wrong")
        self.assertEqual(ctx.exception.code, 403)

    def test_ai_image_envelope_to_score_to_exports(self):
        MockVision.mode = "ok"
        with self.request("/api/recognize", {"image": self.image, "settings": {
                "endpoint": self.endpoint, "model": "vision-test", "apiKey": "fake-test-key"}}) as response:
            result = json.load(response)
        body, auth = MockVision.requests[-1]
        self.assertEqual(auth, "Bearer fake-test-key")
        self.assertEqual(body["model"], "vision-test")
        content = body["messages"][0]["content"]
        self.assertEqual(content[1]["type"], "image_url")
        self.assertTrue(content[1]["image_url"]["url"].startswith("data:image/png;base64,"))
        self.assertNotIn("fake-test-key", json.dumps(result))
        with self.request("/api/convert", result) as response:
            score = json.load(response)
        self.assertEqual(len(score["notes"]), 4)
        self.assertEqual(score["unplayable"], [])
        for ext, header in (("svg", b"<svg"), ("midi", b"MThd"), ("musicxml", b"<?xml")):
            with self.request("/api/export/"+ext, result) as response:
                self.assertTrue(response.read().startswith(header))

    def test_ai_errors_are_actionable_and_no_secret_echo(self):
        for mode in ("error", "malformed", "array", "redirect"):
            MockVision.mode = mode
            with self.assertRaises(ValueError) as ctx:
                vision_ocr(decode_image(self.image), {"endpoint": self.endpoint, "model": "vision-test", "apiKey": "secret"})
            self.assertNotIn("secret", str(ctx.exception))
        MockVision.mode = "ok"

    def test_bad_input_and_remote_plain_http_rejected(self):
        with self.assertRaises(ValueError):
            decode_image("not an image")
        with self.assertRaises(ValueError):
            vision_ocr(decode_image(self.image), {"endpoint": "http://example.com/v1/chat/completions", "model": "x"})
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.request("/api/convert", {"text": "[135]"})
        self.assertEqual(ctx.exception.code, 400)
        with self.assertRaises(urllib.error.HTTPError):
            self.request("/api/convert", [])


if __name__ == "__main__":
    unittest.main()
