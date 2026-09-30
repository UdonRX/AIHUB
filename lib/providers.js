const TIMEOUT=45000;
function timeout(p){return Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(Object.assign(new Error("timeout"),{code:"TIMEOUT"})),TIMEOUT))])}
async function jsonFetch(url,opt={}){
  const r=await timeout(fetch(url,{...opt,headers:{"content-type":"application/json",...(opt.headers||{})}}));
  const t=await r.text();let d=null;try{d=t?JSON.parse(t):null}catch{}
  if(!r.ok){const e=new Error("provider request failed");e.status=r.status;throw e}
  return {data:d,headers:r.headers}
}
export function retryable(e){return e?.code==="TIMEOUT"||[401,403,408,429,500,502,503,504].includes(e?.status)}
async function compatible(url,key,model,messages){
  if(!key)throw Object.assign(new Error("disabled"),{code:"DISABLED"});
  const r=await jsonFetch(url,{method:"POST",headers:{Authorization:"Bearer "+key},body:JSON.stringify({model,messages,temperature:.2,max_tokens:4000})});
  const text=r.data?.choices?.[0]?.message?.content?.trim();if(!text)throw new Error("no text");
  return {text,rateHeaders:{remainingRequests:r.headers.get("x-ratelimit-remaining-requests"),remainingTokens:r.headers.get("x-ratelimit-remaining-tokens")}}
}
export const groq=m=>compatible("https://api.groq.com/openai/v1/chat/completions",process.env.GROQ_API_KEY,process.env.GROQ_MODEL||"openai/gpt-oss-120b",m);
export const openrouter=m=>compatible("https://openrouter.ai/api/v1/chat/completions",process.env.OPENROUTER_API_KEY,process.env.OPENROUTER_MODEL||"openrouter/free",m);
export const cloudflare=m=>compatible("https://api.cloudflare.com/client/v4/accounts/"+process.env.CLOUDFLARE_ACCOUNT_ID+"/ai/v1/chat/completions",process.env.CLOUDFLARE_API_TOKEN,process.env.CLOUDFLARE_MODEL||"@cf/zai-org/glm-4.7-flash",m);
export async function gemini(messages){
  const key=process.env.GEMINI_API_KEY;if(!key)throw Object.assign(new Error("disabled"),{code:"DISABLED"});
  const system=messages.find(x=>x.role==="system");const contents=messages.filter(x=>x.role!=="system").map(x=>({role:x.role==="assistant"?"model":"user",parts:[{text:String(x.content||"")}] }));
  const r=await jsonFetch("https://generativelanguage.googleapis.com/v1beta/models/"+(process.env.GEMINI_MODEL||"gemini-3.5-flash-lite")+":generateContent",{method:"POST",headers:{"x-goog-api-key":key},body:JSON.stringify({systemInstruction:system?{parts:[{text:system.content}]}:undefined,contents,generationConfig:{temperature:.2,maxOutputTokens:4000}})});
  const text=r.data?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("").trim();if(!text)throw new Error("no text");return {text,rateHeaders:{}};
}
export async function brave(query){
  const key=process.env.BRAVE_SEARCH_API_KEY;if(!key)throw Object.assign(new Error("disabled"),{code:"DISABLED"});
  const u=new URL("https://api.search.brave.com/res/v1/web/search");u.searchParams.set("q",query.slice(0,500));u.searchParams.set("count","8");u.searchParams.set("safesearch","moderate");
  const r=await timeout(fetch(u,{headers:{Accept:"application/json","X-Subscription-Token":key}}));if(!r.ok){const e=new Error("search failed");e.status=r.status;throw e}
  const d=await r.json();return (d?.web?.results||[]).slice(0,8).map(x=>({title:x.title||"Untitled",url:x.url,description:x.description||""})).filter(x=>typeof x.url==="string"&&/^https?:\/\//.test(x.url));
}
export async function hfImage({prompt,images=[]}){
  if(!process.env.HF_TOKEN)throw Object.assign(new Error("disabled"),{code:"DISABLED"});
  const {Client,handle_file}=await import("@gradio/client");const client=await Client.connect(process.env.HF_SPACE_ID||"Qwen/Qwen-Image-2.1",{token:process.env.HF_TOKEN});
  const fs=await import("node:fs/promises"),os=await import("node:os"),path=await import("node:path");const files=[];
  try{
    for(let i=0;i<Math.min(images.length,10);i++){const m=/^data:(image\/[^;]+);base64,(.+)$/.exec(images[i]||"");if(!m)continue;const p=path.join(os.tmpdir(),"aihub-"+Date.now()+"-"+i+"."+m[1].split("/")[1].replace("jpeg","jpg"));await fs.writeFile(p,Buffer.from(m[2],"base64"));files.push(p)}
    const input=files.map(handle_file);
    const prepared=await client.predict("/prepare_request",{input_images:input,original_prompt:prompt,enable_extend:true,custom_size:false,quality:"speed",seed:0,randomize_seed:true});
    const result=await client.predict(process.env.HF_IMAGE_API_NAME||"/generate_request",{request_state:prepared?.data?.[3],original_prompt:prompt,enable_extend:true,custom_size:false,log_dir:"",seed:prepared?.data?.[1]||0,height:1024,width:1024,negative_prompt:""});
    const value=result?.data?.[0];const imageUrl=typeof value==="string"?value:value?.url;if(!imageUrl)throw new Error("no image");return {imageUrl};
  }finally{await Promise.all(files.map(p=>fs.unlink(p).catch(()=>{})))}
}
