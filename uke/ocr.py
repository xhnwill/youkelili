"""Jianpu transcription through a user-configured vision endpoint."""
import base64
from io import BytesIO
import json
import re
import socket
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        # An API key must never follow an unexpected redirect to another service.
        return None

PROMPT = """你是简谱图片转录器。只转录图片可见的单旋律简谱，不编曲、不补写音符。
输出一个 JSON 对象，字段 text, key, meter, uncertain。
text使用以下严格格式：1至7为音符，0为休止；高八度写1'，低八度写1,；
一条减时线写1/2，两条写1/4，三条写1/8；附点写1.或1/2.；
延长一拍写空格-；小节线写|；升号写#4，降号写b7；空格分隔音符。
只提取一条主旋律，多声部、和弦、连音线、反复、倚音、三连音等无法表示的部分须在uncertain中说明，不能悄悄丢弃。
key取C,C#,Db,D,Eb,E,F,F#,G,Ab,A,Bb,B之一，表示1的音高；未知填null。
meter取2/4,3/4,4/4,6/8之一，未知填null。uncertain为需要人工校对的中文字符串数组。
请特别核对数字上下的八度点、减时线和附点，不将歌词、页码、调号当作音符。不输出Markdown。"""


def decode_image(data_url):
    if not isinstance(data_url, str) or not data_url.startswith("data:image/"):
        raise ValueError("请上传 PNG、JPEG 或 WebP 图片。")
    try:
        raw = base64.b64decode(data_url.split(",", 1)[1], validate=True)
    except Exception:
        raise ValueError("图片编码无效。")
    if len(raw) > 12 * 1024 * 1024:
        raise ValueError("图片最多 12 MB，请先裁剪或缩小。")
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = 24000000
    try:
        with Image.open(BytesIO(raw)) as source:
            if source.width * source.height > 24000000:
                raise ValueError("图片像素过多，请先缩小。")
            image = ImageOps.exif_transpose(source).convert("RGB")
    except Exception as exc:
        raise ValueError("无法读取图片，请使用有效的 PNG/JPEG/WebP 图片。") from exc
    if min(image.size) < 12:
        raise ValueError("选区太小，请重新裁剪。")
    return image


def vision_ocr(image, settings):
    endpoint = str(settings.get("endpoint", "")).strip()
    parsed = urllib.parse.urlparse(endpoint)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("请填写有效的视觉接口地址，不要在地址内放密钥。")
    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise ValueError("远端接口须使用 HTTPS；本机模型可使用 HTTP。")
    model = str(settings.get("model", "")).strip()
    if not model:
        raise ValueError("请填写支持图片的模型名称。")
    buf = BytesIO()
    image.thumbnail((2400, 2400))
    image.save(buf, format="PNG")
    data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    body = {"model": model, "messages": [{"role": "user", "content": [
        {"type": "text", "text": PROMPT},
        {"type": "image_url", "image_url": {"url": data_url}}]}], "max_tokens": 6000}
    headers = {"Content-Type": "application/json"}
    if settings.get("apiKey"):
        headers["Authorization"] = "Bearer " + str(settings["apiKey"])
    request = urllib.request.Request(endpoint, json.dumps(body).encode(), headers, method="POST")
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=90) as response:
            raw = response.read(2 * 1024 * 1024)
        data = json.loads(raw)
        content = data["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            raise ValueError("接口须返回文本 JSON。")
        content = content.strip()
        if content.startswith(chr(96) * 3):
            content = content.split("\n", 1)[1].rsplit(chr(96) * 3, 1)[0]
        obj = json.loads(content)
    except urllib.error.HTTPError as exc:
        code = exc.code
        exc.close()
        raise ValueError("视觉接口返回 HTTP %d，请检查地址、模型、密钥和额度。" % code) from None
    except (urllib.error.URLError, TimeoutError, socket.timeout):
        raise ValueError("无法连接视觉接口或请求超时，请检查网络和接口地址。") from None
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        raise ValueError("视觉接口未返回约定的 JSON，请换用支持图片与 JSON 输出的模型。") from None
    from .music import parse
    if not isinstance(obj, dict):
        raise ValueError("视觉接口必须返回 JSON 对象。")
    parse(obj.get("text", ""))
    uncertain = obj.get("uncertain", [])
    if not isinstance(uncertain, list):
        uncertain = [str(uncertain)]
    return {"text": obj["text"], "key": obj.get("key"), "meter": obj.get("meter"),
            "warnings": ["AI 识别为草稿，请对照原图校对音点、减时线和调号。"] + [str(x)[:300] for x in uncertain[:50]],
            "boxes": [], "engine": "vision"}
