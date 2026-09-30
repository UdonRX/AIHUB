import {brave,cloudflare,gemini,groq,hfImage,openrouter,retryable} from "./providers";

const TEXT_PROVIDERS={
  search:[["gemini",gemini],["groq",groq],["openrouter",openrouter],["cloudflare",cloudflare]],
  code:[["groq",groq],["gemini",gemini],["openrouter",openrouter],["cloudflare",cloudflare]]
};

async function fallback(category,messages){
  const failures=[];
  for(const [name,call] of TEXT_PROVIDERS[category]){
    try{const r=await call(messages);return {...r,provider:name,failures}}
    catch(e){if(e?.code==="DISABLED")continue;failures.push({provider:name,reason:retryable(e)?"unavailable":"failed"});if(!retryable(e))continue}
  }
  throw Object.assign(new Error("NO_FREE_PROVIDER"),{failures});
}

export async function runCategory({category,prompt,images=[]}){
  if(!["search","code","image"].includes(category))throw new Error("invalid category");
  if(!prompt.trim())throw new Error("prompt required");

  if(category==="image"){
    try{return {category,provider:"huggingface-zerogpu",...(await hfImage({prompt,images}))}}
    catch(e){
      const model=process.env.CLOUDFLARE_IMAGE_MODEL;
      if(model&&process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN){
        const r=await fetch("https://api.cloudflare.com/client/v4/accounts/"+process.env.CLOUDFLARE_ACCOUNT_ID+"/ai/run/"+model,{method:"POST",headers:{Authorization:"Bearer "+process.env.CLOUDFLARE_API_TOKEN,"content-type":"application/json"},body:JSON.stringify({prompt})});
        if(r.ok){const d=await r.json();const img=d?.result?.image;if(typeof img==="string")return {category,provider:"cloudflare",imageUrl:img.startsWith("data:")?img:"data:image/png;base64,"+img}}
      }
      throw Object.assign(new Error("NO_FREE_IMAGE_PROVIDER"),{cause:e});
    }
  }

  if(category==="search"){
    const sources=await brave(prompt);
    const joined=sources.map((x,i)=>"[SOURCE "+(i+1)+"] "+x.title+"\nURL: "+x.url+"\nSNIPPET: "+x.description).join("\n\n");
    const r=await fallback("search",[
      {role:"system",content:"検索結果だけを根拠に日本語で回答する。最初に質問への直接的な答え、その後に要点。URLは捏造しない。不確実な点は明示する。"},
      {role:"user",content:"質問:\n"+prompt+"\n\n検索結果:\n"+joined}
    ]);
    return {category,provider:r.provider,text:r.text,sources};
  }

  const r=await fallback("code",[
    {role:"system",content:"日本語のコードアシスタント。コード生成、説明、バグ修正、リファクタリング、エラー解析を実用的に行う。与えられていないGitHub変更を行ったとは言わない。"},
    {role:"user",content:prompt}
  ]);
  return {category,provider:r.provider,text:r.text};
}

export async function status(){
  const e={
    gemini:Boolean(process.env.GEMINI_API_KEY),groq:Boolean(process.env.GROQ_API_KEY),
    openrouter:Boolean(process.env.OPENROUTER_API_KEY),
    cloudflare:Boolean(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN),
    brave:Boolean(process.env.BRAVE_SEARCH_API_KEY),hf:Boolean(process.env.HF_TOKEN)
  };
  const row=(provider,on)=>({provider,status:on?"available":"disabled",remaining:"取得不可"});
  return {paidAi:process.env.ALLOW_PAID_AI==="true",groups:{
    search:[row("Brave Search",e.brave),row("Gemini",e.gemini),row("Groq",e.groq),row("OpenRouter Free",e.openrouter),row("Cloudflare Workers AI",e.cloudflare)],
    code:[row("Groq",e.groq),row("Gemini",e.gemini),row("OpenRouter Free",e.openrouter),row("Cloudflare Workers AI",e.cloudflare)],
    image:[row("Hugging Face ZeroGPU",e.hf),row("Cloudflare Workers AI",e.cloudflare&&Boolean(process.env.CLOUDFLARE_IMAGE_MODEL))]
  }};
}
