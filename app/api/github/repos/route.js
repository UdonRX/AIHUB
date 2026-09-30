import {NextResponse} from "next/server";
import {githubConfigured,readSession,githubFetch} from "../../../../lib/github";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request){
  if(!githubConfigured())return NextResponse.json({configured:false,repos:[]});
  const token=readSession(request);
  if(!token)return NextResponse.json({connected:false,repos:[]},{status:401});
  try{const repos=await githubFetch(token,"/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member");return NextResponse.json({repos:(repos||[]).map(r=>({full_name:r.full_name,name:r.name,private:r.private,default_branch:r.default_branch}))})}catch(e){return NextResponse.json({error:e.message||"リポジトリ取得に失敗しました。",repos:[]},{status:e?.status||500})}}
