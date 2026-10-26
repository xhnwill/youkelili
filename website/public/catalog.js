/** Source catalog UI; source text is rendered as text, never as HTML. */
export function initCatalog({onImport,isBusy,toast}) {
  const $=id=>document.getElementById(id);
  let current={mode:"list",page:0,q:"",searchId:null,totalPages:1},revision=0,selection=null,imageIndex=0,detailRevision=0;
  async function read(url) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try {
      const response=await fetch(url,{signal:controller.signal});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"来源站读取失败。");return data;
    }catch(error){if(error.name==="AbortError")throw new Error("来源站读取超时，请稍后重试。");throw error;}
    finally{clearTimeout(timer);}
  }
  function link(title,url) {
    const a=document.createElement("a");a.textContent=title;a.href=url;a.target="_blank";a.rel="noopener noreferrer";return a;
  }
  function render(data) {
    const list=$("catalogResults");list.replaceChildren();list.scrollTop=0;
    for(const item of data.items) {
      const li=document.createElement("li"),title=document.createElement("button"),meta=document.createElement("span");
      title.className="catalog-title";title.type="button";title.textContent=item.title;title.title="预览："+item.title;
      title.onclick=()=>preview(item);meta.className="catalog-kind";meta.textContent=item.kind;
      li.append(title,meta,link("原站 ↗",item.url));list.append(li);
    }
    $("catalogStatus").textContent=data.mode==="search"?"“"+data.query+"”的全站搜索结果 · "+data.items.length+" 条":"简谱目录 · 本页 "+data.items.length+" 条";
    $("catalogPage").textContent="第 "+(data.page+1)+" / "+data.totalPages+" 页";
    $("catalogPageInput").value=data.page+1;$("catalogPageInput").max=data.totalPages;
    $("catalogPrevious").disabled=data.page===0;$("catalogNext").disabled=!data.hasNext;
    $("catalogSource").href=data.sourceUrl;
    $("catalogEmpty").hidden=!!data.items.length;
  }
  async function load(next) {
    const my=++revision;current={...current,...next};$("catalogStatus").textContent="正在读取简谱之家…";
    $("catalogSearchBtn").disabled=true;$("catalogPrevious").disabled=true;$("catalogNext").disabled=true;
    const params=new URLSearchParams({mode:current.mode,page:String(current.page)});
    if(current.mode==="search"){params.set("q",current.q);if(current.searchId)params.set("searchId",current.searchId);}
    try {
      const data=await read("/api/catalog?"+params);if(my!==revision)return;
      current={...current,page:data.page,totalPages:data.totalPages,searchId:data.searchId};render(data);
    } catch(error){if(my===revision){$("catalogStatus").textContent=error.message;$("catalogResults").replaceChildren();$("catalogEmpty").hidden=false;}}
    finally{if(my===revision)$("catalogSearchBtn").disabled=false;}
  }
  function showImage() {
    if(!selection)return;
    $("catalogImport").disabled=true;
    $("catalogImageStatus").textContent="第 "+(imageIndex+1)+" / "+selection.images.length+" 张 · 正在加载…";
    $("catalogImage").src="/api/catalog/image?"+new URLSearchParams({path:selection.path,index:String(imageIndex)});
    $("catalogImage").alt=selection.images[imageIndex].alt||selection.title;
    $("catalogImagePrev").disabled=imageIndex===0;$("catalogImageNext").disabled=imageIndex===selection.images.length-1;
  }
  async function preview(item) {
    const my=++detailRevision;selection=null;$("catalogDialog").showModal();
    $("catalogDetailTitle").textContent=item.title;$("catalogDetailSource").href=item.url;
    $("catalogImage").removeAttribute("src");$("catalogImport").disabled=true;
    $("catalogImageStatus").textContent="正在读取乐谱图片…";
    $("catalogImagePrev").disabled=true;$("catalogImageNext").disabled=true;
    try {
      const data=await read("/api/catalog/detail?"+new URLSearchParams({path:item.path}));
      if(my!==detailRevision||!$("catalogDialog").open)return;
      selection=data;imageIndex=0;$("catalogDetailTitle").textContent=data.title;showImage();
    } catch(error){if(my===detailRevision)$("catalogImageStatus").textContent=error.message;}
  }
  $("catalogImage").onload=()=>{
    if(!selection)return;
    const image=$("catalogImage"),valid=image.naturalWidth*image.naturalHeight<=24000000;
    $("catalogImageStatus").textContent="第 "+(imageIndex+1)+" / "+selection.images.length+" 张"+(valid?"":" · 图片过大，请在原站下载后缩小");
    $("catalogImport").disabled=!valid;
  };
  $("catalogImage").onerror=()=>{$("catalogImport").disabled=true;$("catalogImageStatus").textContent="图片暂时无法加载，请打开原站查看，或下载后手动上传。";};
  $("catalogImagePrev").onclick=()=>{if(imageIndex>0){imageIndex--;showImage();}};
  $("catalogImageNext").onclick=()=>{if(selection&&imageIndex<selection.images.length-1){imageIndex++;showImage();}};
  $("catalogClose").onclick=()=>{$("catalogDialog").close();detailRevision++;};
  $("catalogImport").onclick=async()=>{
    if(!selection||isBusy())return toast("请先等待当前识谱完成。");
    $("catalogImport").disabled=true;
    try {
      const image=$("catalogImage"),canvas=document.createElement("canvas");
      canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      canvas.getContext("2d").drawImage(image,0,0);
      await onImport({dataUrl:canvas.toDataURL("image/png"),title:selection.title,sourceUrl:selection.url,page:imageIndex+1});
      $("catalogDialog").close();$("imagePanel").scrollIntoView({behavior:"smooth",block:"center"});
      toast("已导入图片；请框选需要的部分，再点击 AI 识别简谱。");
    }catch(error){toast("导入失败："+error.message);}
    finally{$("catalogImport").disabled=false;}
  };
  $("catalogSearch").onsubmit=event=>{
    event.preventDefault();const q=$("catalogQuery").value.trim();
    load(q?{mode:"search",q,page:0,searchId:null}:{mode:"list",q:"",page:0,searchId:null});
  };
  $("catalogBrowse").onclick=()=>{$("catalogQuery").value="";load({mode:"list",q:"",page:0,searchId:null});};
  $("catalogPrevious").onclick=()=>load({page:Math.max(0,current.page-1)});
  $("catalogNext").onclick=()=>load({page:Math.min(current.totalPages-1,current.page+1)});
  $("catalogJump").onsubmit=event=>{event.preventDefault();const page=Number($("catalogPageInput").value);if(Number.isInteger(page)&&page>=1&&page<=current.totalPages)load({page:page-1});};
  load({mode:"list",page:0,q:"",searchId:null});
}
