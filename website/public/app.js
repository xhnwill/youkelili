import {convert, svg, midi, musicxml, VERSION, BUILD_DATE} from "/core.mjs";
import {initCatalog} from "/catalog.js";
"use strict";
const $ = id => document.getElementById(id);
const state = {token:"", image:null, original:"", crop:null, settings:null, score:null, payload:null,
  busy:false, playing:false, audio:null, timers:[], imageRevision:0};
const demoText = "1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - |\n5 5 4 4 | 3 3 2 - | 5 5 4 4 | 3 3 2 - |\n1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 -";
let toastTimer;
function toast(message) {
  $("toast").textContent = message; $("toast").hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").hidden = true, 6000);
}
function notices(id, messages, error=false) {
  const node=$(id); node.replaceChildren(); node.hidden=!messages.length; node.classList.toggle("error",error);
  for(const text of messages) { const p=document.createElement("p"); p.textContent=text; node.append(p); }
}
async function api(path, body, binary=false) {
  if(path==="/api/convert") { const score=convert(body); score.svg=svg(score); return score; }
  if(path.startsWith("/api/export/")) {
    const score=convert(body),kind=path.split("/").at(-1);
    if(kind==="svg")return new Blob([svg(score)],{type:"image/svg+xml;charset=utf-8"});
    if(kind==="midi")return new Blob([midi(score)],{type:"audio/midi"});
    if(kind==="musicxml")return new Blob([musicxml(score)],{type:"application/vnd.recordare.musicxml+xml"});
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),200000);
  try {
    const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json","X-Session-Token":state.token},
      body:JSON.stringify(body),signal:controller.signal});
    if(!response.ok) {const data=await response.json();throw new Error(data.error||"请求失败");}
    return binary ? response.blob() : response.json();
  } catch(error) {if(error.name==="AbortError")throw new Error("请求超时，请稍后重试。");throw error;}
  finally {clearTimeout(timer);}
}
function payload() {
  return {title:$("titleInput").value,text:$("notesInput").value,key:$("keyInput").value,
    meter:$("meterInput").value,bpm:Number($("bpmInput").value),tuning:$("tuningInput").value,
    octaveShift:Number($("octaveInput").value),maxFret:Number($("fretsInput").value)};
}
function updateExports() {
  const ready=!!state.score&&!state.busy;
  const exportReady=ready&&$("proofInput").checked&&!state.score.unplayable.length;
  for(const id of ["svgBtn","midiBtn","xmlBtn","printBtn"]) $(id).disabled=!exportReady;
  $("playBtn").disabled=!ready;
  if(ready)$("scoreStatus").textContent=state.score.unplayable.length?"有音符超出范围":$("proofInput").checked?"已校对":"待人工校对";
}
function dirty() {
  stopPlayback(); state.score=null;state.payload=null;$("proofInput").checked=false;
  $("scoreStatus").textContent="待重新生成";
  $("scoreOutput").style.opacity=".4";updateExports();
}
async function generate() {
  stopPlayback();
  try {
    const input=payload(), result=await api("/api/convert",input);
    state.score=result;state.payload=input;$("scoreOutput").innerHTML=result.svg;
    $("scoreOutput").style.opacity="1";$("scoreEmpty").hidden=true;
    notices("scoreWarnings",result.warnings,result.unplayable.length>0);
    $("noteSummary").textContent=result.notes.length+" 个音符 / 休止 · 四线从上到下为 A、E、C、G 弦 · 标出的数字为品位 · 时值显示在下方";
    updateExports();
  } catch(error) {
    state.score=null;state.payload=null;updateExports();notices("scoreWarnings",[error.message],true);
  }
}
function drawImage() {
  if(!state.image)return;
  const canvas=$("imageCanvas"), image=state.image;
  canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext("2d");ctx.drawImage(image,0,0);
  if(state.crop) {
    const c=state.crop;
    ctx.fillStyle="#17382a55";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,c.x,c.y,c.w,c.h,c.x,c.y,c.w,c.h);
    ctx.strokeStyle="#397a4d";ctx.lineWidth=Math.max(2,canvas.width/400);
    ctx.strokeRect(c.x,c.y,c.w,c.h);
  }
}
function loadImage(source,name) {
  return new Promise((resolve,reject)=>{
    if(typeof source!=="string"||!/^data:image\/(png|jpeg|webp);base64,/.test(source)||source.length>18*1024*1024) {
      return reject(new Error("图片须为有效的本地 PNG/JPG/WebP 数据，不能引用外部网址。"));
    }
    const image=new Image();
    image.onload=()=>{
      if(image.naturalWidth*image.naturalHeight>24000000)return reject(new Error("图片超过 2400 万像素，请先缩小。"));
      state.image=image;state.original=source;state.crop=null;state.imageRevision++;
      $("imagePanel").hidden=false;$("dropzone").hidden=true;$("imageName").textContent=name;
      $("recognizeBtn").disabled=false;notices("ocrWarnings",[]);drawImage();resolve();
    };
    image.onerror=()=>reject(new Error("无法读取图片。请选择 PNG、JPG 或 WebP。"));
    image.src=source;
  });
}
async function receiveFile(file) {
  if(!file)return;
  if(!["image/png","image/jpeg","image/webp"].includes(file.type))return toast("请上传 PNG、JPG 或 WebP 图片。");
  if(file.size>12*1024*1024)return toast("图片超过 12 MB，请先缩小。");
  const reader=new FileReader();
  reader.onload=()=>loadImage(reader.result,file.name).catch(e=>toast(e.message));
  reader.readAsDataURL(file);
}
function selectedImage() {
  const image=state.image,c=state.crop||{x:0,y:0,w:image.naturalWidth,h:image.naturalHeight};
  const scale=Math.min(1,2400/Math.max(c.w,c.h)), canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(c.w*scale));canvas.height=Math.max(1,Math.round(c.h*scale));
  canvas.getContext("2d").drawImage(image,c.x,c.y,c.w,c.h,0,0,canvas.width,canvas.height);
  return canvas.toDataURL("image/png");
}
let dragStart=null;
function imagePoint(event) {
  const canvas=$("imageCanvas"),rect=canvas.getBoundingClientRect();
  return {x:Math.max(0,Math.min(canvas.width,(event.clientX-rect.left)*canvas.width/rect.width)),
    y:Math.max(0,Math.min(canvas.height,(event.clientY-rect.top)*canvas.height/rect.height))};
}
$("imageCanvas").addEventListener("pointerdown",event=>{
  if(state.busy)return;dragStart=imagePoint(event);$("imageCanvas").setPointerCapture(event.pointerId);
});
$("imageCanvas").addEventListener("pointermove",event=>{
  if(!dragStart)return;const point=imagePoint(event);
  state.crop={x:Math.min(point.x,dragStart.x),y:Math.min(point.y,dragStart.y),
    w:Math.abs(point.x-dragStart.x),h:Math.abs(point.y-dragStart.y)};drawImage();
});
$("imageCanvas").addEventListener("pointerup",()=>{
  if(!dragStart)return;dragStart=null;
  if(!state.crop||state.crop.w<12||state.crop.h<12)state.crop=null;drawImage();
});
$("imageCanvas").addEventListener("pointercancel",()=>{dragStart=null;state.crop=null;drawImage();});
$("resetCrop").onclick=()=>{state.crop=null;drawImage();};
$("replaceImage").onclick=()=>{if(!state.busy)$("imageInput").click();};
$("imageInput").onchange=event=>receiveFile(event.target.files[0]);
for(const id of ["dropzone","imagePanel"]) {
  const element=$(id);
  element.addEventListener("dragover",event=>{event.preventDefault();element.classList.add("drag");});
  element.addEventListener("dragleave",()=>element.classList.remove("drag"));
  element.addEventListener("drop",event=>{
    event.preventDefault();element.classList.remove("drag");if(!state.busy)receiveFile(event.dataTransfer.files[0]);
  });
}
$("imageName").title="可拖入另一张图片替换；也可点击此处重新选择";
$("imageName").style.cursor="pointer";
$("imageName").onclick=()=>{if(!state.busy)$("imageInput").click();};
$("settingsBtn").onclick=()=>$("settingsDialog").showModal();
$("closeSettings").onclick=()=>$("settingsDialog").close();
$("endpointInput").addEventListener("input",()=>$("apiKeyInput").value="");
$("settingsForm").onsubmit=event=>{
  event.preventDefault();
  state.settings={endpoint:$("endpointInput").value.trim(),model:$("modelInput").value.trim(),apiKey:$("apiKeyInput").value.trim()};
  $("settingsDialog").close();toast("接口已配置，仅在当前页面保留。");
};
$("recognizeBtn").onclick=async()=>{
  if(!state.image)return;
  if(!state.settings){$("settingsDialog").showModal();return;}
  state.busy=true;document.body.classList.add("busy");$("recognizeBtn").disabled=true;
  $("recognizeBtn").textContent="正在识谱，思考模型可能需要约 3 分钟…";$("notesInput").disabled=true;$("convertBtn").disabled=true;
  const revision=state.imageRevision;
  try {
    const result=await api("/api/recognize",{image:selectedImage(),settings:state.settings});
    if(revision!==state.imageRevision){toast("图片已更换，识别结果未覆盖当前编辑。");return;}
    dirty();
    $("notesInput").value=$("appendInput").checked&&$("notesInput").value.trim()?$("notesInput").value.trim()+"\n"+result.text:result.text;
    const warnings=[...result.warnings];
    if(result.key&&[...$("keyInput").options].some(x=>x.value===result.key))$("keyInput").value=result.key;
    else warnings.push("未确认调号：请根据原图手动设置 1=。");
    if(result.meter&&[...$("meterInput").options].some(x=>x.value===result.meter))$("meterInput").value=result.meter;
    else warnings.push("未确认拍号：请根据原图手动设置拍号。");
    notices("ocrWarnings",warnings);toast("识别完成，请对照原图校对。");await generate();
  } catch(error) {notices("ocrWarnings",[error.message],true);}
  finally {
    state.busy=false;document.body.classList.remove("busy");$("recognizeBtn").disabled=false;
    $("recognizeBtn").textContent="✦ AI 识别简谱";$("notesInput").disabled=false;$("convertBtn").disabled=false;updateExports();
  }
};
$("convertBtn").onclick=generate;
for(const id of ["titleInput","notesInput","keyInput","meterInput","bpmInput","tuningInput","octaveInput","fretsInput"]) $(id).addEventListener("input",dirty);
$("proofInput").onchange=updateExports;
$("demoBtn").onclick=async()=>{
  if(state.busy)return;
  try {
    const blob=await(await fetch("/demo.png")).blob();
    const reader=new FileReader();
    reader.onload=async()=>{
      await loadImage(reader.result,"示例简谱 · 小星星");
      $("titleInput").value="小星星 · 旋律练习";$("notesInput").value=demoText;
      $("keyInput").value="C";$("meterInput").value="4/4";$("tuningInput").value="high-g";
      $("octaveInput").value="0";$("bpmInput").value="90";$("fretsInput").value="12";$("proofInput").checked=false;
      notices("ocrWarnings",["这是预置示例：载入示例图片与已知音符，未调用 AI；测试实际识谱请配置接口并点击识别。"]);
      await generate();
    };
    reader.readAsDataURL(blob);
  } catch(error){toast(error.message);}
};
function download(blob,name) {
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
for(const [id,type,ext] of [["svgBtn","svg","svg"],["midiBtn","midi","mid"],["xmlBtn","musicxml","musicxml"]]) {
  $(id).onclick=async()=>{
    if(!state.payload)return;
    try {download(await api("/api/export/"+type,state.payload,true),(state.payload.title||"尤克里里谱").replace(/[\\/:*?"<>|]/g,"_")+"."+ext);}
    catch(error){toast(error.message);}
  };
}
$("printBtn").onclick=()=>window.print();
$("saveProject").onclick=()=>{
  const project={format:"JianpuUke",version:1,score:payload(),image:state.original,crop:state.crop};
  download(new Blob([JSON.stringify(project,null,2)],{type:"application/json"}),"我的简谱.jianpuuke.json");
  toast("工程已保存；不包含接口地址、模型和密钥。");
};
$("openProject").onclick=()=>$("projectInput").click();
async function applyProject(project) {
    if(project.format!=="JianpuUke"||project.version!==1||typeof project.score?.text!=="string")throw new Error("不是受支持的简谱小尤工程。");
    const fields={title:"titleInput",text:"notesInput",key:"keyInput",meter:"meterInput",bpm:"bpmInput",tuning:"tuningInput",octaveShift:"octaveInput",maxFret:"fretsInput"};
    for(const [key,id]of Object.entries(fields))if(project.score[key]!==undefined)$(id).value=project.score[key];
    dirty();
    if(project.image) {
      await loadImage(project.image,"工程中的简谱图片");
      const c=project.crop;
      if(c&&[c.x,c.y,c.w,c.h].every(Number.isFinite)&&c.x>=0&&c.y>=0&&c.w>=12&&c.h>=12&&c.x+c.w<=state.image.width&&c.y+c.h<=state.image.height)state.crop=c;
      drawImage();
    } else {
      state.image=null;state.original="";state.crop=null;$("imagePanel").hidden=true;$("dropzone").hidden=false;$("recognizeBtn").disabled=true;
    }
    const warnings=Array.isArray(project.warnings)?project.warnings.slice(0,20).map(x=>String(x).slice(0,500)):[];
    notices("ocrWarnings",["工程已打开，请复核音符。接口信息不从工程导入。",...warnings]);await generate();
}
$("projectInput").onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  if(file.size>18*1024*1024)return toast("工程文件过大。");
  try {
    await applyProject(JSON.parse(await file.text()));
  }catch(error){toast(error.message);}
  event.target.value="";
};
async function loadTonghua() {
  if(state.busy)return;
  state.busy=true;$("tonghuaDemoBtn").disabled=true;
  try {
    const response=await fetch("/examples/tonghua.jianpuuke.json");
    if(!response.ok)throw new Error("示例加载失败，请刷新后重试。");
    stopPlayback();await applyProject(await response.json());
    toast("已载入《童话》完整旋律：65 小节，未调用 AI。");
  }catch(error){toast(error.message);}
  finally{state.busy=false;$("tonghuaDemoBtn").disabled=false;updateExports();}
}
$("tonghuaDemoBtn").onclick=loadTonghua;
function stopPlayback() {
  for(const timer of state.timers)clearTimeout(timer);state.timers=[];
  if(state.audio){state.audio.close().catch(()=>{});state.audio=null;}
  state.playing=false;$("playBtn").textContent="▶ 试听";
  document.querySelectorAll("#scoreOutput g.active").forEach(g=>g.classList.remove("active"));
}
$("playBtn").onclick=async()=>{
  if(state.playing){stopPlayback();return;}
  if(!state.score)return;
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext)return toast("当前浏览器不支持试听，请下载 MIDI 播放。");
  state.audio=new AudioContext();await state.audio.resume();state.playing=true;$("playBtn").textContent="■ 停止";
  const ctx=state.audio, start=ctx.currentTime+.06, seconds=60/state.score.bpm;
  let offset=0;
  for(const [index,note]of state.score.notes.entries()) {
    const duration=note.duration*seconds;
    let soundingDuration=duration,tiedIndex=index;
    while(state.score.notes[tiedIndex].tieStart){tiedIndex++;soundingDuration+=state.score.notes[tiedIndex].duration*seconds;}
    if(note.midi!==null&&!note.tieStop) {
      const oscillator=ctx.createOscillator(), gain=ctx.createGain();
      oscillator.type="triangle";oscillator.frequency.value=440*Math.pow(2,(note.midi-69)/12);
      gain.gain.setValueAtTime(0,start+offset);gain.gain.linearRampToValueAtTime(.20,start+offset+.012);
      gain.gain.exponentialRampToValueAtTime(.001,start+offset+Math.max(.02,soundingDuration*.93));
      oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(start+offset);oscillator.stop(start+offset+soundingDuration);
    }
    state.timers.push(setTimeout(()=>{
      document.querySelectorAll("#scoreOutput g.active").forEach(g=>g.classList.remove("active"));
      document.querySelector('[data-note="'+index+'"]')?.classList.add("active");
    },(offset+.06)*1000));
    offset+=duration;
  }
  state.timers.push(setTimeout(stopPlayback,(offset+.1)*1000));
};
$("quitBtn").onclick=()=>{
  state.settings=null; $("apiKeyInput").value=""; $("modelInput").value=""; $("endpointInput").value="";
  toast("接口信息已清除；谱面仍可继续编辑与导出。");
};
state.token="browser-local";
$("versionText").textContent="简谱小尤网页版 v"+VERSION+" · "+BUILD_DATE;
if(location.hash==="#example=tonghua")loadTonghua();
initCatalog({
  isBusy:()=>state.busy,toast,
  onImport:async({dataUrl,title,sourceUrl,page})=>{
    dirty();await loadImage(dataUrl,title+" · 第 "+page+" 张");
    $("titleInput").value=title;$("notesInput").value="";
    $("scoreOutput").replaceChildren();$("scoreEmpty").hidden=false;
    $("noteSummary").textContent="";
    notices("ocrWarnings",["已从简谱之家导入图片，尚未进行 AI 识别。来源："+sourceUrl]);
  }
});
