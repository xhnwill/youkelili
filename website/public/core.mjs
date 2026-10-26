/** JianpuUke 0.2.0: browser-only music semantics and exports (MIT). */
export const VERSION="0.3.0", BUILD_DATE="2026-10-26";
export const KEYS={C:0,"C#":1,Db:1,D:2,Eb:3,E:4,F:5,"F#":6,G:7,Ab:8,A:9,Bb:10,B:11};
export const TUNINGS={"high-g":[69,64,60,67],"low-g":[69,64,60,55]};
const SCALE=[0,2,4,5,7,9,11];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fail=message=>{throw new Error(message);};
function fraction(value) {
  let n=Math.round(value*64),d=64,a=n,b=d;
  while(b){[a,b]=[b,a%b];}
  n/=a;d/=a;return d===1?String(n):n+"/"+d;
}
function noteToken(note) {
  let suffix="";
  const bases=[[1,""],...[2,4,8,16,32].map(d=>[1/d,"/"+d]),...Array.from({length:31},(_,i)=>[i+2,"*"+(i+2)])];
  let found=false;
  for(const [base,tail]of bases) {
    if(note.duration===base){suffix=tail;found=true;break;}
    if(note.duration===base*1.5){suffix=tail+".";found=true;break;}
  }
  if(!found) {
    const part=note.duration%1,whole=Math.floor(note.duration);
    for(const d of [2,4,8,16,32]) {
      if(part===1/d){suffix="/"+d+" -".repeat(whole);break;}
      if(part===1.5/d){suffix="/"+d+"."+" -".repeat(whole);break;}
    }
  }
  return(note.accidental>0?"#":note.accidental<0?"b":"")+note.degree+
    "'".repeat(Math.max(0,note.octave))+",".repeat(Math.max(0,-note.octave))+suffix;
}
export function parse(input) {
  if(typeof input!=="string"||!input.trim())fail("请先识别图片，或输入简谱。");
  if(input.length>20000)fail("简谱过长，请分段处理（最多 20,000 字符）。");
  const text=input.split(/\r?\n/).map(line=>line.split(";")[0]).join("\n").replace(/｜/g,"|").replace(/’/g,"'").replace(/，/g,",").replace(/[—–]/g,"-");
  const re=/([#b]?)([0-7])([',]*)(?:(\/|\*)([0-9]+))?(\.)?/y;
  const notes=[];let pos=0,bar=0,lastBar=false;
  while(pos<text.length) {
    if(/\s/.test(text[pos])){pos++;continue;}
    if(text[pos]==="|"){if(notes.length&&!lastBar)bar++;lastBar=true;pos++;continue;}
    if(text[pos]==="-") {
      if(!notes.length||lastBar)fail("延音线 - 必须紧跟本小节已有的音符。");
      notes.at(-1).duration++;
      if(notes.at(-1).duration>32)fail("单个音符最多 32 拍。");pos++;continue;
    }
    re.lastIndex=pos;const m=re.exec(text);
    if(!m)fail("无法识别第 "+(pos+1)+" 个字符附近："+text.slice(pos,pos+14)+"。请参照输入说明校对。");
    const [,acc,degree,marks,op,value,dotted]=m;
    if(marks.includes("'")&&marks.includes(","))fail("同一个音不能同时带高音和低音标记。");
    if(marks.length>3)fail("高低音标记最多 3 个。");
    let duration=1;
    if(op) {
      const number=Number(value);
      if(number<1||number>32||(op==="/"&&![1,2,4,8,16,32].includes(number)))fail("时值须为 /2、/4、/8、/16、/32 或 *1 至 *32。");
      duration=op==="/"?1/number:number;
    }
    if(dotted)duration*=1.5;
    if(duration>32)fail("单个音符最多 32 拍。");
    if(degree==="0"&&(acc||marks))fail("休止符 0 不能带升降号或高低音点。");
    if(notes.length>=4096)fail("一次最多处理 4096 个音符。");
    notes.push({degree:Number(degree),octave:[...marks].reduce((n,c)=>n+(c==="'"?1:-1),0),
      accidental:acc==="#"?1:acc==="b"?-1:0,duration,bar,midi:null,string:null,fret:null});
    lastBar=false;pos=re.lastIndex;
  }
  if(!notes.length)fail("没有找到有效音符。");
  return notes;
}
export function convert(payload) {
  const text=payload.text??"",notes=parse(text),key=payload.key??"C",tuning=payload.tuning??"high-g";
  const octaveShift=Number(payload.octaveShift??0),maxFret=Number(payload.maxFret??12),bpm=Number(payload.bpm??90),meter=payload.meter??"4/4";
  if(!Object.hasOwn(KEYS,key)||!Object.hasOwn(TUNINGS,tuning))fail("不支持的调号或定弦。");
  if(!Number.isInteger(maxFret)||maxFret<3||maxFret>20||![-2,-1,0,1,2].includes(octaveShift))fail("品位须在 3–20 之间，移八度须在 -2–2 之间。");
  if(!["2/4","3/4","4/4","6/8"].includes(meter)||!Number.isInteger(bpm)||bpm<30||bpm>240)fail("拍号或速度不在支持范围内。");
  const candidates=[],active=[],unplayable=[],costs=[],parents=[];
  for(const [i,note]of notes.entries()) {
    if(!note.degree)continue;
    note.midi=60+KEYS[key]+SCALE[note.degree-1]+note.accidental+12*(note.octave+octaveShift);
    const positions=TUNINGS[tuning].map((pitch,s)=>[s,note.midi-pitch]).filter(([,f])=>f>=0&&f<=maxFret);
    if(!positions.length)unplayable.push(i);else{candidates.push(positions);active.push(i);}
  }
  const argmin=values=>values.indexOf(Math.min(...values));
  for(const [j,positions]of candidates.entries()) {
    const row=[],back=[];
    for(const [s,f]of positions) {
      const own=f*.14+(f===0?0:.3);
      if(j===0||active[j]!==active[j-1]+1) {
        const k=j?argmin(costs[j-1]):0;row.push(own+(j?costs[j-1][k]:0));back.push(k);
      } else {
        const choices=candidates[j-1].map(([ps,pf],k)=>costs[j-1][k]+(f&&pf?Math.abs(f-pf)*.85:.45)+Math.abs(s-ps)*.4+own);
        const k=argmin(choices);row.push(choices[k]);back.push(k);
      }
    }
    costs.push(row);parents.push(back);
  }
  if(candidates.length) {
    let k=argmin(costs.at(-1));
    for(let j=candidates.length-1;j>=0;j--){[notes[active[j]].string,notes[active[j]].fret]=candidates[j][k];k=parents[j][k];}
  }
  const warnings=unplayable.map(i=>"第 "+(i+1)+" 个音 "+noteToken(notes[i])+" 超出当前定弦／品位范围，请调整移八度或人工改编。");
  const [n,d]=meter.split("/").map(Number),expected=n*4/d;
  if(/[|｜]/.test(text)) {
    const totals=new Map();for(const note of notes)totals.set(note.bar,(totals.get(note.bar)||0)+note.duration);
    for(const [bar,total]of totals)if(total!==expected)warnings.push("第 "+(bar+1)+" 小节为 "+fraction(total)+" 拍，"+meter+" 通常应为 "+fraction(expected)+" 拍（弱起可忽略此提示）。");
  } else {
    let bar=0,total=0;
    for(const note of notes) {
      note.bar=bar;total+=note.duration;
      if(total>=expected) {
        if(total>expected)warnings.push("第 "+(bar+1)+" 小节音符跨过小节线，请手动分小节后校对。");
        bar++;total=0;
      }
    }
  }
  for(const note of notes){note.durationFraction=fraction(note.duration);note.token=noteToken(note);}
  return {title:String(payload.title??"我的尤克里里谱").slice(0,120),key,tuning,octaveShift,maxFret,bpm,meter,notes,warnings,unplayable,text};
}
export function svg(score) {
  const rows=[];let row=[];
  for(const note of score.notes){if(row.length>=14||(row.length>=9&&note.bar!==row.at(-1).bar)){rows.push(row);row=[];}row.push(note);}
  if(row.length)rows.push(row);
  const height=130+rows.length*180,out=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 '+height+'" role="img" aria-label="简谱与尤克里里四线谱">',
    '<rect width="100%" height="100%" fill="white"/>',
    '<style>text{font-family:"Microsoft YaHei",Arial,sans-serif;fill:#24352e}.fret{font-size:21px;font-weight:700;paint-order:stroke;stroke:white;stroke-width:8px;stroke-linejoin:round}.jp{font-size:24px;font-weight:600}.muted{fill:#758478;font-size:12px}.bad{fill:#b23d35}</style>',
    '<text x="560" y="42" text-anchor="middle" font-size="27" font-weight="700">'+escape(score.title)+'</text>',
    '<text x="52" y="77" font-size="14">1='+score.key+' · '+score.meter+' · ♩='+score.bpm+' · '+(score.tuning==="high-g"?"High G":"Low G")+' · 移八度 '+(score.octaveShift>=0?"+":"")+score.octaveShift+'</text>'];
  let index=0;
  for(const [r,items]of rows.entries()) {
    const y=135+r*180,step=Math.min(76,930/items.length),right=110+step*(items.length-.2);
    out.push('<text x="52" y="'+y+'" class="muted">简谱</text>');
    for(const [s,name]of ["A","E","C","G"].entries()) {
      const ly=y+43+s*21;
      out.push('<line x1="90" y1="'+ly+'" x2="'+right+'" y2="'+ly+'" stroke="#86958d" stroke-width="1"/>',
        '<text x="61" y="'+(ly+5)+'" font-size="14">'+name+'</text>');
    }
    let lastBar=null;
    for(const [j,n]of items.entries()) {
      const x=119+j*step;
      if(n.bar!==lastBar) {
        const bx=x-24;
        out.push('<line x1="'+bx+'" x2="'+bx+'" y1="'+(y+35)+'" y2="'+(y+112)+'" stroke="#a4aea8"/>',
          '<text x="'+bx+'" y="'+(y+141)+'" class="muted">'+(n.bar+1)+'</text>');lastBar=n.bar;
      }
      out.push('<g data-note="'+index+'"><text x="'+x+'" y="'+y+'" text-anchor="middle" class="jp">'+(n.accidental>0?"♯":n.accidental<0?"♭":"")+n.degree+'</text>');
      for(let dot=0;dot<Math.abs(n.octave);dot++)out.push('<circle cx="'+x+'" cy="'+(n.octave>0?y-27-dot*7:y+10+dot*7)+'" r="1.8" fill="#24352e"/>');
      if(!n.degree)out.push('<text x="'+x+'" y="'+(y+78)+'" text-anchor="middle" class="muted">休</text>');
      else if(n.fret===null)out.push('<text x="'+x+'" y="'+(y+78)+'" text-anchor="middle" class="fret bad">×</text>');
      else out.push('<text x="'+x+'" y="'+(y+50+n.string*21)+'" text-anchor="middle" class="fret">'+n.fret+'</text>');
      out.push('<text x="'+x+'" y="'+(y+132)+'" text-anchor="middle" class="muted">'+n.durationFraction+'拍</text></g>');index++;
    }
    out.push('<line x1="'+right+'" x2="'+right+'" y1="'+(y+43)+'" y2="'+(y+106)+'" stroke="#68786e"/>');
  }
  out.push('<text x="52" y="'+(height-12)+'" class="muted">简谱小尤 JianpuUke · 数字为品位，0 为空弦；× 表示超出音域。请核对原谱与指法。</text></svg>');
  return out.join("");
}
function variable(n){const a=[n&127];while(n>>7){n>>=7;a.unshift(128|(n&127));}return a;}
const be=(n,size)=>Array.from({length:size},(_,i)=>(n>>>((size-i-1)*8))&255);
export function midi(score) {
  const [n,d]=score.meter.split("/").map(Number),events=[0,255,81,3,...be(Math.floor(60000000/score.bpm),3),0,255,88,4,n,d===4?2:3,24,8,0,192,24];
  let pending=0;
  for(const note of score.notes) {
    const ticks=note.duration*960;
    if(note.midi===null){pending+=ticks;continue;}
    if(note.midi<0||note.midi>127)fail("MIDI 音高须在 0–127 范围内。");
    events.push(...variable(pending),144,note.midi,86,...variable(ticks),128,note.midi,0);pending=0;
  }
  events.push(...variable(pending),255,47,0);
  return new Uint8Array([77,84,104,100,0,0,0,6,0,0,0,1,3,192,77,84,114,107,...be(events.length,4),...events]);
}
export function musicxml(score) {
  if(score.unplayable.length)fail("存在超出音域的音符，请先调整后再导出 MusicXML。");
  const out=['<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>'+escape(score.title)+'</work-title></work><part-list><score-part id="P1"><part-name>Ukulele</part-name></score-part></part-list><part id="P1">'];
  const fifths={C:0,"C#":7,Db:-5,D:2,Eb:-3,E:4,F:-1,"F#":6,G:1,Ab:-4,A:3,Bb:-2,B:5},letters="CDEFGAB",natural={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  const bars=[...new Set(score.notes.map(n=>n.bar))];
  for(const [i,bar]of bars.entries()) {
    out.push('<measure number="'+(bar+1)+'">');
    if(!i) {
      const [n,d]=score.meter.split("/");
      out.push('<attributes><divisions>960</divisions><key><fifths>'+fifths[score.key]+'</fifths></key><time><beats>'+n+'</beats><beat-type>'+d+'</beat-type></time><clef><sign>TAB</sign><line>5</line></clef><staff-details><staff-lines>4</staff-lines>');
      for(const [j,[step,octave]]of [["G",score.tuning==="high-g"?4:3],["C",4],["E",4],["A",4]].entries())out.push('<staff-tuning line="'+(j+1)+'"><tuning-step>'+step+'</tuning-step><tuning-octave>'+octave+'</tuning-octave></staff-tuning>');
      out.push('</staff-details></attributes><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>'+score.bpm+'</per-minute></metronome></direction-type><sound tempo="'+score.bpm+'"/></direction>');
    }
    for(const note of score.notes.filter(n=>n.bar===bar)) {
      out.push("<note>");
      if(note.midi===null)out.push("<rest/>");
      else {
        const step=letters[(letters.indexOf(score.key[0])+note.degree-1)%7],diff=((note.midi-natural[step])%12+12)%12,alter=diff<=6?diff:diff-12,octave=Math.floor((note.midi-natural[step]-alter)/12)-1;
        out.push("<pitch><step>"+step+"</step>"+(alter?"<alter>"+alter+"</alter>":"")+"<octave>"+octave+"</octave></pitch>");
      }
      out.push("<duration>"+note.duration*960+"</duration>");
      if(note.midi!==null)out.push("<notations><technical><string>"+(note.string+1)+"</string><fret>"+note.fret+"</fret></technical></notations>");
      out.push("</note>");
    }
    out.push("</measure>");
  }
  out.push("</part></score-partwise>");return out.join("");
}
