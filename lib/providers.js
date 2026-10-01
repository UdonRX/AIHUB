const TIMEOUT=45000;
function timeout(p){return Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(Object.assign(new Error("timeout"),{code:"TIMEOUT"})),TIMEOUT))])}
async function jsonFetch(url,opt={}){const r=await timeout(fetch(url,{...opt,headers:{"content-type":"application/json",...(opt.headers||{})}}));const t=await r.text();let d=null;try{d=t?JSON.parse(t):null}catch{}if(!r.ok){const e=new Error("provider request failed");e.status=r.status;throw e}return {data:d,headers:r.headers}}
export function retryable(e){return e?.code==="TIMEOUT"||[401,403,408,429,500,502,503,504].includes(e?.status)}
async function compatible(url,key,model,messages){if(!key)throw Object.assign(new Error("disabled"),{code:"DISABLED"});const r=await jsonFetch(url,{method:"POST",headers:{Authorization:"Bearer "+key},body:JSON.stringify({model,messages,temperature:.2,max_tokens:10000})});const text=r.data?.choices?.[0]?.message?.content?.trim();if(!text)throw new Error("no text");return {text,rateHeaders:{remainingRequests:r.headers.get("x-ratelimit-remaining-requests"),limitRequests:r.headers.get("x-ratelimit-limit-requests"),resetRequests:r.headers.get("x-ratelimit-reset-requests"),remainingTokens:r.headers.get("x-ratelimit-remaining-tokens"),limitTokens:r.headers.get("x-ratelimit-limit-tokens"),resetTokens:r.headers.get("x-ratelimit-reset-tokens")}}}
export const groq=m=>compatible("https://api.groq.com/openai/v1/chat/completions",process.env.GROQ_API_KEY,process.env.GROQ_MODEL||"openai/gpt-oss-120b",m);
export const openrouter=m=>compatible("https://openrouter.ai/api/v1/chat/completions",process.env.OPENROUTER_API_KEY,process.env.OPENROUTER_MODEL||"openrouter/free",m);
export const cloudflare=m=>compatible("https://api.cloudflare.com/client/v4/accounts/"+process.env.CLOUDFLARE_ACCOUNT_ID+"/ai/v1/chat/completions",process.env.CLOUDFLARE_API_TOKEN,process.env.CLOUDFLARE_MODEL||"@cf/zai-org/glm-4.7-flash",m);
export async function gemini(messages){const key=process.env.GEMINI_API_KEY;if(!key)throw Object.assign(new Error("disabled"),{code:"DISABLED"});const system=messages.find(x=>x.role==="system");const contents=messages.filter(x=>x.role!=="system").map(x=>({role:x.role==="assistant"?"model":"user",parts:[{text:String(x.content||"")}] }));const r=await jsonFetch("https://generativelanguage.googleapis.com/v1beta/models/"+(process.env.GEMINI_MODEL||"gemini-3.5-flash-lite")+":generateContent",{method:"POST",headers:{"x-goog-api-key":key},body:JSON.stringify({systemInstruction:system?{parts:[{text:system.content}]}:undefined,contents,generationConfig:{temperature:.2,maxOutputTokens:4000}})});const text=r.data?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("").trim();if(!text)throw new Error("no text");return {text,rateHeaders:{}}}

const SEARXNG_INSTANCES=["https://search.mectov.my.id","https://search.pi.vps.pw","https://search.hbubli.cc","https://search.serpensin.com"];
const SEARXNG_DIRECTORY="https://searx.space/data/instances.json";
let searxDirectoryCache={at:0,instances:[]};
async function getSearxngInstances(){
  const now=Date.now();
  if(now-searxDirectoryCache.at<3600000&&searxDirectoryCache.instances.length)return searxDirectoryCache.instances;
  try{
    const r=await timeout(fetch(SEARXNG_DIRECTORY,{headers:{Accept:"application/json","user-agent":"AIHUB/1.0"}}));
    if(!r.ok)throw new Error("directory_http_"+r.status);
    const data=await r.json();
    const dynamic=Object.entries(data?.instances||{}).map(([url,v])=>({url,score:Number(v?.score)||0,html:v?.html?.grade||"",http:v?.http?.grade||""}))
      .filter(x=>x.url.startsWith("https://")&&!x.url.includes(".onion"))
      .filter(x=>x.http!=="F"&&x.html!=="E")
      .sort((a,b)=>b.score-a.score).map(x=>x.url.replace(/\/$/,""));
    const merged=[...dynamic,...SEARXNG_INSTANCES].filter((x,i,a)=>a.indexOf(x)===i).slice(0,16);
    searxDirectoryCache={at:now,instances:merged};return merged;
  }catch{return SEARXNG_INSTANCES}
}
function parseSearxHtml(html){
  const out=[];const re=/<article[^>]*class=["'][^"']*result[^"']*["'][^>]*>[\s\S]*?<h3[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*class=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/p>)?[\s\S]*?<\/article>/gi;let m;
  while((m=re.exec(html))&&out.length<8){const title=m[2].replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim();const description=(m[3]||"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();try{const url=new URL(m[1],"https://example.com").toString();if(url.startsWith("http://")||url.startsWith("https://"))out.push({title:title||"Untitled",url,description})}catch{}}
  return out;
}
async function checkSearxInstance(base){
  const u=new URL(base+"/search");u.searchParams.set("q","OpenAI");u.searchParams.set("safesearch","0");u.searchParams.set("categories","general");
  try{
    const jsonUrl=new URL(u);jsonUrl.searchParams.set("format","json");const jr=await timeout(fetch(jsonUrl,{headers:{Accept:"application/json","user-agent":"AIHUB/1.0"}}));const jt=await jr.text();
    if(jr.ok){try{const data=jt?JSON.parse(jt):null;if(Array.isArray(data?.results)&&data.results.length)return {ok:true,detail:"JSON検索OK"}}catch{}}
    const hr=await timeout(fetch(u,{headers:{Accept:"text/html","user-agent":"AIHUB/1.0"}}));if(hr.ok){const results=parseSearxHtml(await hr.text());if(results.length)return {ok:true,detail:"HTML検索OK"}}
    if(jr.status===429||hr.status===429)return {ok:false,detail:"HTTP 429 レート制限"};if(jr.ok&&jt.trim().startsWith("<"))return {ok:false,detail:"JSON要求にHTMLが返った"};return {ok:false,detail:"検索結果0件"};
  }catch(e){return {ok:false,detail:e?.code||"failed"}}
}
export async function checkSearxng(){const instances=await getSearxngInstances();const failures=[];for(const base of instances){const check=await checkSearxInstance(base);if(check.ok)return {ok:true,instance:base,detail:check.detail};failures.push(base+":"+check.detail)}return {ok:false,detail:failures.join(",")}}
let lastGroqRateHeaders=null;

export async function groqWithRateCache(messages){
  const result=await groq(messages);
  lastGroqRateHeaders=result.rateHeaders||null;
  return result;
}

export function getGroqUsage(){
  const h=lastGroqRateHeaders;
  if(!h)return {detail:"直近リクエストの残量を待機中"};
  const parts=[];
  if(h.remainingRequests&&h.limitRequests)parts.push("リクエスト "+h.remainingRequests+"/"+h.limitRequests);
  if(h.remainingTokens&&h.limitTokens)parts.push("トークン "+h.remainingTokens+"/"+h.limitTokens);
  if(h.resetRequests)parts.push("RPDリセット "+h.resetRequests);
  return {detail:parts.join(" / ")||"直近リクエスト情報あり"};
}

export async function checkOpenrouterCredits(){
  if(!process.env.OPENROUTER_API_KEY)return {ok:false,reason:"missing_key"};
  try{
    const r=await timeout(fetch("https://openrouter.ai/api/v1/key",{headers:{Authorization:"Bearer "+process.env.OPENROUTER_API_KEY,Accept:"application/json","user-agent":"AIHUB/1.0"}}));
    const d=await r.json().catch(()=>null);
    if(!r.ok) return {ok:false,reason:r.status};
    const x=d?.data||{};
    const parts=[];
    if(typeof x.limit_remaining==="number"&&typeof x.limit==="number")parts.push("残り $"+x.limit_remaining.toFixed(2)+" / $"+x.limit.toFixed(2));
    else if(typeof x.usage==="number")parts.push("使用量 $"+x.usage.toFixed(2));
    if(x.limit_reset)parts.push("リセット："+String(x.limit_reset));
    return {ok:true,remaining:parts.join(" / ")||"API非公開",detail:"残量取得OK"};
  }catch(e){return {ok:false,reason:e?.code||"failed"}}
}

export async function checkGemini(){return process.env.GEMINI_API_KEY?{ok:true,detail:"APIキー設定済み / 接続テスト未実行"}:{ok:false,reason:"missing_key"}}
export async function checkGroq(){return process.env.GROQ_API_KEY?{ok:true,detail:"APIキー設定済み / 接続テスト未実行"}:{ok:false,reason:"missing_key"}}
export async function checkOpenrouter(){return process.env.OPENROUTER_API_KEY?{ok:true,detail:"APIキー設定済み / 接続テスト未実行"}:{ok:false,reason:"missing_key"}}
export async function checkCloudflare(){return process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN?{ok:true,detail:"認証情報設定済み / 接続テスト未実行"}:{ok:false,reason:"missing_key"}}
export async function checkHuggingFace(){if(!process.env.HF_TOKEN)return {ok:false,reason:"missing_key"};try{const {Client}=await import("@gradio/client");const space=process.env.HF_SPACE_ID||"Qwen/Qwen-Image-2.1";const client=await Client.connect(space,{token:process.env.HF_TOKEN});const api=await client.view_api();const named=api?.named_endpoints||{};const prepare=Boolean(named["/prepare_request"]);const generate=Boolean(named[process.env.HF_IMAGE_API_NAME||"/generate_request"]);if(!prepare||!generate)return {ok:false,reason:"endpoint_missing",detail:"Gradio接続OK / 必要な画像APIが見つからない"};return {ok:true,detail:"Gradio接続OK / 画像API確認OK"}}catch(e){return {ok:false,reason:e?.status||e?.code||e?.message||"failed"}}}

export async function searxng(query){
  const q=String(query||"").trim().slice(0,500);if(!q)throw new Error("search query required");const instances=await getSearxngInstances();const failures=[];
  for(const base of instances){try{const u=new URL(base+"/search");u.searchParams.set("q",q);u.searchParams.set("language","ja");u.searchParams.set("safesearch","1");u.searchParams.set("categories","general");const jsonUrl=new URL(u);jsonUrl.searchParams.set("format","json");const jr=await timeout(fetch(jsonUrl,{headers:{Accept:"application/json","user-agent":"AIHUB/1.0"}}));if(jr.ok){try{const d=await jr.json();if(Array.isArray(d?.results)&&d.results.length)return d.results.slice(0,8).map(x=>({title:String(x.title||"Untitled"),url:String(x.url||""),description:String(x.content||x.description||"")}))}catch{}}
    const hr=await timeout(fetch(u,{headers:{Accept:"text/html","user-agent":"AIHUB/1.0"}}));if(hr.ok){const results=parseSearxHtml(await hr.text());if(results.length)return results}failures.push(base+":"+((jr.status===429||hr.status===429)?"429":"no_results"))}catch(e){failures.push(base+":"+(e?.code||"failed"))}}
  const e=new Error("search unavailable");e.status=503;e.failures=failures;throw e;
}
export async function hfImage({prompt,images=[],debugId=null}){
  const {Client,handle_file}=await import("@gradio/client");
  const fs=await import("node:fs/promises"),os=await import("node:os"),path=await import("node:path");
  const files=[];
  const log=(event,data={})=>console.log(JSON.stringify({event:"huggingface_image_"+event,debugId,...data,timestamp:new Date().toISOString()}));
  const info=e=>({message:String(e?.message||"unknown").slice(0,500),code:e?.code||null,status:e?.status||null});
  try{
    log("start",{space:process.env.HF_SPACE_ID||"Qwen/Qwen-Image-2.1",apiName:process.env.HF_IMAGE_API_NAME||"/generate_request",tokenPresent:Boolean(process.env.HF_TOKEN),imageCount:images.length});
    for(let i=0;i<Math.min(images.length,10);i++){
      const m=/^data:(image\\/[^;]+);base64,(.+)$/.exec(images[i]||"");
      if(!m){
        log("image_decode_skipped",{index:i,reason:"invalid_data_url"});
        continue;
      }
      const p=path.join(os.tmpdir(),"aihub-"+Date.now()+"-"+i+"."+m[1].split("/")[1].replace("jpeg","jpg"));
      await fs.writeFile(p,Buffer.from(m[2],"base64"));
      files.push(p);
      log("image_saved",{index:i,bytes:Buffer.byteLength(m[2],"base64"),mime:m[1]});
    }

    const token=process.env.HF_TOKEN||undefined;
    let client;
    try{
      log("connect_start",{space:process.env.HF_SPACE_ID||"Qwen/Qwen-Image-2.1"});
      client=await Client.connect(process.env.HF_SPACE_ID||"Qwen/Qwen-Image-2.1",{token});
      log("connect_success");
    }catch(e){
      log("connect_failed",{error:info(e)});
      client=null;
    }

    if(client){
      try{
        log("view_api_start");
        const api=await client.view_api();
        const named=api?.named_endpoints||{};
        const prepareName="/prepare_request";
        const generateName=process.env.HF_IMAGE_API_NAME||"/generate_request";
        log("view_api_success",{
          endpointCount:Object.keys(named).length,
          endpoints:Object.keys(named).slice(0,50),
          prepareAvailable:Boolean(named[prepareName]),
          generateAvailable:Boolean(named[generateName])
        });

        if(named[prepareName]&&named[generateName]){
          const input=files.map(handle_file);
          log("prepare_start",{inputCount:input.length});
          const prepared=await client.predict(prepareName,{
            input_images:input,
            original_prompt:prompt,
            enable_extend:true,
            custom_size:false,
            quality:"speed",
            seed:0,
            randomize_seed:true
          });
          log("prepare_success",{dataLength:Array.isArray(prepared?.data)?prepared.data.length:null});

          log("generate_start",{apiName:generateName});
          const result=await client.predict(generateName,{
            request_state:prepared?.data?.[3],
            original_prompt:prompt,
            enable_extend:true,
            custom_size:false,
            log_dir:"",
            seed:prepared?.data?.[1]||0,
            height:1024,
            width:1024,
            negative_prompt:""
          });
          log("generate_success",{dataLength:Array.isArray(result?.data)?result.data.length:null});

          const value=result?.data?.[0];
          const imageUrl=typeof value==="string"?value:value?.url;
          if(imageUrl){
            log("generate_image_found",{receivedImages:files.length});
            return {imageUrl,receivedImages:files.length};
          }
          log("generate_image_missing",{valueType:typeof value});
        }else{
          log("endpoint_missing",{prepare:prepareName,generate:generateName});
        }
      }catch(e){
        log("private_space_failed",{error:info(e),cause:info(e?.cause)});
      }
    }

    log("public_workflow_start",{space:"Qwen/Qwen-Image-2.1-workflow",mode:files.length>0?"edit_image":"text_to_image"});
    let publicClient;
    try{
      publicClient=await Client.connect("Qwen/Qwen-Image-2.1-workflow");
      log("public_workflow_connect_success");
    }catch(e){
      log("public_workflow_connect_failed",{error:info(e)});
      throw Object.assign(new Error("public_workflow_connect_failed"),{cause:e});
    }

    if(files.length>0){
      try{
        const result=await publicClient.predict("/edit_image",{image:handle_file(files[0]),instruction:prompt,steps:40});
        const value=result?.data?.[0];
        const imageUrl=typeof value==="string"?value:value?.url;
        log("public_edit_result",{dataLength:Array.isArray(result?.data)?result.data.length:null,hasImage:Boolean(imageUrl)});
        if(imageUrl)return {imageUrl,receivedImages:1};
      }catch(e){
        log("public_edit_failed",{error:info(e)});
      }
    }else{
      try{
        const result=await publicClient.predict("/text_to_image",{prompt,steps:40});
        const value=result?.data?.[0];
        const imageUrl=typeof value==="string"?value:value?.url;
        log("public_text_result",{dataLength:Array.isArray(result?.data)?result.data.length:null,hasImage:Boolean(imageUrl)});
        if(imageUrl)return {imageUrl,receivedImages:0};
      }catch(e){
        log("public_text_failed",{error:info(e)});
      }
    }

    log("no_image_result");
    throw new Error("no image");
  }finally{
    await Promise.all(files.map(p=>fs.unlink(p).catch(()=>{})));
    log("cleanup",{fileCount:files.length});
  }
}
