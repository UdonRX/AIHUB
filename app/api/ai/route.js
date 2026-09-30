import {NextResponse} from "next/server";
import {runCategory} from "../../../lib/router";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request){
  try{
    const b=await request.json();const category=b?.category;const prompt=typeof b?.prompt==="string"?b.prompt.trim():"";const images=Array.isArray(b?.images)?b.images:[];
    if(!["search","code","image"].includes(category))return NextResponse.json({error:"ジャンルを選択してください。"}, {status:400});
    if(!prompt||prompt.length>30000)return NextResponse.json({error:"入力内容が空、または長すぎます。"}, {status:400});
    if(images.length>10||images.some(x=>typeof x!=="string"||!x.startsWith("data:image/")||x.length>9000000))return NextResponse.json({error:"画像の数またはサイズが大きすぎます。"}, {status:400});
    return NextResponse.json(await runCategory({category,prompt,images}));
  }catch(e){
    const msg=e?.message==="NO_FREE_PROVIDER"||e?.message==="NO_FREE_IMAGE_PROVIDER"?"現在利用できる無料AIがありません。":"処理に失敗しました。しばらくしてからもう一度試してください。";
    return NextResponse.json({error:msg},{status:503});
  }
}
