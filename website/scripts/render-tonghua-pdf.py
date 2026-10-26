"""Render the JS-generated score JSON as a paginated, traceable four-string TAB PDF.

Requires reportlab. Usage: python render-tonghua-pdf.py score.json output.pdf
Override JIANPU_CJK_FONT with a compatible TrueType font when not on Windows.
"""
import json
import math
import os
import sys
from fractions import Fraction
from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


def render(source, target):
    score = json.loads(Path(source).read_text(encoding="utf-8"))
    font = os.environ.get("JIANPU_CJK_FONT", r"C:\Windows\Fonts\msyh.ttc")
    pdfmetrics.registerFont(TTFont("CJK", font, subfontIndex=0))
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(target), pagesize=A4, pageCompression=1)
    c.setTitle("童话 - 尤克里里四线谱 - 原调展开版")
    c.setAuthor("简谱小尤 / 原作词曲：光良 / 用户上传谱图转录")
    width, height = A4
    margin, left, right = 37, 65, width - 37
    color = HexColor("#243d32")
    gray = HexColor("#6a7b71")
    bars = [[] for _ in score["sourceBarMap"]]
    for note in score["notes"]:
        bars[note["bar"]].append(note)
    rows = [bars[i:i + 3] for i in range(0, len(bars), 3)]
    pages = math.ceil(len(rows) / 5)

    def text(x, y, value, size=9, ink=color, font="CJK", center=False):
        c.setFillColor(ink)
        c.setFont(font, size)
        (c.drawCentredString if center else c.drawString)(x, y, str(value))

    for page in range(pages):
        text(margin, height - 48, "童话", 24)
        text(margin + 73, height - 46, "尤克里里旋律四线谱 / 反复展开版", 12)
        text(margin, height - 72, "1=Gb（降G）  4/4  四分音符=78  High G: G4-C4-E4-A4  原音高 / 最高13品", 9)
        c.setStrokeColor(color)
        c.setLineWidth(1.1)
        c.line(margin, height - 84, right, height - 84)
        text(margin, height - 103, "演奏路线：原谱 1-30 → 13-27 → 31-50，共65小节；约3分20秒（未计末尾自由延长）。", 8.4)
        text(margin, height - 119, "读谱：上至下 A / E / C / G；数字是品位，0为空弦，(数字)持续不重拨；线下数字为拍数。", 8.2)
        for local, group in enumerate(rows[page * 5:page * 5 + 5]):
            y = height - 161 - local * 123
            first = (page * 5 + local) * 3
            weights = [sum(max(19, min(n["duration"] * 20, 48)) for n in bar) + 15 for bar in group]
            unit = (right - left) / sum(weights)
            positions = []
            x = left
            for offset, bar in enumerate(group):
                bar_width = weights[offset] * unit
                label = f"演奏{first + offset + 1} / 原谱{score['sourceBarMap'][first + offset]}"
                text(x + 3, y + 16, label, 7.7)
                slots = [max(19, min(n["duration"] * 20, 48)) * unit for n in bar]
                nx = x + 7 * unit
                for note, slot in zip(bar, slots):
                    positions.append((nx + slot / 2, note))
                    nx += slot
                c.setStrokeColor(gray)
                c.setLineWidth(.6)
                c.line(x, y - 21, x, y - 68)
                x += bar_width
            for string, label in enumerate(["A", "E", "C", "G"]):
                sy = y - 24 - string * 13
                c.setStrokeColor(gray)
                c.setLineWidth(.45)
                c.line(left, sy, right, sy)
                text(left - 18, sy - 3, label, 10, font="Helvetica")
            c.line(right, y - 21, right, y - 68)
            text(margin, y - 2, "简谱", 8, gray)
            text(margin, y - 92, "拍数", 8, gray)
            for i, (nx, note) in enumerate(positions):
                text(nx, y, note["degree"], 12, font="Helvetica-Bold", center=True)
                for dot in range(abs(note["octave"])):
                    c.setFillColor(color)
                    c.circle(nx, y + 14 + dot * 4 if note["octave"] > 0 else y - 6 - dot * 4, .9, fill=1, stroke=0)
                if note["degree"]:
                    value = f"({note['fret']})" if note.get("tieStop") else str(note["fret"])
                    sy = y - 24 - note["string"] * 13
                    length = pdfmetrics.stringWidth(value, "Helvetica-Bold", 10)
                    c.setFillColor(white)
                    c.rect(nx - length / 2 - 1, sy - 4, length + 2, 12, fill=1, stroke=0)
                    text(nx, sy - 3, value, 10, font="Helvetica-Bold", center=True)
                else:
                    text(nx, y - 46, "休", 8, gray, center=True)
                text(nx, y - 92, str(Fraction(note["duration"])), 7, gray, font="Helvetica", center=True)
                if note.get("tieStart"):
                    if i + 1 < len(positions):
                        end = positions[i + 1][0]
                        c.setStrokeColor(color)
                        p = c.beginPath()
                        p.moveTo(nx, y - 11)
                        p.curveTo(nx + (end - nx) / 3, y - 19, nx + (end - nx) * 2 / 3, y - 19, end, y - 11)
                        c.drawPath(p)
                    else:
                        text(nx, y - 15, "延→", 6.4, center=True)
                elif note.get("tieStop") and i == 0:
                    text(nx, y - 15, "←延", 6.4, center=True)
        text(margin, 51, "校对重点：原谱18小节末尾2、1无可见高音点，按图保留中音；结尾延长按基本4拍导出。", 7.5)
        text(margin, 36, "词曲：光良 / 原图：缘分简谱 / 简谱之家445698 / 用户上传谱图转录 / 单旋律，无伴奏和弦", 7, gray)
        text(width / 2, 20, f"简谱小尤 0.4.0  |  {page + 1} / {pages}", 7, gray, center=True)
        c.showPage()
    c.save()
    print(json.dumps({"pages": pages, "bars": len(bars), "output": str(target)}, ensure_ascii=False))


if __name__ == "__main__":
    render(sys.argv[1], sys.argv[2])
