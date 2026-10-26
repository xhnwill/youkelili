import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parse,convert,svg,midi,musicxml,TUNINGS,KEYS} from "../public/core.mjs";

test("all supported tunings and keys preserve the actual sounding pitch",()=>{
  for(const tuning of Object.keys(TUNINGS))for(const key of Object.keys(KEYS)) {
    const score=convert({text:"1, 2, 3, 4, 5, 6, 7, 1 2 3 4 5 6 7 1' #4 b7 0",key,tuning,maxFret:20});
    for(const n of score.notes) {
      if(n.fret!==null)assert.equal(TUNINGS[tuning][n.string]+n.fret,n.midi);
      else if(n.degree)assert.ok(!TUNINGS[tuning].some(p=>n.midi-p>=0&&n.midi-p<=20));
    }
  }
});
test("strict syntax rejects incomplete or unrepresentable music",()=>{
  for(const text of ["","8","歌词 1","[135]","1/3","1*0","- 1","1 | -","1',","0'","1*32.","1/0","1*9999"])assert.throws(()=>parse(text));
});
test("rhythm, octave, accidental, and extension semantics",()=>{
  const notes=parse("1' 2, #4/2. b7/4 0 1 -");
  assert.equal(notes[0].octave,1);assert.equal(notes[1].octave,-1);
  assert.equal(notes[2].duration,.75);assert.equal(notes[2].accidental,1);assert.equal(notes.at(-1).duration,2);
});
test("out-of-range pitches never silently change octave",()=>{
  const high=convert({text:"5,",tuning:"high-g"}),low=convert({text:"5,",tuning:"low-g"});
  assert.equal(high.notes[0].midi,55);assert.deepEqual(high.unplayable,[0]);assert.equal(low.notes[0].fret,0);
  assert.throws(()=>musicxml(high));assert.equal(convert({text:"5,",octaveShift:1}).notes[0].midi,67);
});
test("exports retain short dotted timing and escape user text",()=>{
  const score=convert({text:"1/32. 0/32.",title:'<script>alert("x")</script>'});
  const data=midi(score);
  assert.equal(new DataView(data.buffer).getUint16(12),960);
  assert.ok(Buffer.from(data).includes(Buffer.from([45,128,60,0])));
  assert.ok(Buffer.from(data).subarray(-4).equals(Buffer.from([45,255,47,0])));
  assert.match(musicxml(score),/<duration>45<\/duration>/);assert.match(musicxml(score),/<staff-lines>4<\/staff-lines>/);
  assert.ok(!svg(score).includes("<script>"));assert.ok(!musicxml(score).includes("<script>"));
});
test("browser core matches the existing Python implementation across reference scores",()=>{
  const fixtures=JSON.parse(readFileSync(new URL("./parity-fixtures.json",import.meta.url),"utf8"));
  for(const f of fixtures) {
    const result=convert(f.input);
    assert.deepEqual(result.notes,f.notes);assert.deepEqual(result.unplayable,f.unplayable);
    assert.equal(Buffer.from(midi(result)).toString("base64"),f.midi);
  }
});
test("ties cross barlines while preserving position and producing a single MIDI attack",()=>{
  const score=convert({text:"1 - - 1/2 1/2 ~ | 1 - - -",key:"Gb",maxFret:15});
  const tied=score.notes.slice(-2);
  assert.ok(tied[0].tieStart&&tied[1].tieStop);
  assert.equal(tied[0].string,tied[1].string);assert.equal(tied[0].fret,tied[1].fret);
  assert.deepEqual(score.warnings,[]);
  const data=Buffer.from(midi(score));assert.equal([...data].filter(x=>x===144).length,3);
  assert.match(musicxml(score),/<fifths>-6<\/fifths>/);
  assert.match(musicxml(score),/<tie type="start"\/>/);assert.match(musicxml(score),/<tie type="stop"\/>/);
  assert.match(svg(score),/括号品位为延续音/);
});
test("ties reject different pitches, rests, dangling markers and malformed extensions",()=>{
  for(const text of ["~ 1","1 ~ 2","1 ~ 1'","1 ~ #1","0 ~ 0","1 ~ 0","1 ~","1 ~ ~ 1","1 | ~ 1","1 ~ - 1"])assert.throws(()=>parse(text));
  const chain=convert({text:"1 ~ 1 ~ 1"});
  const data=Buffer.from(midi(chain));assert.equal([...data].filter(x=>x===144).length,1);
  assert.ok(data.includes(Buffer.from([0x96,0x40,128,60,0]))); // 2880 ticks, one three-beat note.
});
