import {NextResponse} from "next/server";
import {runCategory} from "../../../lib/router";
export const runtime="nodejs";
export const dynamic="force-dynamic";

function errorInfo(e){
  if(!e)return {message:"unknown",code:"unknown",status:null};
  return {
    message:String(e?.message||"unknown").slice(0,500),
    code:e?.code||null,
    status:e?.status||null,
    reason:e?.reason||null
  };
}

export async function POST(request){
  const debugId=crypto.randomUUID();
  const started=Date.now();
  try{
    const b=await request.json();
    const category=b?.category;
    const prompt=typeof b?.prompt==="string"?b.prompt.trim():"";
    const images=Array.isArray(b?.images)?b.images:[];

    console.log(JSON.stringify({
      event:"ai_request_start",
      debugId,
      category,
      promptLength:prompt.length,
      imageCount:images.length,
      imageSizes:images.map(x=>typeof x==="string"?x.length:0),
      timestamp:new Date().toISOString()
    }));

    if(!["search","code","image"].includes(category)){
      console.warn(JSON.stringify({event:"ai_request_validation_error",debugId,reason:"invalid_category",category}));
      return NextResponse.json({error:"ジャンルを選択してください。",debugId},{status:400});
    }
    if(!prompt||prompt.length>30000){
      console.warn(JSON.stringify({event:"ai_request_validation_error",debugId,reason:"invalid_prompt",promptLength:prompt.length}));
      return NextResponse.json({error:"入力内容が空、または長すぎます。",debugId},{status:400});
    }
    if(images.length>10||images.some(x=>typeof x!=="string"||!x.startsWith("data:image/")||x.length>9000000)){
      console.warn(JSON.stringify({event:"ai_request_validation_error",debugId,reason:"invalid_images",imageCount:images.length}));
      return NextResponse.json({error:"画像の数またはサイズが大きすぎます。",debugId},{status:400});
    }

    const result=await runCategory({category,prompt,images,debugId});

    console.log(JSON.stringify({
      event:"ai_request_success",
      debugId,
      category,
      provider:result?.provider||null,
      receivedImages:result?.receivedImages??null,
      duration:Date.now()-started,
      timestamp:new Date().toISOString()
    }));

    return NextResponse.json({...result,debugId},{headers:{"x-aihub-debug-id":debugId}});
  }catch(e){
    const info=errorInfo(e);
    console.error(JSON.stringify({
      event:"ai_request_error",
      debugId,
      category,
      duration:Date.now()-started,
      error:info,
      failures:e?.failures||null,
      cause:errorInfo(e?.cause),
      timestamp:new Date().toISOString()
    }));

    const msg=e?.message==="NO_FREE_PROVIDER"||e?.message==="NO_FREE_IMAGE_PROVIDER"
      ?"現在利用できる無料AIがありません。"
      :"処理に失敗しました。しばらくしてからもう一度試してください。";

    return NextResponse.json({error:msg,debugId},{status:503,headers:{"x-aihub-debug-id":debugId}});
  }
}
