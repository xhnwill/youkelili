/** Stateless BYOK vision relay. No database, persisted credentials or logs. */
import {parse} from "../public/core.mjs";
export const PROMPT="你是简谱图片转录器。只转录图片可见的单旋律简谱，不编曲、不补写音符。输出一个JSON对象，字段text,key,meter,uncertain。text格式：1至7音符，0休止；高八度1'，低八度1,；一条减时线1/2，两条1/4，三条1/8；附点1.或1/2.；延长一拍写空格-；小节线|；升号#4，降号b7；空格分隔音符。只提取一条主旋律；和弦、多声部、连音线、反复、倚音、三连音等无法表示的部分须在uncertain中说明，不能悄悄丢弃。key取C,C#,Db,D,Eb,E,F,F#,G,Ab,A,Bb,B，表示1的音高；未知null。meter取2/4,3/4,4/4,6/8，未知null。uncertain为中文字符串数组。特别核对上下八度点、减时线和附点，不将歌词页码调号当音符。不输出Markdown。";
const LIMIT=18*1024*1024;
class RequestError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const reject=(message,status=400)=>{throw new RequestError(message,status);};
async function boundedText(stream,limit) {
  if(!stream)return "";
  const reader=stream.getReader(),chunks=[];let total=0;
  try {
    while(true) {
      const {value,done}=await reader.read();if(done)break;
      total+=value.length;
      if(total>limit){await reader.cancel();reject("数据过大，请裁剪后重试。",413);}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder().decode(bytes);
}
export function validateEndpoint(value) {
  let url;try{url=new URL(String(value??"").trim());}catch{reject("请填写完整的 HTTPS 视觉接口地址。");}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=="https:"||url.username||url.password||url.hash||url.search)reject("接口须为 HTTPS，不在地址中放密钥、查询参数或片段。");
  if(!host.includes(".")||/^\d+(?:\.\d+){3}$/.test(host)||host.includes(":")||host==="localhost"||
    /\.(local|internal|localhost|test|invalid)$/.test(host))reject("网页版仅转发到公开域名的 HTTPS 接口，不支持本机或内网地址。");
  if(url.port&&url.port!=="443")reject("网页版的接口须使用标准 HTTPS 端口。");
  return url.href;
}
function validateImage(image) {
  if(typeof image!=="string"||!image.startsWith("data:image/png;base64,"))reject("请通过界面选择并裁剪图片。");
  const raw=image.slice(22);
  if(raw.length>16*1024*1024||raw.length<44||raw.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(raw))reject("图片过大或编码无效，请先缩小。");
  const header=atob(raw.slice(0,Math.min(64,raw.length)));
  if(header.slice(0,8)!=="\x89PNG\r\n\x1a\n")reject("图片须为有效的 PNG 数据。");
  const int=i=>header.charCodeAt(i)*16777216+(header.charCodeAt(i+1)<<16)+(header.charCodeAt(i+2)<<8)+header.charCodeAt(i+3);
  const w=int(16),h=int(20);
  if(!w||!h||w*h>24000000)reject("图片像素过多或无效，请先缩小。");
}
function completionBody(model,image) {
  // Match official and vendor-prefixed Kimi K3 IDs, including Coding Plan aliases.
  const kimiK3=/(?:^|[\s/:])(?:kimi[-_ ]?)?k3(?:[.\s_-]|$)/i.test(model);
  return {model,messages:[{role:"user",content:[{type:"text",text:PROMPT},{type:"image_url",image_url:{url:image}}]}],
    response_format:{type:"json_object"},
    ...(kimiK3?{max_completion_tokens:32768,reasoning_effort:"low"}:{max_tokens:6000})};
}
function readTranscription(message) {
  let content=message?.content;
  if(Array.isArray(content))content=content.filter(x=>x?.type==="text"&&typeof x.text==="string").map(x=>x.text).join("");
  if(typeof content!=="string"||!content.trim()) {
    if(message?.reasoning_content)reject("AI 只返回了思考过程，没有最终识谱结果。请确认模型名称，或裁剪一行后重试。",502);
    reject("AI 未返回最终文本。请确认接口使用 Chat Completions 格式，并支持图片输入。",502);
  }
  // Some gateways mix closed thinking tags or explanations into the final content.
  // Never promote reasoning_content to a transcription or repair incomplete JSON.
  content=content.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi,"").trim();
  if(/<think\b/i.test(content))reject("AI 的思考过程尚未结束，没有可导入的最终结果。请裁剪一行后重试。",502);
  let obj;
  try {obj=JSON.parse(content);}catch {
    const candidates=[];let start=-1,depth=0,quoted=false,escaped=false;
    for(let i=0;i<content.length;i++) {
      const char=content[i];
      if(start<0){if(char==="{"){start=i;depth=1;}continue;}
      if(quoted){if(escaped)escaped=false;else if(char==="\\")escaped=true;else if(char==='"')quoted=false;continue;}
      if(char==='"')quoted=true;
      else if(char==="{")depth++;
      else if(char==="}"&&!--depth){
        try {candidates.push(JSON.parse(content.slice(start,i+1)));}catch{}
        start=-1;
      }
    }
    if(candidates.length!==1||start>=0)reject("AI 的最终回复不是完整的识谱 JSON。请裁剪一行后重试，或检查服务商的 JSON 输出支持。",502);
    obj=candidates[0];
  }
  if(!obj||Array.isArray(obj)||typeof obj!=="object"||typeof obj.text!=="string"||!obj.text.trim())
    reject("AI 返回的 JSON 缺少有效的 text 音符字段。请确认使用支持图片理解的模型，或裁剪清晰的一行后重试。",502);
  return obj;
}
export async function recognize(request,fetchImpl=fetch) {
  const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  try {
    const origin=request.headers.get("origin");
    if(origin&&origin!==new URL(request.url).origin)reject("请求来源不被允许。",403);
    if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))reject("请求须为 JSON。",415);
    if(Number(request.headers.get("content-length")||0)>LIMIT)reject("请求过大，请先裁剪图片。",413);
    let data;try{data=JSON.parse(await boundedText(request.body,LIMIT));}catch(e){if(e instanceof RequestError)throw e;reject("请求不是有效的 JSON。");}
    if(!data||typeof data!=="object"||Array.isArray(data))reject("请求须为 JSON 对象。");
    const settings=data.settings??{};
    const endpoint=validateEndpoint(settings.endpoint),model=String(settings.model??"").trim(),key=String(settings.apiKey??"").trim();
    if(!model||model.length>200)reject("请填写服务商提供的视觉模型名称。");
    if(key.length>4096||/[\r\n]/.test(key))reject("API Key 格式无效。");
    validateImage(data.image);
    const payload=completionBody(model,data.image),signal=AbortSignal.timeout(180000);
    const send=()=>fetchImpl(endpoint,{method:"POST",redirect:"manual",signal,
      headers:{"Content-Type":"application/json",...(key?{Authorization:"Bearer "+key}:{})},body:JSON.stringify(payload)});
    let response=await send();let formatFallback=false;
    if(response.status===400||response.status===422) {
      // Retry only an explicit parameter rejection, never a completed generation.
      let error;try{error=JSON.parse(await boundedText(response.body,65536)).error;}catch{}
      const detail=typeof error?.message==="string"?error.message:"";
      if((error?.param==="response_format"||/\bresponse_format\b/i.test(detail))&&
        /not supported|unsupported|not allowed|unrecognized|unknown parameter|不支持|不允许/i.test(detail)) {
        delete payload.response_format;formatFallback=true;response=await send();
      }
    }
    if(!response.ok) {
      await response.body?.cancel();
      if(response.status>=300&&response.status<400)reject("接口发生重定向，已停止以避免把密钥转发到其他地址。",502);
      reject("AI 接口返回 HTTP "+response.status+"，请检查地址、模型、密钥和额度。",502);
    }
    let result;try{result=JSON.parse(await boundedText(response.body,2*1024*1024));}
    catch(e){if(e instanceof RequestError)throw e;reject("AI 接口返回了非 JSON 数据，请检查完整接口地址和服务商状态。",502);}
    const choice=result?.choices?.[0];
    if(choice?.finish_reason==="length")reject("AI 回复达到输出上限，识谱结果被截断，未导入不完整音符。请裁剪为一行或更短的片段后重试。",502);
    if(choice?.finish_reason==="content_filter"||choice?.message?.refusal)reject("AI 服务拒绝了本次图片识别，请检查图片内容或联系服务商。",502);
    const obj=readTranscription(choice?.message);
    try {parse(obj.text);}catch{reject("AI 转录格式需要人工修正：JSON 已解析，但音符记号不符合简谱格式。请裁剪一行后重试，或手动输入校对。",422);}
    const uncertain=Array.isArray(obj.uncertain)?obj.uncertain:obj.uncertain?[String(obj.uncertain)]:[];
    return reply({text:obj.text,key:obj.key??null,meter:obj.meter??null,boxes:[],engine:"vision",
      warnings:["AI 识别为草稿，请对照原图校对音点、减时线和调号。",
        ...(formatFallback?["服务商不支持 JSON 模式，已使用提示词约束并校验最终结果。"]:[]),
        ...uncertain.slice(0,50).map(x=>String(x).slice(0,300))]});
  } catch(error) {
    if(error instanceof RequestError)return reply({error:error.message},error.status);
    if(error?.name==="TimeoutError"||error?.name==="AbortError")return reply({error:"AI 接口请求超时，请稍后重试。"},504);
    if(error?.message?.startsWith("无法识别")||error?.message?.includes("音符")||error?.message?.includes("标记"))return reply({error:"AI 转录格式需要人工修正："+error.message},422);
    return reply({error:"无法完成识谱，请检查模型接口与网络，或分段裁剪后重试。"},502);
  }
}
