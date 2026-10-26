import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {convert,TUNINGS} from "../public/core.mjs";
const read=name=>JSON.parse(readFileSync(new URL("../public/examples/"+name,import.meta.url),"utf8"));
test("Tonghua preserves every four-beat bar and the user-selected repeat route",()=>{
  const example=read("tonghua.json"),project=read("tonghua.jianpuuke.json"),score=convert(project.score);
  assert.equal(example.sourceBars.length,50);assert.equal(project.sourceBarMap.length,65);
  assert.deepEqual(project.sourceBarMap,Array.from({length:30},(_,i)=>i+1).concat(Array.from({length:15},(_,i)=>i+13),Array.from({length:20},(_,i)=>i+31)));
  const totals=new Map();for(const note of score.notes)totals.set(note.bar,(totals.get(note.bar)||0)+note.duration);
  assert.equal(totals.size,65);assert.ok([...totals.values()].every(x=>x===4));
  assert.deepEqual(score.warnings,[]);assert.deepEqual(score.unplayable,[]);
  assert.equal(score.key,"Gb");assert.equal(score.bpm,78);assert.equal(score.octaveShift,0);
  assert.equal(Math.max(...score.notes.map(n=>n.fret??0)),13);
  for(const note of score.notes)if(note.degree)assert.equal(TUNINGS[score.tuning][note.string]+note.fret,note.midi);
  assert.ok(project.warnings.some(x=>x.includes("第 18 小节")));
});
