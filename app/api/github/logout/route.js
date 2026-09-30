import {NextResponse} from "next/server";
import {clearSessionCookie} from "../../../../lib/github";
export async function POST(){
  const r=NextResponse.json({ok:true});r.headers.append("Set-Cookie",clearSessionCookie());return r;
}
