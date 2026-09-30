"use client";

import {useEffect,useRef,useState} from "react";

const MODES=[
  {id:"search",icon:"🌐",name:"検索",hint:"Webから探す"},
  {id:"code",icon:"💻",name:"コード",hint:"作る・直す"},
  {id:"image",icon:"🖼️",name:"画像",hint:"作る・編集する"}
function esc(s){return String(s).replace(/[&<>\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\'":"&#039;"}[c])).replace(/"/g,"&quot;")}

function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",""":"&quot;","'":"&#039;"}[c]))}

function markdown(md){
  const tick=String.fromCharCode(96);
  s=s.replace(fence,(_,code)=>{const i=blocks.push(code.replace(/^\w+\n/,""))-1;return "@@CODE"+i+"@@"});
  let s=String(md||"").replace(/\r\n/g,"\n");
  const fence=new RegExp(tick.repeat(3)+"([\\s\\S]*?)"+tick.repeat(3),"g");
  s=s.replace(fence,(_,code)=>{const i=blocks.push(code.replace(/^\\w+\n/,""))-1;return "@@CODE"+i+"@@"});
  let h=esc(s);
  h=h.replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>");
  h=h.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(new RegExp(tick+"([^"+tick+"]+)"+tick,"g"),"<code>$1</code>");
  h=h.replace(/\[([^\]]+)\]\((https?:\\/\\/[^\\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  h=h.replace(/^[-*] (.+)$/gm,"<li>$1</li>").replace(/\n/g,"<br/>");
  h=h.replace(/(<li>.*?<\/li>)(?:<br\/>)?(?=<li>)/g,"$1");
  h=h.replace(/@@CODE(\d+)@@/g,(_,i)=>"<pre><code>"+esc(blocks[Number(i)])+"</code></pre>");
  return h;
}

export default function Home(){
  const [category,setCategory]=useState("search");
  const [prompt,setPrompt]=useState("");
  const [images,setImages]=useState([]);
  const [result,setResult]=useState(null);
  const [loading,setLoading]=useState(false);
  const [statusOpen,setStatusOpen]=useState(false);
  const [status,setStatus]=useState(null);
  const ref=useRef(null);

  useEffect(()=>{if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{})},[]);
  useEffect(()=>{if(ref.current){ref.current.style.height="auto";ref.current.style.height=Math.min(ref.current.scrollHeight,150)+"px"}},[prompt]);

  async function loadStatus(){
    setStatusOpen(true);
    try{const r=await fetch("/api/status",{cache:"no-store"});setStatus(await r.json())}catch{setStatus(null)}
  }

  function addImages(e){
    const fs=Array.from(e.target.files||[]).slice(0,10);
    Promise.all(fs.map(f=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(f)}))).then(setImages);
    e.target.value="";
  }

  async function submit(e){
    e?.preventDefault();if(!prompt.trim()||loading)return;
    setLoading(true);setResult(null);
    try{
      const r=await fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({category,prompt,images:category==="image"?images:[]})});
      const d=await r.json();if(!r.ok)throw new Error(d?.error||"処理に失敗しました");setResult(d);
    }catch(e){setResult({error:e.message||"処理に失敗しました"})}finally{setLoading(false)}
  }

  const mode=MODES.find(x=>x.id===category);

  return <main className="app"><div className="shell">
    <div className="topbar"><div className="brand">AI HUB</div><button className="statusButton" onClick={loadStatus}>AI STATUS</button></div>
    <section className="hero"><div className="eyebrow">目的を選ぶだけ</div><h1>何をする？</h1><p>{mode.icon} {mode.name}を選ぶと、その中で使えるAIを自動で選択します。</p></section>
    <section className="modes" aria-label="ジャンル選択">
      {MODES.map(x=><button key={x.id} className={"mode "+(category===x.id?"active":"")} onClick={()=>setCategory(x.id)} aria-pressed={category===x.id}>
        <span className="modeIcon">{x.icon}</span><span className="modeName">{x.name}</span><span className="modeHint">{x.hint}</span>
      </button>)}
    </section>

    <section className="resultArea">
      {loading&&<div className="resultCard"><div className="notice"><span className="loadingDot"/>考え中…</div></div>}
      {result&&!loading&&<div className="resultCard">
        {result.error?<div className="notice">{result.error}</div>:<>
          <div className="resultMeta"><span>{mode.icon} {mode.name}</span><span>AIで処理</span></div>
          {result.imageUrl?<img className="generatedImage" src={result.imageUrl} alt="生成結果"/>:<div className="markdown" dangerouslySetInnerHTML={{__html:markdown(result.text)}}/>}
          {result.sources?.length>0&&<div className="sources">{result.sources.map((x,i)=><div className="source" key={x.url+"-"+i}><a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a><small>{x.description}</small></div>)}</div>}
        </>}
      </div>}
    </section>
  </div>

  <div className="composerWrap"><form className="composer" onSubmit={submit}>
    {category==="image"&&images.length>0&&<div className="attachPreview">{images.map((x,i)=><img className="thumb" src={x} alt={"添付画像 "+(i+1)} key={i}/>)}</div>}
    <div className="composerRow">
      {category==="image"&&<label className="iconButton" aria-label="画像を添付">＋<input className="fileInput" type="file" accept="image/*" multiple onChange={addImages}/></label>}
      <textarea ref={ref} value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submit()}}} placeholder={category==="search"?"知りたいことを入力…":category==="code"?"コードやエラーを入力…":"作りたい画像を説明…"} rows={1} inputMode="text" enterKeyHint="send"/>
      <button className="sendButton" type="submit" disabled={!prompt.trim()||loading} aria-label="送信">↑</button>
    </div>
  </form></div>

  {statusOpen&&<div className="statusPanel" onClick={()=>setStatusOpen(false)}><section className="statusSheet" onClick={e=>e.stopPropagation()}>
    <div className="statusHeader"><div className="statusTitle">AI STATUS</div><button className="close" onClick={()=>setStatusOpen(false)}>×</button></div>
    {!status?<div className="notice">状態を取得できませんでした。</div>:Object.entries(status.groups).map(([g,ps])=><div className="statusGroup" key={g}>
      <div className="statusGroupTitle">{g==="search"?"🌐 検索":g==="code"?"💻 コード":"🖼️ 画像"}</div>
      {ps.map(p=><div className="providerRow" key={p.provider}><div className="providerName">{p.provider}</div><div className="providerState">{p.status==="available"?"● 利用可能":"○ 無効"}<br/>残量：{p.remaining}</div></div>)}
    </div>)}
  </section></div>}
</main>
}
