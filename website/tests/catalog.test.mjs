import test from "node:test";
import assert from "node:assert/strict";
import {parseListing,parseDetail,articlePath,listing,detail,image} from "../lib/catalog.mjs";
const listHtml='<nav><a href="/jianpu/999.html">广告</a></nav><div class="list"><h1>简谱</h1><ul><li><a href="/jianpu/123.html" title="旋律甲 &amp; 乙简谱">甲</a></li><li><a href="/jianpu/124.html">旋律乙简谱</a></li><li><a href="javascript:alert(1)">bad</a></li><li><a href="https://evil.example/jianpu/3.html">bad</a></li></ul><div class="pagebar"><span>1</span><a href="/list/2702-1.html">2</a><a href="/list/2702-20.html">尾页</a></div></div>';
const detailHtml='<h1>旋律甲简谱</h1><img src="/skin/logo.png"><div class="article_content"><p><img src="https://image.jianpujia.com/jianpu/a.gif" alt="第一页"><img data-src="https://image.jianpujia.com/jianpu/b.png" src="/placeholder.gif"><img src="https://evil.example/a.png"></p></div><div class="pagebar"></div><img src="https://image.jianpujia.com/ad.gif">';
test("catalog extracts the main list without navigation or foreign links",()=>{
  const result=parseListing(listHtml);
  assert.equal(result.items.length,2);assert.equal(result.items[0].title,"旋律甲 & 乙简谱");
  assert.equal(result.totalPages,21);assert.equal(result.hasNext,true);
  assert.equal(result.items[0].kind,"简谱");
});
test("search pagination decodes entities and retains source search id",()=>{
  const html=listHtml.replace('href="/list/2702-1.html"','href="/e/search/result/index.php?page=1&amp;searchid=167"').replace('href="/list/2702-20.html"','href="/e/search/result/index.php?page=10&amp;searchid=167"');
  const result=parseListing(html,{mode:"search",searchId:"167",query:"旋律"});
  assert.equal(result.totalPages,11);assert.equal(result.searchId,"167");assert.equal(result.query,"旋律");
});
test("detail includes score pages only, and accepts GIF without turning it into HTML",()=>{
  const result=parseDetail(detailHtml,"/jianpu/123.html");
  assert.equal(result.title,"旋律甲简谱");assert.equal(result.images.length,2);
  assert.equal(result.images[0].url,"https://image.jianpujia.com/jianpu/a.gif");
});
test("article inputs cannot become an open proxy or internal fetch",()=>{
  for(const path of ["https://evil.example/jianpu/123.html","//127.0.0.1/jianpu/123.html","/e/admin/","/jianpu/123.html?url=x","javascript:alert(1)","/jianpu/../admin/1.html"])assert.throws(()=>articlePath(path));
  assert.throws(()=>parseListing("<h1>Verification required</h1>"));
});
test("search uses the source form, follows only source redirects and paginates",async()=>{
  const seen=[];
  const send=async(url,init)=>{
    seen.push({url,init});
    if(seen.length===1) {
      assert.equal(init.method,"POST");assert.equal(new URLSearchParams(init.body).get("keyboard"),"小星星");
      return new Response(null,{status:302,headers:{Location:"/e/search/result/?searchid=167"}});
    }
    assert.equal(init.method,"GET");
    return new Response(listHtml.replaceAll("/list/2702-1.html","/e/search/result/index.php?page=1&amp;searchid=167"));
  };
  const result=await listing(new URLSearchParams({mode:"search",q:"小星星",page:"0"}),send);
  assert.equal(result.searchId,"167");assert.equal(result.items.length,2);
  const next=await listing(new URLSearchParams({mode:"search",q:"小星星",page:"1",searchId:"167"}),send);
  assert.equal(next.page,1);assert.match(seen.at(-1).url,/page=1&searchid=167/);
  await assert.rejects(()=>listing(new URLSearchParams({mode:"search",q:"旋律",page:"1"}),send));
  await assert.rejects(()=>listing(new URLSearchParams({mode:"list",page:"-1"}),send));
});
test("external source redirects and unsupported image types are rejected",async()=>{
  const redirected=async()=>new Response(null,{status:302,headers:{Location:"https://evil.example/"}});
  await assert.rejects(()=>listing(new URLSearchParams({page:"0"}),redirected));
  let calls=0;
  const send=async()=>{calls++;return calls===1?new Response(detailHtml):new Response("not image",{headers:{"Content-Type":"text/html"}});};
  await assert.rejects(()=>image("/jianpu/123.html",0,send));
});
test("selected image is fetched from parsed source detail and served with safe MIME",async()=>{
  const send=async(url)=>url.endsWith(".html")?new Response(detailHtml):new Response(new Uint8Array([71,73,70,56]),{headers:{"Content-Type":"image/gif"}});
  const result=await image("/jianpu/123.html","0",send);
  assert.equal(result.headers.get("content-type"),"image/gif");
  assert.equal(result.headers.get("x-content-type-options"),"nosniff");
  assert.equal((await result.arrayBuffer()).byteLength,4);
});
