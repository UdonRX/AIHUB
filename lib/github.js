import crypto from "node:crypto";

const API="https://api.github.com";
const COOKIE="aihub_github_session";
const STATE_COOKIE="aihub_github_state";

function secret(){
  const s=process.env.GITHUB_SESSION_SECRET;
  if(!s)throw new Error("GITHUB_SESSION_SECRET is not configured");
  return crypto.createHash("sha256").update(s).digest();
}
function b64(buf){return Buffer.from(buf).toString("base64url")}
function unb64(s){return Buffer.from(s,"base64url")}
export function makeState(){return b64(crypto.randomBytes(24))}
export function stateCookie(state){return `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`}
export function clearStateCookie(){return `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}
export function sessionCookie(token){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",secret(),iv);
  const enc=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
  return `${COOKIE}=${b64(Buffer.concat([iv,cipher.getAuthTag(),enc]))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
}
export function clearSessionCookie(){return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}
export function readCookie(request,name){
  const raw=request.headers.get("cookie")||"";
  for(const part of raw.split(";")){
    const [k,...v]=part.trim().split("=");
    if(k===name)return v.join("=");
  }
  return null;
}
export function readSession(request){
  const value=readCookie(request,COOKIE);
  if(!value)return null;
  try{
    const b=unb64(value);const iv=b.subarray(0,12),tag=b.subarray(12,28),enc=b.subarray(28);
    const decipher=crypto.createDecipheriv("aes-256-gcm",secret(),iv);decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc),decipher.final()]).toString("utf8");
  }catch{return null}
}
export function githubConfigured(){
  return Boolean(process.env.GITHUB_CLIENT_ID&&process.env.GITHUB_CLIENT_SECRET&&process.env.GITHUB_SESSION_SECRET);
}
export async function githubFetch(token,path,options={}){
  const headers={"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",...(options.headers||{})};
  if(token)headers.Authorization=`Bearer ${token}`;
  const r=await fetch(API+path,{...options,headers,cache:"no-store"});
  const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
  if(!r.ok){const e=new Error(data?.message||`GitHub API error ${r.status}`);e.status=r.status;throw e}
  return data;
}
export function repoName(value){
  const s=String(value||"").trim().replace(/^https?:\\/\\/github\\.com\\//,"").replace(/\\.git$/,"").replace(/^\\//,"");
  if(!/^[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+$/.test(s))return null;
  return s;
}
export async function exchangeCode(code){
  const r=await fetch("https://github.com/login/oauth/access_token",{
    method:"POST",headers:{"Accept":"application/json","content-type":"application/json"},
    body:JSON.stringify({client_id:process.env.GITHUB_CLIENT_ID,client_secret:process.env.GITHUB_CLIENT_SECRET,code})
  });
  const d=await r.json();
  if(!r.ok||!d.access_token)throw new Error(d.error_description||"GitHub認証に失敗しました");
  return d.access_token;
}
