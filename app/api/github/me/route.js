import {NextResponse} from "next/server";
import {githubConfigured,readSession,githubFetch} from "../../../../lib/github";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request){
  if(!githubConfigured())return NextResponse.json({configured:false,connected:false});
  const token=readSession(request);
  if(!token)return NextResponse.json({configured:true,connected:false});
  try{
    const me=await githubFetch(token,"/user");
    return NextResponse.json({configured:true,connected:true,user:{login:me.login,name:me.name||me.login,avatar:me.avatar_url}});
  }catch{return NextResponse.json({configured:true,connected:false})}
}
