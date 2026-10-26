"""Vector score, Standard MIDI and MusicXML export."""
from fractions import Fraction
from html import escape
import struct
import xml.etree.ElementTree as ET


def svg(score):
    notes = score["notes"]
    rows, row = [], []
    for note in notes:
        if len(row) >= 14 or (len(row) >= 9 and note["bar"] != row[-1]["bar"]):
            rows.append(row)
            row = []
        row.append(note)
    if row:
        rows.append(row)
    width, height = 1120, 130 + len(rows) * 180
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" role="img" aria-label="简谱与尤克里里四线谱">' % (width, height),
           '<rect width="100%" height="100%" fill="white"/>',
           '<style>text{font-family:"Microsoft YaHei",Arial,sans-serif;fill:#24352e}.fret{font-size:21px;font-weight:700;paint-order:stroke;stroke:white;stroke-width:8px;stroke-linejoin:round}.jp{font-size:24px;font-weight:600}.muted{fill:#758478;font-size:12px}.bad{fill:#b23d35}</style>',
           '<text x="560" y="42" text-anchor="middle" font-size="27" font-weight="700">%s</text>' % escape(score["title"]),
           '<text x="52" y="77" font-size="14">1=%s · %s · ♩=%s · %s · 移八度 %+d</text>' % (score["key"], score["meter"], score["bpm"], "High G" if score["tuning"] == "high-g" else "Low G", score["octaveShift"])]
    index = 0
    for r, notes_row in enumerate(rows):
        y = 135 + r * 180
        step = min(76, 930 / max(1, len(notes_row)))
        right = 110 + step * (len(notes_row) - 0.2)
        out.append('<text x="52" y="%s" class="muted">简谱</text>' % y)
        for s, name in enumerate(("A", "E", "C", "G")):
            line_y = y + 43 + s * 21
            out.append('<line x1="90" y1="%s" x2="%s" y2="%s" stroke="#86958d" stroke-width="1"/>' % (line_y, right, line_y))
            out.append('<text x="61" y="%s" font-size="14">%s</text>' % (line_y + 5, name))
        last_bar = None
        for j, n in enumerate(notes_row):
            x = 119 + j * step
            if n["bar"] != last_bar:
                bx = x - 24
                out.append('<line x1="%s" x2="%s" y1="%s" y2="%s" stroke="#a4aea8"/>' % (bx, bx, y + 35, y + 112))
                out.append('<text x="%s" y="%s" class="muted">%d</text>' % (bx, y + 141, n["bar"] + 1))
                last_bar = n["bar"]
            out.append('<g data-note="%d">' % index)
            acc = "♯" if n["accidental"] > 0 else "♭" if n["accidental"] < 0 else ""
            out.append('<text x="%s" y="%s" text-anchor="middle" class="jp">%s%s</text>' % (x, y, acc, n["degree"]))
            for dot in range(abs(n["octave"])):
                dot_y = y - 27 - dot * 7 if n["octave"] > 0 else y + 10 + dot * 7
                out.append('<circle cx="%s" cy="%s" r="1.8" fill="#24352e"/>' % (x, dot_y))
            if n["degree"] == 0:
                out.append('<text x="%s" y="%s" text-anchor="middle" class="muted">休</text>' % (x, y + 78))
            elif n["fret"] is None:
                out.append('<text x="%s" y="%s" text-anchor="middle" class="fret bad">×</text>' % (x, y + 78))
            else:
                out.append('<text x="%s" y="%s" text-anchor="middle" class="fret">%s</text>' % (x, y + 50 + n["string"] * 21, n["fret"]))
            out.append('<text x="%s" y="%s" text-anchor="middle" class="muted">%s拍</text>' % (x, y + 132, escape(n["durationFraction"])))
            out.append('</g>')
            index += 1
        out.append('<line x1="%s" x2="%s" y1="%s" y2="%s" stroke="#68786e"/>' % (right, right, y + 43, y + 106))
    out.append('<text x="52" y="%s" class="muted">简谱小尤 JianpuUke · 数字为品位，0 为空弦；× 表示超出音域。请核对原谱与指法。</text>' % (height - 12))
    out.append('</svg>')
    return "".join(out)


def _varlen(number):
    result = [number & 0x7f]
    while number >> 7:
        number >>= 7
        result.insert(0, 0x80 | (number & 0x7f))
    return bytes(result)


def midi(score):
    tempo = int(60000000 / score["bpm"])
    n, d = map(int, score["meter"].split("/"))
    events = bytearray(b"\x00\xff\x51\x03" + tempo.to_bytes(3, "big"))
    events += b"\x00\xff\x58\x04" + bytes([n, {4: 2, 8: 3}[d], 24, 8])
    events += b"\x00\xc0\x18"
    pending = 0
    for note in score["notes"]:
        ticks = int(Fraction(note["durationFraction"]) * 960)
        if note["midi"] is None:
            pending += ticks
        else:
            pitch = note["midi"]
            if pitch < 0 or pitch > 127:
                raise ValueError("MIDI 音高须在 0–127 范围内。")
            events += _varlen(pending) + bytes([0x90, pitch, 86])
            events += _varlen(ticks) + bytes([0x80, pitch, 0])
            pending = 0
    events += _varlen(pending) + b"\xff\x2f\x00"
    return b"MThd" + struct.pack(">IHHH", 6, 0, 1, 960) + b"MTrk" + struct.pack(">I", len(events)) + events


def musicxml(score):
    if score["unplayable"]:
        raise ValueError("存在超出音域的音符，请先调整后再导出 MusicXML。")
    root = ET.Element("score-partwise", version="4.0")
    ET.SubElement(ET.SubElement(root, "work"), "work-title").text = score["title"]
    part_list = ET.SubElement(root, "part-list")
    score_part = ET.SubElement(part_list, "score-part", id="P1")
    ET.SubElement(score_part, "part-name").text = "Ukulele"
    part = ET.SubElement(root, "part", id="P1")
    bars = sorted(set(note["bar"] for note in score["notes"]))
    for bar in bars:
        measure = ET.SubElement(part, "measure", number=str(bar + 1))
        if bar == bars[0]:
            attributes = ET.SubElement(measure, "attributes")
            ET.SubElement(attributes, "divisions").text = "960"
            key = ET.SubElement(attributes, "key")
            fifths = {"C": 0, "C#": 7, "Db": -5, "D": 2, "Eb": -3, "E": 4, "F": -1,
                      "F#": 6, "G": 1, "Ab": -4, "A": 3, "Bb": -2, "B": 5}
            ET.SubElement(key, "fifths").text = str(fifths[score["key"]])
            time = ET.SubElement(attributes, "time")
            beats, beat_type = score["meter"].split("/")
            ET.SubElement(time, "beats").text = beats
            ET.SubElement(time, "beat-type").text = beat_type
            clef = ET.SubElement(attributes, "clef")
            ET.SubElement(clef, "sign").text = "TAB"
            ET.SubElement(clef, "line").text = "5"
            details = ET.SubElement(attributes, "staff-details")
            ET.SubElement(details, "staff-lines").text = "4"
            tuning_pitches = (("G", 4 if score["tuning"] == "high-g" else 3), ("C", 4), ("E", 4), ("A", 4))
            for line, (step, octave) in enumerate(tuning_pitches, 1):
                tuning = ET.SubElement(details, "staff-tuning", line=str(line))
                ET.SubElement(tuning, "tuning-step").text = step
                ET.SubElement(tuning, "tuning-octave").text = str(octave)
            direction = ET.SubElement(measure, "direction")
            metronome = ET.SubElement(ET.SubElement(direction, "direction-type"), "metronome")
            ET.SubElement(metronome, "beat-unit").text = "quarter"
            ET.SubElement(metronome, "per-minute").text = str(score["bpm"])
            ET.SubElement(direction, "sound", tempo=str(score["bpm"]))
        for data in (x for x in score["notes"] if x["bar"] == bar):
            note = ET.SubElement(measure, "note")
            if data["midi"] is None:
                ET.SubElement(note, "rest")
            else:
                pitch = ET.SubElement(note, "pitch")
                letters = "CDEFGAB"
                root_step = letters.index(score["key"][0])
                step = letters[(root_step + data["degree"] - 1) % 7]
                natural = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[step]
                difference = (data["midi"] - natural) % 12
                alter = difference if difference <= 6 else difference - 12
                ET.SubElement(pitch, "step").text = step
                if alter:
                    ET.SubElement(pitch, "alter").text = str(alter)
                ET.SubElement(pitch, "octave").text = str((data["midi"] - natural - alter) // 12 - 1)
            ET.SubElement(note, "duration").text = str(int(Fraction(data["durationFraction"]) * 960))
            if data["midi"] is not None:
                technical = ET.SubElement(ET.SubElement(note, "notations"), "technical")
                ET.SubElement(technical, "string").text = str(data["string"] + 1)
                ET.SubElement(technical, "fret").text = str(data["fret"])
    return b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="utf-8")
