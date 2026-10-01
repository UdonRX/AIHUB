import {searxng,cloudflare,gemini,groq,hfImage,openrouter,retryable,checkSearxng,checkGemini,checkGroq,checkOpenrouter,checkCloudflare,checkHuggingFace,getGroqUsage,checkOpenrouterCredits,groqWithRateCache} from "./providers";

const TEXT_PROVIDERS={
  search:[["gemini",gemini],["groq",groqWithRateCache],["openrouter",openrouter],["cloudflare",cloudflare]],
  code:[["groq",groqWithRateCache],["gemini",gemini],["openrouter",openrouter],["cloudflare",cloudflare]]
};

function logImage(event,data={}){
  console.log(JSON.stringify({
    event:"image_ai_"+event,
    ...data,
    timestamp:new Date().toISOString()
  }));
}

function errorSummary(e){
  return {
    message:String(e?.message||"unknown").slice(0,500),
    code:e?.code||null,
    status:e?.status||null,
    reason:e?.reason||null
  };
}

export async function runCodeModel(messages){ return fallback("code",messages); }

async function fallback(category,messages){
  const failures=[];
  for(const [name,call] of TEXT_PROVIDERS[category]){
    try{const r=await call(messages);return {...r,provider:name,failures}}
    catch(e){if(e?.code==="DISABLED")continue;failures.push({provider:name,reason:retryable(e)?"unavailable":"failed"});if(!retryable(e))continue}
  }
  throw Object.assign(new Error("NO_FREE_PROVIDER"),{failures});
}

export async function runCategory({category,prompt,images=[],debugId=null}){
  if(!["search","code","image"].includes(category))throw new Error("invalid category");
  if(!prompt.trim())throw new Error("prompt required");

  if(category==="image"){
    logImage("request",{
      debugId,
      promptLength:prompt.length,
      imageCount:images.length,
      imageSizes:images.map(x=>typeof x==="string"?x.length:0),
      env:{
        HF_TOKEN:Boolean(process.env.HF_TOKEN),
        HF_SPACE_ID:process.env.HF_SPACE_ID||"Qwen/Qwen-Image-2.1",
        HF_IMAGE_API_NAME:process.env.HF_IMAGE_API_NAME||"/generate_request",
        CLOUDFLARE_ACCOUNT_ID:Boolean(process.env.CLOUDFLARE_ACCOUNT_ID),
        CLOUDFLARE_API_TOKEN:Boolean(process.env.CLOUDFLARE_API_TOKEN),
        CLOUDFLARE_IMAGE_MODEL:process.env.CLOUDFLARE_IMAGE_MODEL||"@cf/black-forest-labs/flux-1-schnell"
      }
    });

    try{
      logImage("huggingface_start",{debugId});
      const result=await hfImage({prompt,images,debugId});
      logImage("huggingface_success",{debugId,receivedImages:result?.receivedImages??null});
      return {category,provider:"huggingface-zerogpu",...result};
    }catch(e){
      logImage("huggingface_failed",{debugId,error:errorSummary(e),cause:errorSummary(e?.cause)});

      const model=process.env.CLOUDFLARE_IMAGE_MODEL||"@cf/black-forest-labs/flux-1-schnell";
      if(images.length===0&&model&&process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN){
        logImage("cloudflare_fallback_start",{debugId,model});
        try{
          const r=await fetch("https://api.cloudflare.com/client/v4/accounts/"+process.env.CLOUDFLARE_ACCOUNT_ID+"/ai/run/"+model,{
            method:"POST",
            headers:{Authorization:"Bearer "+process.env.CLOUDFLARE_API_TOKEN,"content-type":"application/json"},
            body:JSON.stringify({prompt})
          });
          const body=await r.text();
          let d=null;
          try{d=body?JSON.parse(body):null}catch{}
          logImage("cloudflare_fallback_response",{
            debugId,
            model,
            httpStatus:r.status,
            ok:r.ok,
            responseBytes:body.length,
            cloudflareSuccess:d?.success??null,
            cloudflareErrors:Array.isArray(d?.errors)?d.errors.map(x=>({code:x?.code,message:String(x?.message||"").slice(0,300)})):[],
            hasImage:Boolean(typeof d?.result?.image==="string")
          });
          if(r.ok){
            const img=d?.result?.image;
            if(typeof img==="string")return {category,provider:"cloudflare",imageUrl:img.startsWith("data:")?img:"data:image/png;base64,"+img};
          }
        }catch(cfError){
          logImage("cloudflare_fallback_failed",{debugId,error:errorSummary(cfError)});
        }
      }else{
        logImage("cloudflare_fallback_skipped",{
          debugId,
          reason:images.length>0?"reference_image_present":"cloudflare_credentials_missing"
        });
      }

      const finalError=Object.assign(new Error("NO_FREE_IMAGE_PROVIDER"),{
        cause:e,
        debugId
      });
      logImage("no_provider",{debugId,cause:errorSummary(e)});
      throw finalError;
    }
  }

  if(category==="search"){
    const sources=await searxng(prompt);
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
  const [search,geminiCheck,groqCheck,openrouterCheck,cloudflareCheck,hfCheck,openrouterCredits]=await Promise.all([
    checkSearxng(),
    checkGemini(),
    checkGroq(),
    checkOpenrouter(),
    checkCloudflare(),
    checkHuggingFace(),
    checkOpenrouterCredits()
  ]);
  console.log("[AI STATUS] SearXNG:",search.ok?"接続OK":"接続NG",search.detail||"");
  console.log("[AI STATUS] Gemini:",geminiCheck.ok?"設定OK":"未設定",geminiCheck.reason||"");
  console.log("[AI STATUS] Groq:",groqCheck.ok?"設定OK":"未設定",groqCheck.reason||"");
  console.log("[AI STATUS] OpenRouter Free:",openrouterCheck.ok?"設定OK":"未設定",openrouterCheck.reason||"");
  console.log("[AI STATUS] Cloudflare Workers AI:",cloudflareCheck.ok?"設定OK":"未設定",cloudflareCheck.reason||"");
  console.log("[AI STATUS] Hugging Face ZeroGPU:",hfCheck.ok?"接続OK":"接続NG",hfCheck.detail||hfCheck.reason||"");
  const row=(provider,check,remaining)=>({
    provider,
    status:check.ok?"available":"error",
    remaining:remaining||"",
    detail:check.ok?"設定OK":String(check.reason||check.detail||"接続失敗")
  });
  const groqUsage=getGroqUsage();
  return {paidAi:process.env.ALLOW_PAID_AI==="true",groups:{
    search:[
      {provider:"SearXNG",status:search.ok?"available":"error",remaining:"",detail:search.ok?"検索可能":search.detail},
      row("Gemini",geminiCheck,""),
      row("Groq",groqCheck,groqUsage.detail),
      row("OpenRouter Free",openrouterCheck,"無料枠 50回/日"),
      row("Cloudflare Workers AI",cloudflareCheck,"無料枠 10,000 Neurons/日")
    ],
    code:[
      row("Groq",groqCheck,groqUsage.detail),
      row("Gemini",geminiCheck,"API非公開"),
      row("OpenRouter Free",openrouterCheck,openrouterCredits.ok?openrouterCredits.remaining:"API非公開"),
      row("Cloudflare Workers AI",cloudflareCheck,"10,000 Neurons/日（残量API非公開）")
    ],
    image:[
      row("Hugging Face ZeroGPU",hfCheck,""),
      row("Cloudflare Workers AI",cloudflareCheck,"10,000 Neurons/日（残量API非公開）")
    ]
  }};
}
