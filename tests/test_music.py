import unittest
from fractions import Fraction
import struct
import xml.etree.ElementTree as ET
from uke.music import parse, convert, KEYS, TUNINGS
from uke.export import svg, midi, musicxml


class MusicTests(unittest.TestCase):
    def test_rhythm_and_octaves(self):
        notes = parse("1' 2, #4/2. b7/4 0 1 -")
        self.assertEqual([n.octave for n in notes[:2]], [1, -1])
        self.assertEqual(notes[2].duration, Fraction(3, 4))
        self.assertEqual(notes[-1].duration, 2)
        self.assertEqual(notes[2].accidental, 1)
        for note in notes:
            self.assertEqual(parse(note.token())[0].duration, note.duration)

    def test_invalid_syntax_is_never_silently_ignored(self):
        for text in ("", "8", "歌词 1", "[135]", "1/3", "1*0", "- 1", "1 | -",
                     "1',", "0'", "1*32.", "1/0", "1*9999"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse(text)

    def test_exact_positions_all_keys_and_tunings(self):
        for tuning in TUNINGS:
            for key in KEYS:
                score = convert({"text": "1, 2, 3, 4, 5, 6, 7, 1 2 3 4 5 6 7 1' #4 b7 0",
                                 "tuning": tuning, "key": key, "maxFret": 20})
                for n in score["notes"]:
                    if n["fret"] is not None:
                        self.assertEqual(TUNINGS[tuning][n["string"]] + n["fret"], n["midi"])
                    elif n["degree"]:
                        self.assertFalse(any(0 <= n["midi"] - pitch <= 20 for pitch in TUNINGS[tuning]))

    def test_no_silent_octave_change(self):
        high = convert({"text": "5,", "tuning": "high-g"})
        low = convert({"text": "5,", "tuning": "low-g"})
        self.assertEqual(high["notes"][0]["midi"], 55)
        self.assertEqual(high["unplayable"], [0])
        self.assertEqual(low["notes"][0]["fret"], 0)
        shifted = convert({"text": "5,", "octaveShift": 1})
        self.assertEqual(shifted["notes"][0]["midi"], 67)
        with self.assertRaises(ValueError):
            musicxml(high)

    def test_svg_is_safe_xml_and_four_lines(self):
        score = convert({"text": "1 2 3 4", "title": '<script>alert("x")</script>'})
        output = svg(score)
        root = ET.fromstring(output)
        self.assertNotIn("<script>", output)
        ns = {"s": "http://www.w3.org/2000/svg"}
        self.assertEqual(len(root.findall(".//s:g", ns)), 4)
        self.assertEqual(sum(1 for line in root.findall(".//s:line", ns) if line.attrib.get("x1") == "90"), 4)

    def test_musicxml_spelling_and_tab_preserve_pitch(self):
        for key in KEYS:
            score = convert({"text": "1 2 3 #4 b7 7", "key": key, "maxFret": 20})
            root = ET.fromstring(musicxml(score))
            self.assertEqual(root.findtext(".//staff-lines"), "4")
            self.assertEqual(len(root.findall(".//staff-tuning")), 4)
            pitch_class = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
            for xml, n in zip(root.findall(".//note"), score["notes"]):
                self.assertEqual(int(xml.findtext(".//string")), n["string"] + 1)
                pitch = xml.find("pitch")
                reconstructed = ((int(pitch.findtext("octave"))+1)*12 +
                                 pitch_class[pitch.findtext("step")] + int(pitch.findtext("alter", "0")))
                self.assertEqual(reconstructed, n["midi"])

    def test_short_dotted_duration_is_exact_in_exports(self):
        score = convert({"text": "1/32. 0/32."})
        root = ET.fromstring(musicxml(score))
        self.assertEqual(root.findtext(".//divisions"), "960")
        self.assertEqual([n.findtext("duration") for n in root.findall(".//note")], ["45", "45"])
        data = midi(score)
        self.assertEqual(data[:4], b"MThd")
        self.assertEqual(struct.unpack(">H", data[12:14])[0], 960)
        self.assertIn(b"\x2d\x80\x3c\x00", data)
        self.assertTrue(data.endswith(b"\x2d\xff\x2f\x00"))

    def test_bar_validation_and_comments(self):
        score = convert({"text": "1 2 | 3 4 ; example\n", "meter": "2/4"})
        self.assertEqual(score["warnings"], [])
        self.assertEqual([n["bar"] for n in score["notes"]], [0, 0, 1, 1])
        self.assertTrue(convert({"text": "1 | 2"})["warnings"])
        self.assertEqual([n["bar"] for n in convert({"text": "1 2 3 4 5"})["notes"]], [0, 0, 0, 0, 1])


if __name__ == "__main__":
    unittest.main()
