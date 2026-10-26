import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {recognize,validateEndpoint} from "../lib/vision.mjs";
const image="data:image/png;base64,"+readFileSync(new URL("../public/demo.png",import.meta.url)).toString("base64");
const request=(body,origin="https://app.example.com")=>new Request("https://app.example.com/api/recognize",{
  method:"POST",headers:{"Content-Type":"application/json",origin},body:JSON.stringify(body)});
const body=()=>({image,settings:{endpoint:"https://vision.example.com/v1/chat/completions",model:"mock-vision",apiKey:"fake-key"}});
test("relay posts only the selected image and user-provided credentials",async()=>{
  const response=await recognize(request(body()),async(url,init)=>{
    assert.equal(url,"https://vision.example.com/v1/chat/completions");
    assert.equal(init.headers.Authorization,"Bearer fake-key");assert.equal(init.redirect,"manual");
    const data=JSON.parse(init.body);assert.equal(data.model,"mock-vision");
    assert.deepEqual(data.response_format,{type:"json_object"});assert.equal(data.max_tokens,6000);
    assert.equal(data.messages[0].content[1].image_url.url,image);
    return Response.json({choices:[{message:{content:JSON.stringify({text:"1 2 3 4",key:"C",meter:"4/4",uncertain:["请核对"]})}}]});
  });
  assert.equal(response.status,200);const output=await response.json();
  assert.equal(output.text,"1 2 3 4");assert.ok(!JSON.stringify(output).includes("fake-key"));
  assert.equal(response.headers.get("cache-control"),"no-store");
});
test("Kimi K3 uses a thinking-compatible completion budget without disabling thinking",async()=>{
  for(const model of ["kimi-k3.1-pro","k3.1-pro","moonshot/kimi-k3.1-pro-highspeed","Kimi K3.1 Pro"]){
    const input=body();input.settings.model=model;
    const response=await recognize(request(input),async(url,init)=>{
      const data=JSON.parse(init.body);
      assert.equal(data.max_completion_tokens,32768);assert.equal(data.reasoning_effort,"low");
      assert.equal(data.max_tokens,undefined);assert.equal(data.thinking,undefined);
      return Response.json({choices:[{finish_reason:"stop",message:{reasoning_content:"private reasoning",content:'{"text":"1 2 3"}'}}]});
    });
    assert.equal(response.status,200);assert.ok(!(await response.text()).includes("private reasoning"));
  }
});
test("complete JSON survives fences, explanations, thinking tags and text content parts",async()=>{
  const json=JSON.stringify({text:"1 2 3",uncertain:['核对字符串中的 } 和 { 以及 "引号"']});
  for(const content of ["```json\n"+json+"\n```","识别结果如下：\n"+json+"\n请校对。",
    '<think>not final {"text":"7 7"}</think>\n'+json,
    [{type:"reasoning",text:'{"text":"7 7"}'},{type:"text",text:json.slice(0,10)},{type:"text",text:json.slice(10)}]]){
    const response=await recognize(request(body()),async()=>Response.json({choices:[{message:{content}}]}));
    assert.equal(response.status,200);assert.equal((await response.json()).text,"1 2 3");
  }
});
test("truncation is reported even when the returned partial transcription is valid JSON",async()=>{
  const response=await recognize(request(body()),async()=>Response.json({choices:[{finish_reason:"length",message:{content:'{"text":"1 2"}'}}]}));
  assert.equal(response.status,502);assert.match((await response.json()).error,/截断/);
});
test("reasoning-only and refusal responses have actionable errors without echoing content",async()=>{
  for(const [choice,expected] of [
    [{message:{content:null,reasoning_content:'fake-key {"text":"1 2"}'}},/思考过程/],
    [{finish_reason:"content_filter",message:{content:"fake-key"}},/拒绝/],
    [{message:{refusal:"fake-key"}},/拒绝/],
    [{message:{content:null}},/最终文本/]]){
    const response=await recognize(request(body()),async()=>Response.json({choices:[choice]}));
    const output=await response.json();assert.equal(response.status,502);assert.match(output.error,expected);
    assert.ok(!JSON.stringify(output).includes("fake-key"));
  }
});
test("incomplete, ambiguous and wrong-schema JSON is never imported or retried",async()=>{
  for(const content of ['{"text":"1 2"','{"text":"1"} {"text":"2"}','{"notes":"1 2"}',
    '{"text":[]}','{"text":""}','[]','<think>{"text":"7"}</think>','<think>{"text":"7"}']){
    let calls=0;
    const response=await recognize(request(body()),async()=>{calls++;return Response.json({choices:[{message:{content}}]});});
    assert.equal(response.status,502);assert.equal(calls,1);
  }
});
test("only an explicit JSON-mode rejection allows one retry without response_format",async()=>{
  let calls=0;
  const response=await recognize(request(body()),async(url,init)=>{
    const data=JSON.parse(init.body);calls++;
    if(calls===1){assert.ok(data.response_format);return Response.json({error:{param:"response_format",message:"response_format is not supported fake-key"}},{status:400});}
    assert.equal(data.response_format,undefined);assert.equal(data.messages[0].content[1].image_url.url,image);
    return Response.json({choices:[{message:{content:'{"text":"1 2"}'}}]});
  });
  assert.equal(response.status,200);assert.equal(calls,2);
  const output=await response.json();assert.match(output.warnings.join(" "),/不支持 JSON 模式/);assert.ok(!JSON.stringify(output).includes("fake-key"));
});
test("parameter fallback is bounded and does not retry authentication or other errors",async()=>{
  for(const [status,message,expected] of [[400,"invalid image",1],[401,"unsupported response_format",1],
    [429,"unsupported response_format",1],[422,"unsupported response_format",2]]){
    let calls=0;
    const response=await recognize(request(body()),async()=>{calls++;return Response.json({error:{message}},{status});});
    assert.equal(response.status,502);assert.equal(calls,expected);
  }
});
test("invalid upstream JSON and invalid notation remain distinct errors",async()=>{
  const upstream=await recognize(request(body()),async()=>new Response("<html>fake-key</html>"));
  assert.match((await upstream.json()).error,/非 JSON/);
  const notation=await recognize(request(body()),async()=>Response.json({choices:[{message:{content:'{"text":"8 9"}'}}]}));
  assert.equal(notation.status,422);assert.match((await notation.json()).error,/转录格式/);
});
test("relay refuses insecure, private, credential-bearing, and parameter URLs",()=>{
  for(const url of ["http://example.com/v1","https://127.0.0.1/v1","https://[::1]/v1","https://localhost/v1",
    "https://x.internal/v1","https://user:pass@example.com/v1","https://example.com/v1?key=secret","https://example.com:8443/v1"])assert.throws(()=>validateEndpoint(url));
});
test("malformed model responses, redirects and upstream failures do not echo secrets",async()=>{
  for(const upstream of [()=>new Response("",{status:401}),()=>new Response("",{status:302,headers:{Location:"https://elsewhere.example.com"}}),
    ()=>Response.json({choices:[{message:{content:"not JSON fake-key"}}]}),
    ()=>Response.json({choices:[{message:{content:"[]"}}]})]) {
    const response=await recognize(request(body()),async()=>upstream());
    assert.equal(response.status,502);assert.ok(!(await response.text()).includes("fake-key"));
  }
});
test("cross-site requests and invalid images are rejected before forwarding",async()=>{
  let called=false;const send=async()=>{called=true;return Response.json({});};
  assert.equal((await recognize(request(body(),"https://other.example.com"),send)).status,403);
  const bad=body();bad.image="data:image/png;base64,bad";
  assert.equal((await recognize(request(bad),send)).status,400);assert.equal(called,false);
});
