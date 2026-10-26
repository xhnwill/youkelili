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
    assert.equal(data.messages[0].content[1].image_url.url,image);
    return Response.json({choices:[{message:{content:JSON.stringify({text:"1 2 3 4",key:"C",meter:"4/4",uncertain:["请核对"]})}}]});
  });
  assert.equal(response.status,200);const output=await response.json();
  assert.equal(output.text,"1 2 3 4");assert.ok(!JSON.stringify(output).includes("fake-key"));
  assert.equal(response.headers.get("cache-control"),"no-store");
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
