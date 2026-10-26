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
    const response=await fetchImpl(endpoint,{method:"POST",redirect:"manual",signal:AbortSignal.timeout(90000),
      headers:{"Content-Type":"application/json",...(key?{Authorization:"Bearer "+key}:{})},
      body:JSON.stringify({model,messages:[{role:"user",content:[{type:"text",text:PROMPT},{type:"image_url",image_url:{url:data.image}}]}],max_tokens:6000})});
    if(!response.ok) {
      await response.body?.cancel();
      if(response.status>=300&&response.status<400)reject("接口发生重定向，已停止以避免把密钥转发到其他地址。",502);
      reject("AI 接口返回 HTTP "+response.status+"，请检查地址、模型、密钥和额度。",502);
    }
    let obj;
    try {
      const result=JSON.parse(await boundedText(response.body,2*1024*1024));
      let content=result.choices?.[0]?.message?.content;
      if(typeof content!=="string")throw new Error();
      content=content.trim();
      if(content.startsWith(String.fromCharCode(96).repeat(3)))content=content.slice(content.indexOf("\n")+1,content.lastIndexOf(String.fromCharCode(96).repeat(3)));
      obj=JSON.parse(content);
    } catch(e){if(e instanceof RequestError)throw e;reject("AI 未返回约定的 JSON，请换用支持图片与 JSON 输出的模型。",502);}
    if(!obj||Array.isArray(obj)||typeof obj!=="object")reject("AI 必须返回 JSON 对象。",502);
    parse(obj.text);
    const uncertain=Array.isArray(obj.uncertain)?obj.uncertain:obj.uncertain?[String(obj.uncertain)]:[];
    return reply({text:obj.text,key:obj.key??null,meter:obj.meter??null,boxes:[],engine:"vision",
      warnings:["AI 识别为草稿，请对照原图校对音点、减时线和调号。",...uncertain.slice(0,50).map(x=>String(x).slice(0,300))]});
  } catch(error) {
    if(error instanceof RequestError)return reply({error:error.message},error.status);
    if(error?.name==="TimeoutError"||error?.name==="AbortError")return reply({error:"AI 接口请求超时，请稍后重试。"},504);
    if(error?.message?.startsWith("无法识别")||error?.message?.includes("音符")||error?.message?.includes("标记"))return reply({error:"AI 转录格式需要人工修正："+error.message},422);
    return reply({error:"无法完成识谱，请检查模型接口与网络，或分段裁剪后重试。"},502);
  }
}
