import {NextResponse} from "next/server";
import {clearStateCookie,exchangeCode,readCookie,sessionCookie} from "../../../../lib/github";
export const runtime="nodejs";
export async function GET(request){
  const url=new URL(request.url),code=url.searchParams.get("code"),state=url.searchParams.get("state");
  const saved=readCookie(request,"aihub_github_state");
  if(!code||!state||!saved||state!==saved)return NextResponse.json({error:"GitHub認証の確認に失敗しました。"}, {status:400});
  try{
    const token=await exchangeCode(code);
    const r=NextResponse.redirect(new URL("/?github=connected",request.url));
    r.headers.append("Set-Cookie",sessionCookie(token));
    r.headers.append("Set-Cookie",clearStateCookie());
    return r;
  }catch(e){return NextResponse.json({error:e.message||"GitHub認証に失敗しました。"}, {status:502})}
}
