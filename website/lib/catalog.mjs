/** Public Jianpujia catalog adapter. Only known source pages and images are fetched. */
export const SOURCE="https://www.jianpujia.com";
const IMAGE_HOSTS=new Set(["image.jianpujia.com","www.jianpujia.com","jianpujia.com"]);
const ARTICLE=/^\/(?:jianpu|jitapu|gangqinpu|youkelili|youkelilipu)\/[1-9]\d{0,8}\.html$/;
const cache=new Map();
export class CatalogError extends Error {constructor(message,status=502){super(message);this.status=status;}}
function fail(message,status=400){throw new CatalogError(message,status);}
export function text(html) {
  return String(html).replace(/<[^>]*>/g,"").replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,entity)=>{
    const value=entity.toLowerCase();
    if(value[0]==="#") {
      const n=value[1]==="x"?parseInt(value.slice(2),16):parseInt(value.slice(1),10);
      return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):"";
    }
    return {amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "}[value];
  }).replace(/\s+/g," ").trim();
}
function attrs(tag) {
  const out={};
  for(const m of tag.matchAll(/([a-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi))out[m[1].toLowerCase()]=text(m[2]??m[3]??m[4]);
  return out;
}
function scope(html,className) {
  const tags=/<(?:div|article)\b[^>]*>/gi;let m;
  while((m=tags.exec(html)))if((attrs(m[0]).class||"").split(/\s+/).includes(className))return html.slice(tags.lastIndex);
  return "";
}
export function articlePath(value) {
  let url;try{url=new URL(String(value),SOURCE);}catch{fail("乐谱地址无效。");}
  if(url.origin!==SOURCE||url.search||url.hash||!ARTICLE.test(url.pathname))fail("仅支持简谱之家公开的乐谱详情页。");
  return url.pathname;
}
function number(value,label,max=10000) {
  if(!/^\d+$/.test(String(value))||Number(value)>max)fail(label+"无效。");
  return Number(value);
}
export function parseListing(html,{page=0,mode="list",query="",searchId=null}={}) {
  const list=scope(html,"list").split("</ul>")[0];
  if(!list)fail("来源站页面暂不可用或格式已变化，请稍后重试或打开原站。",502);
  const items=[],seen=new Set();
  for(const m of list.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const a=attrs(m[1]);let path;
    try{path=articlePath(a.href);}catch{continue;}
    const title=text(a.title||m[2]);if(!title||seen.has(path))continue;
    seen.add(path);items.push({title,path,url:SOURCE+path,kind:path.startsWith("/jianpu/")?"简谱":path.startsWith("/jitapu/")?"吉他谱":path.startsWith("/gangqinpu/")?"钢琴谱":"尤克里里谱"});
  }
  const pagination=scope(html,"pagebar").split("</div>")[0];let maxPage=page,hasNext=false;
  for(const m of pagination.matchAll(/<a\b([^>]*)>/gi)) {
    const href=attrs(m[1]).href||"";let index;
    if(mode==="list")index=href.match(/^\/list\/2702-(\d+)\.html$/)?.[1];
    else {
      try{const u=new URL(href,SOURCE);if(u.origin===SOURCE&&u.pathname.startsWith("/e/search/result/")&&u.searchParams.get("searchid")===String(searchId))index=u.searchParams.get("page");}catch{}
    }
    if(index!==undefined&&index!==null&&/^\d+$/.test(index)){maxPage=Math.max(maxPage,Number(index));if(Number(index)>page)hasNext=true;}
  }
  return {source:"简谱之家",sourceUrl:mode==="list"?SOURCE+"/list/2702-"+page+".html":SOURCE+"/e/search/result/index.php?page="+page+"&searchid="+searchId,
    mode,query,page,totalPages:maxPage+1,hasNext,searchId,items:items.slice(0,150)};
}
export function parseDetail(html,path) {
  path=articlePath(path);
  const title=text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||"乐谱").replace(/-高清曲谱-简谱之家$/,"");
  const content=scope(html,"article_content").split(/<div\b[^>]*class=["'](?:pagebar|rights)/i)[0];
  if(!content)fail("未找到乐谱正文，请在原站查看。",502);
  const images=[],seen=new Set();
  for(const m of content.matchAll(/<img\b[^>]*>/gi)) {
    const a=attrs(m[0]),src=a["data-src"]||a.src;let u;
    try{u=new URL(src,SOURCE);}catch{continue;}
    if(u.protocol==="http:")u.protocol="https:";
    if(u.protocol!=="https:"||u.username||u.password||u.port||!IMAGE_HOSTS.has(u.hostname)||!/\.(?:gif|png|jpe?g|webp)$/i.test(u.pathname)||seen.has(u.href))continue;
    seen.add(u.href);images.push({url:u.href,alt:a.alt||title});
  }
  if(!images.length)fail("这篇乐谱未提供可导入的图片，请打开原站查看。",404);
  return {title,path,url:SOURCE+path,source:"简谱之家",images:images.slice(0,32)};
}
async function readBytes(response,limit) {
  if(!response.body)return new Uint8Array();
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;
    if(length>limit){await reader.cancel();fail("来源文件过大，请在原站查看后手动上传。",413);}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let i=0;for(const chunk of chunks){bytes.set(chunk,i);i+=chunk.length;}return bytes;
}
function sourcePage(url) {
  const u=new URL(url,SOURCE);
  if(u.origin!==SOURCE||!(u.pathname==="/e/search/index.php"||u.pathname.startsWith("/e/search/result/")||/^\/list\/2702-\d+\.html$/.test(u.pathname)||ARTICLE.test(u.pathname)))fail("来源站返回了不支持的地址。",502);
  return u.href;
}
async function htmlRequest(url,{fetchImpl=fetch,method="GET",body}={}) {
  url=sourcePage(url);
  for(let redirects=0;redirects<4;redirects++) {
    const response=await fetchImpl(url,{method,body,redirect:"manual",signal:AbortSignal.timeout(15000),
      headers:{"Accept":"text/html","User-Agent":"Mozilla/5.0 (compatible; JianpuUke/0.3; +https://youkelili.xiao-dev.top/)",...(body?{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"}:{})}});
    if([301,302,303,307,308].includes(response.status)) {
      const location=response.headers.get("location");await response.body?.cancel();
      if(!location)fail("来源站重定向缺少地址。",502);
      url=sourcePage(new URL(location,url).href);
      if([301,302,303].includes(response.status)){method="GET";body=undefined;}continue;
    }
    if(!response.ok){await response.body?.cancel();fail("来源站暂时无法访问（HTTP "+response.status+"），请稍后重试。",502);}
    return {html:new TextDecoder("utf-8").decode(await readBytes(response,2*1024*1024)),url};
  }
  fail("来源站重定向次数过多。",502);
}
async function cached(key,fetchImpl,produce) {
  const prior=cache.get(key);
  if(fetchImpl===fetch&&prior&&prior.expires>Date.now())return prior.value;
  const value=await produce();
  if(fetchImpl===fetch){if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,{value,expires:Date.now()+300000});}
  return value;
}
export async function listing(params,fetchImpl=fetch) {
  const mode=params.get("mode")||"list",page=number(params.get("page")||"0","页码");
  if(mode==="list")return cached("list:"+page,fetchImpl,async()=>parseListing((await htmlRequest(SOURCE+"/list/2702-"+page+".html",{fetchImpl})).html,{page}));
  if(mode!=="search")fail("不支持的列表类型。");
  const query=(params.get("q")||"").trim();
  if(!query||query.length>80||/[\x00-\x1f]/.test(query))fail("请输入 1–80 个字的曲名或关键词。");
  let id=params.get("searchId");
  if(page>0&&(!id||! /^[1-9]\d{0,9}$/.test(id)))fail("搜索已过期，请重新搜索。");
  return cached("search:"+query+":"+page+":"+id,fetchImpl,async()=>{
    let result;
    if(page===0) {
      const body=new URLSearchParams({show:"title",tempid:"1",tbname:"news",mid:"1",dopost:"search",keyboard:query}).toString();
      result=await htmlRequest(SOURCE+"/e/search/index.php",{method:"POST",body,fetchImpl});
      id=new URL(result.url).searchParams.get("searchid");
      if(!id||!/^[1-9]\d{0,9}$/.test(id)) {
        if(/没有|不存在|无相关/.test(text(result.html)))return {source:"简谱之家",sourceUrl:SOURCE,mode,query,page,totalPages:1,hasNext:false,searchId:null,items:[]};
        fail("来源站搜索未返回结果，请稍后重试或前往原站搜索。",502);
      }
    } else result=await htmlRequest(SOURCE+"/e/search/result/index.php?page="+page+"&searchid="+id,{fetchImpl});
    return parseListing(result.html,{page,mode,query,searchId:id});
  });
}
export async function detail(path,fetchImpl=fetch) {
  path=articlePath(path);
  return cached("detail:"+path,fetchImpl,async()=>parseDetail((await htmlRequest(SOURCE+path,{fetchImpl})).html,path));
}
export async function image(path,index,fetchImpl=fetch) {
  const info=await detail(path,fetchImpl),i=number(index,"图片页码",31),chosen=info.images[i];
  if(!chosen)fail("这页图片不存在。");
  const response=await fetchImpl(chosen.url,{redirect:"manual",signal:AbortSignal.timeout(20000),headers:{"Referer":info.url,"Accept":"image/*"}});
  if(!response.ok)fail("乐谱图片暂时无法读取，请打开原站或手动上传。",502);
  const type=(response.headers.get("content-type")||"").split(";")[0].toLowerCase();
  if(!["image/png","image/jpeg","image/gif","image/webp"].includes(type))fail("来源文件不是受支持的乐谱图片。",502);
  return new Response(await readBytes(response,12*1024*1024),{headers:{"Content-Type":type,"Cache-Control":"public, max-age=1800","X-Content-Type-Options":"nosniff"}});
}
export function errorResponse(error) {
  return Response.json({error:error instanceof CatalogError?error.message:"来源站连接超时或暂不可用，请稍后重试。"},
    {status:error instanceof CatalogError?error.status:502,headers:{"Cache-Control":"no-store"}});
}
