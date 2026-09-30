import {NextResponse} from "next/server";
import {githubConfigured,makeState,stateCookie} from "../../../../lib/github";
export const runtime="nodejs";
export async function GET(request){
  if(!githubConfigured())return NextResponse.json({error:"GitHub連携の設定がまだありません。"}, {status:503});
  const state=makeState();
  const url=new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id",process.env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri",process.env.GITHUB_CALLBACK_URL||new URL("/api/github/callback",request.url).toString());
  url.searchParams.set("scope",process.env.GITHUB_OAUTH_SCOPE||"repo");
  url.searchParams.set("state",state);
  const r=NextResponse.redirect(url);
  r.headers.append("Set-Cookie",stateCookie(state));
  return r;
}
