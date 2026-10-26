"""Strict monophonic jianpu parser and global fingering optimizer (no I/O)."""
from dataclasses import dataclass
from fractions import Fraction
import re

KEYS = {"C": 0, "C#": 1, "Db": 1, "D": 2, "Eb": 3, "E": 4,
        "F": 5, "F#": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}
SCALE = (0, 2, 4, 5, 7, 9, 11)
TUNINGS = {"high-g": (69, 64, 60, 67), "low-g": (69, 64, 60, 55)}  # A E C G, top to bottom
TOKEN = re.compile(r"([#b]?)([0-7])([',]*)(?:(/|\*)([0-9]+))?(\.)?")


@dataclass
class Note:
    degree: int
    octave: int = 0
    accidental: int = 0
    duration: Fraction = Fraction(1)
    bar: int = 0
    midi: int = None
    string: int = None
    fret: int = None

    def token(self):
        accidental = "#" if self.accidental > 0 else "b" if self.accidental < 0 else ""
        octave = "'" * max(0, self.octave) + "," * max(0, -self.octave)
        duration = ""
        for base, suffix in [(Fraction(1), "")] + [(Fraction(1, d), "/" + str(d)) for d in (2, 4, 8, 16, 32)] + [(Fraction(n), "*" + str(n)) for n in range(2, 33)]:
            if self.duration == base:
                duration = suffix
                break
            if self.duration == base * Fraction(3, 2):
                duration = suffix + "."
                break
        else:
            # Extension dashes after a fractional note retain an exactly editable spelling.
            base = self.duration % 1
            count = int(self.duration)
            if base:
                for d in (2, 4, 8, 16, 32):
                    if base == Fraction(1, d):
                        duration = "/" + str(d) + " -" * count
                        break
                    if base == Fraction(3, 2*d):
                        duration = "/" + str(d) + "." + " -" * count
                        break
        return accidental + str(self.degree) + octave + duration

    def as_dict(self):
        return {"degree": self.degree, "octave": self.octave, "accidental": self.accidental,
                "duration": float(self.duration), "durationFraction": str(self.duration),
                "bar": self.bar, "midi": self.midi, "string": self.string, "fret": self.fret,
                "token": self.token()}


def parse(text):
    if not isinstance(text, str) or not text.strip():
        raise ValueError("请先识别图片，或输入简谱。")
    if len(text) > 20000:
        raise ValueError("简谱过长，请分段处理（最多 20,000 字符）。")
    text = "\n".join(line.split(";")[0] for line in text.splitlines())
    text = text.replace("｜", "|").replace("’", "'").replace("，", ",").replace("—", "-").replace("–", "-")
    notes, pos, bar, last_bar = [], 0, 0, False
    while pos < len(text):
        if text[pos].isspace():
            pos += 1
            continue
        char = text[pos]
        if char == "|":
            if notes and not last_bar:
                bar += 1
            last_bar = True
            pos += 1
            continue
        if char == "-":
            if not notes or last_bar:
                raise ValueError("延音线 - 必须紧跟本小节已有的音符。")
            notes[-1].duration += 1
            if notes[-1].duration > 32:
                raise ValueError("单个音符最多 32 拍。")
            pos += 1
            continue
        match = TOKEN.match(text, pos)
        if not match:
            raise ValueError("无法识别第 %d 个字符附近：%s。请参照输入说明校对。" % (pos + 1, text[pos:pos + 14]))
        acc, degree, marks, op, value, dotted = match.groups()
        if "'" in marks and "," in marks:
            raise ValueError("同一个音不能同时带高音和低音标记。")
        if len(marks) > 3:
            raise ValueError("高低音标记最多 3 个。")
        duration = Fraction(1)
        if op:
            number = int(value)
            if number < 1 or number > 32 or (op == "/" and number not in (1, 2, 4, 8, 16, 32)):
                raise ValueError("时值须为 /2、/4、/8、/16、/32 或 *1 至 *32。")
            duration = Fraction(1, number) if op == "/" else Fraction(number)
        if dotted:
            duration *= Fraction(3, 2)
        if duration > 32:
            raise ValueError("单个音符最多 32 拍。")
        if degree == "0" and (acc or marks):
            raise ValueError("休止符 0 不能带升降号或高低音点。")
        if len(notes) >= 4096:
            raise ValueError("一次最多处理 4096 个音符。")
        notes.append(Note(int(degree), marks.count("'") - marks.count(","),
                          1 if acc == "#" else -1 if acc == "b" else 0, duration, bar))
        last_bar, pos = False, match.end()
    if not notes:
        raise ValueError("没有找到有效音符。")
    return notes


def fingering(notes, tuning="high-g", key="C", octave_shift=0, max_fret=12):
    if key not in KEYS or tuning not in TUNINGS:
        raise ValueError("不支持的调号或定弦。")
    if max_fret < 3 or max_fret > 20 or octave_shift not in (-2, -1, 0, 1, 2):
        raise ValueError("品位须在 3–20 之间，移八度须在 -2–2 之间。")
    opens = TUNINGS[tuning]
    candidates, active, invalid = [], [], []
    for i, note in enumerate(notes):
        if note.degree == 0:
            continue
        note.midi = 60 + KEYS[key] + SCALE[note.degree - 1] + note.accidental + 12 * (note.octave + octave_shift)
        positions = [(s, note.midi - pitch) for s, pitch in enumerate(opens) if 0 <= note.midi - pitch <= max_fret]
        if not positions:
            invalid.append(i)
        else:
            candidates.append(positions)
            active.append(i)
    # Dynamic programming: prefer low positions and small hand movements across the phrase.
    costs, parents = [], []
    for j, positions in enumerate(candidates):
        row, back = [], []
        for s, f in positions:
            own = f * 0.14 + (0.0 if f == 0 else 0.3)
            if j == 0 or active[j] != active[j - 1] + 1:
                # Phrase reset after a rest or an unplayable note; don't discard prior path cost.
                k = min(range(len(costs[-1])), key=costs[-1].__getitem__) if j else 0
                row.append(own + (costs[-1][k] if j else 0))
                back.append(k)
            else:
                choices = []
                for k, (ps, pf) in enumerate(candidates[j - 1]):
                    move = abs(f - pf) * 0.85 if f and pf else 0.45
                    choices.append(costs[-1][k] + move + abs(s - ps) * 0.4 + own)
                k = min(range(len(choices)), key=choices.__getitem__)
                row.append(choices[k])
                back.append(k)
        costs.append(row)
        parents.append(back)
    if candidates:
        chosen = min(range(len(costs[-1])), key=costs[-1].__getitem__)
        for j in range(len(candidates) - 1, -1, -1):
            note = notes[active[j]]
            note.string, note.fret = candidates[j][chosen]
            chosen = parents[j][chosen]
    return invalid


def convert(payload):
    text = payload.get("text", "")
    notes = parse(text)
    key, tuning = payload.get("key", "C"), payload.get("tuning", "high-g")
    shift, frets, bpm = int(payload.get("octaveShift", 0)), int(payload.get("maxFret", 12)), int(payload.get("bpm", 90))
    meter = payload.get("meter", "4/4")
    if meter not in ("2/4", "3/4", "4/4", "6/8") or bpm < 30 or bpm > 240:
        raise ValueError("拍号或速度不在支持范围内。")
    invalid = fingering(notes, tuning, key, shift, frets)
    warnings = []
    for index in invalid:
        warnings.append("第 %d 个音 %s 超出当前定弦／品位范围，请调整移八度或人工改编。" % (index + 1, notes[index].token()))
    # Explicit barlines are validated; unbarred text is laid out into bars automatically.
    n, d = map(int, meter.split("/"))
    expected = Fraction(n * 4, d)
    explicit = "|" in text or "｜" in text
    if explicit:
        for bar in sorted(set(note.bar for note in notes)):
            total = sum((x.duration for x in notes if x.bar == bar), Fraction())
            if total != expected:
                warnings.append("第 %d 小节为 %s 拍，%s 通常应为 %s 拍（弱起可忽略此提示）。" % (bar + 1, total, meter, expected))
    else:
        bar, total = 0, Fraction()
        for note in notes:
            note.bar = bar
            total += note.duration
            if total >= expected:
                if total > expected:
                    warnings.append("第 %d 小节音符跨过小节线，请手动分小节后校对。" % (bar + 1))
                bar, total = bar + 1, Fraction()
    return {"title": str(payload.get("title", "我的尤克里里谱"))[:120], "key": key,
            "tuning": tuning, "octaveShift": shift, "maxFret": frets, "bpm": bpm,
            "meter": meter, "notes": [note.as_dict() for note in notes],
            "warnings": warnings, "unplayable": invalid, "text": text}
