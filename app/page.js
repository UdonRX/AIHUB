"use client";

import {useEffect,useRef,useState} from "react";

const MODES=[
  {id:"search",name:"検索",hint:"Webから探す"},
  {id:"code",name:"コード",hint:"作る・直す"},
  {id:"image",name:"画像",hint:"作る・編集する"}
];

function Icon({type,size=24}){
  const common={width:size,height:size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true"};
  if(type==="search") return <svg {...common}><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>;
  if(type==="code") return <svg {...common}><path d="m8.5 7-5 5 5 5"/><path d="m15.5 7 5 5-5 5"/><path d="m13.5 4-3 16"/></svg>;
  if(type==="image") return <svg {...common}><rect x="3.5" y="4" width="17" height="16" rx="2.5"/><circle cx="8.5" cy="9" r="1.5"/><path d="m5.5 17 4.5-4.5 3.5 3 2.5-2.5 2.5 2.5"/></svg>;
  if(type==="plus") return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if(type==="send") return <svg {...common}><path d="m5 4 14 8-14 8 3-8-3-8Z"/><path d="M8 12h11"/></svg>;
  return null;
}

function esc(s){
  return String(s).replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function markdown(md){
  const tick=String.fromCharCode(96);
  let s=String(md||"").replace(/\r\n/g,"\n");
  const blocks=[];
  const fence=new RegExp(tick.repeat(3)+"([\\s\\S]*?)"+tick.repeat(3),"g");
  s=s.replace(fence,(_,code)=>{
    const i=blocks.push(code.replace(/^\w+\n/,""))-1;
    return "@@CODE"+i+"@@";
  });
  let h=esc(s);
  h=h.replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>");
  h=h.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
  h=h.replace(new RegExp(tick+"([^"+tick+"]+)"+tick,"g"),"<code>$1</code>");
  h=h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
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
  const [github,setGithub]=useState(null);
  const [githubRepo,setGithubRepo]=useState("");
  const [githubMessage,setGithubMessage]=useState("");
  const ref=useRef(null);

  useEffect(()=>{if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{})},[]);
  useEffect(()=>{fetch("/api/github/me",{cache:"no-store"}).then(r=>r.json()).then(setGithub).catch(()=>setGithub(null))},[]);
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
    e?.preventDefault();
    if(!prompt.trim()||loading)return;
    setLoading(true);setResult(null);setGithubMessage("");
    try{
      const direct=category==="code"&&github?.connected&&githubRepo.trim();
      const endpoint=direct?"/api/github/apply":"/api/ai";
      const body=direct?{repo:githubRepo,prompt}:{category,prompt,images:category==="image"?images:[]};
      const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const d=await r.json();
      if(!r.ok)throw new Error(d?.error||"処理に失敗しました");
      if(direct){
        setGithubMessage(d.changedFiles?.length?"GitHubに反映したよ："+d.changedFiles.join("、"):d.message||"変更はありませんでした。");
        setResult({text:d.changedFiles?.length?"GitHubへ直接反映しました。\\n\\n変更ファイル\\n"+d.changedFiles.map(x=>"- "+x).join("\\n")+"\\n\\nブランチ："+d.branch:d.message||"変更はありませんでした。",provider:"GitHub"});
      }else setResult(d);
    }catch(e){setResult({error:e.message||"処理に失敗しました"})}
    finally{setLoading(false)}
  }

  async function githubLogout(){
    await fetch("/api/github/logout",{method:"POST"});
    setGithub({...github,connected:false,user:null});
  }

  const mode=MODES.find(x=>x.id===category);

  return <main className="app"><div className="shell">
    <div className="topbar"><div className="brand">AI HUB</div><button className="statusButton" onClick={loadStatus}>AI STATUS</button></div>

    <section className="hero"><div className="eyebrow">目的を選ぶだけ</div><h1>何をする？</h1><p><Icon type={mode.id} size={17}/> {mode.name}を選ぶと、その中で使えるAIを自動で選択します。</p></section>

    <section className="modes" aria-label="ジャンル選択">
      {MODES.map(x=><button key={x.id} className={"mode "+(category===x.id?"active":"")} onClick={()=>setCategory(x.id)} aria-pressed={category===x.id}>
        <span className="modeIcon"><Icon type={x.id} size={25}/></span><span className="modeName">{x.name}</span><span className="modeHint">{x.hint}</span>
      </button>)}
    </section>

    {category==="code"&&<section className="githubBox">
      <div className="githubBoxTop"><div><strong>GitHubへ直接反映</strong><small>無料のGitHub APIを使って、必要なファイルだけ変更する</small></div>
      {github?.connected?<button className="githubSmall" type="button" onClick={githubLogout}>切断</button>:<button className="githubSmall" type="button" onClick={()=>{window.location.href="/api/github/login"}} disabled={!github?.configured}>GitHub接続</button>}</div>
      {github?.connected&&<><div className="githubUser">{github.user?.login} として接続中</div><input className="repoInput" value={githubRepo} onChange={e=>setGithubRepo(e.target.value)} placeholder="UdonRX/drivingapp"/></>}
      {!github?.configured&&<small className="githubHint">GitHub連携の環境変数を設定すると接続できるよ。</small>}
      {githubMessage&&<div className="githubMessage">{githubMessage}</div>}
    </section>}

    <section className="resultArea">
      {loading&&<div className="resultCard"><div className="notice"><span className="loadingDot"/>考え中…</div></div>}
      {result&&!loading&&<div className="resultCard">
        {result.error?<div className="notice">{result.error}</div>:<>
          <div className="resultMeta"><span className="resultMode"><Icon type={mode.id} size={14}/>{mode.name}</span><span>AIで処理</span></div>
          {result.imageUrl?<img className="generatedImage" src={result.imageUrl} alt="生成結果"/>:<div className="markdown" dangerouslySetInnerHTML={{__html:markdown(result.text)}}/>}
          {result.sources?.length>0&&<div className="sources">{result.sources.map((x,i)=><div className="source" key={x.url+"-"+i}><a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a><small>{x.description}</small></div>)}</div>}
        </>}
      </div>}
    </section>
  </div>

  <div className="composerWrap"><form className="composer" onSubmit={submit}>
    {category==="image"&&images.length>0&&<div className="attachPreview">{images.map((x,i)=><img className="thumb" src={x} alt={"添付画像 "+(i+1)} key={i}/>)}</div>}
    <div className="composerRow">
      {category==="image"&&<label className="iconButton" aria-label="画像を添付"><Icon type="plus" size={20}/><input className="fileInput" type="file" accept="image/*" multiple onChange={addImages}/></label>}
      <textarea ref={ref} value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submit()}}} placeholder={category==="search"?"知りたいことを入力…":category==="code"?"コードやエラーを入力…":"作りたい画像を説明…"} rows={1} inputMode="text" enterKeyHint="send"/>
      <button className="sendButton" type="submit" disabled={!prompt.trim()||loading} aria-label="送信"><Icon type="send" size={19}/></button>
    </div>
  </form></div>

  {statusOpen&&<div className="statusPanel" onClick={()=>setStatusOpen(false)}><section className="statusSheet" onClick={e=>e.stopPropagation()}>
    <div className="statusHeader"><div className="statusTitle">AI STATUS</div><button className="close" onClick={()=>setStatusOpen(false)}>×</button></div>
    {!status?<div className="notice">状態を取得できませんでした。</div>:Object.entries(status.groups).map(([g,ps])=><div className="statusGroup" key={g}>
      <div className="statusGroupTitle"><Icon type={g} size={15}/>{g==="search"?"検索":g==="code"?"コード":"画像"}</div>
      {ps.map(p=><div className="providerRow" key={p.provider}><div className="providerName">{p.provider}<small>{p.detail}</small></div><div className={"providerState "+(p.status==="available"?"ok":p.status==="error"?"error":"disabled")}>{p.status==="available"?(p.detail?.includes("検索可能")?"● 接続OK":p.detail?.includes("設定OK")?"● 設定OK":"● 利用可能"):p.status==="error"?"× 未設定":"○ 未設定"}<br/>{p.remaining}</div></div>)}
    </div>)}
  </section></div>}
</main>
}
