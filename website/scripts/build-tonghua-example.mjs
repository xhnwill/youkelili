/** Rebuild user-requested, manually transcribed score exports without an AI call. */
import {readFileSync,writeFileSync} from "node:fs";
import {convert,svg,midi,musicxml} from "../public/core.mjs";
const folder=new URL("../public/examples/",import.meta.url);
const example=JSON.parse(readFileSync(new URL("tonghua.json",folder),"utf8"));
const sourceBarMap=example.route.flatMap(([first,last])=>Array.from({length:last-first+1},(_,i)=>first+i));
const text=sourceBarMap.map((n,i)=>`; 演奏 ${i+1} / 原谱 ${n}\n${example.sourceBars[n-1]} |`).join("\n");
const input={...example,text};
const score=convert(input);
if(score.unplayable.length||score.warnings.length)throw new Error(JSON.stringify(score.warnings));
if(example.sourceBars.length!==50||sourceBarMap.length!==65)throw new Error("Unexpected source/performance bar count");
const project={format:"JianpuUke",version:1,score:input,
  sourceBarMap,sourceUrl:example.sourceUrl,warnings:example.warnings,
  image:"data:image/png;base64,"+readFileSync(new URL("tonghua-source.png",folder)).toString("base64"),crop:null};
writeFileSync(new URL("tonghua.jianpuuke.json",folder),JSON.stringify(project,null,2)+"\n");
writeFileSync(new URL("tonghua.svg",folder),svg(score));
writeFileSync(new URL("tonghua.mid",folder),midi(score));
writeFileSync(new URL("tonghua.musicxml",folder),musicxml(score));
// Intermediate data for the paginated PDF; avoid maintaining a second music engine.
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify({...score,sourceBarMap,warnings:example.warnings},null,2));
console.log(JSON.stringify({bars:sourceBarMap.length,notes:score.notes.length,beats:score.notes.reduce((n,x)=>n+x.duration,0),
  minMidi:Math.min(...score.notes.filter(n=>n.degree).map(n=>n.midi)),maxMidi:Math.max(...score.notes.filter(n=>n.degree).map(n=>n.midi)),
  highestFret:Math.max(...score.notes.map(n=>n.fret??0)),ties:score.notes.filter(n=>n.tieStart).length}));
