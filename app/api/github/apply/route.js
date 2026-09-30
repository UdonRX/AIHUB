import {NextResponse} from "next/server";
import {githubFetch,readSession,repoName} from "../../../../lib/github";
import {runCodeModel} from "../../../../lib/router";
export const runtime="nodejs";
export const dynamic="force-dynamic";

function jsonFromText(text){
  const s=String(text||"").trim().replace(/^\`\`\`(?:json)?/i,"").replace(/\`\`\`$/,"").trim();
  try{return JSON.parse(s)}catch{
    const a=s.indexOf("{"),b=s.lastIndexOf("}");
    if(a>=0&&b>a)try{return JSON.parse(s.slice(a,b+1))}catch{}
    return null;
  }
}
function isTextPath(p){
  return /\.(js|jsx|ts|tsx|mjs|cjs|json|css|scss|md|mdx|html|yml|yaml|txt|py|go|rs|java|kt|swift|vue|svelte|sql|sh)$/i.test(p)
    && !/(^|\/)(node_modules|\.next|dist|build|coverage)(\/|$)/.test(p);
}
export async function POST(request){
  const token=readSession(request);
  if(!token)return NextResponse.json({error:"先にGitHubへ接続して。"}, {status:401});
  try{
    const b=await request.json(),repo=repoName(b?.repo),prompt=typeof b?.prompt==="string"?b.prompt.trim():"";
    if(!repo)return NextResponse.json({error:"GitHubリポジトリは owner/repo 形式で入力して。"}, {status:400});
    if(!prompt||prompt.length>12000)return NextResponse.json({error:"指示が空、または長すぎます。"}, {status:400});

    const meta=await githubFetch(token,`/repos/${repo}`);
    const branch=meta.default_branch;
    const tree=await githubFetch(token,`/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    const paths=(tree.tree||[]).filter(x=>x.type==="blob"&&isTextPath(x.path)).map(x=>x.path).slice(0,500);
    if(!paths.length)return NextResponse.json({error:"編集できるテキストファイルが見つかりません。"}, {status:400});

    const plan=await runCodeModel([
      {role:"system",content:"あなたはGitHubコード変更の計画担当。ユーザーの指示から、変更が必要なファイルだけを選ぶ。返答はJSONのみ。形式: {\"files\":[\"path\",...]}. 最大8ファイル。存在しないファイルは選ばない。関係ないファイルは絶対に選ばない。"},
      {role:"user",content:"リポジトリ: "+repo+"\nブランチ: "+branch+"\nユーザー指示:\n"+prompt+"\n\nファイル一覧:\n"+paths.join("\n")}
    ]);
    const selected=jsonFromText(plan.text)?.files;
    const chosen=Array.isArray(selected)?selected.filter(x=>paths.includes(x)).slice(0,8):[];
    if(!chosen.length)throw new Error("変更対象ファイルを特定できませんでした");

    const fetched=await Promise.all(chosen.map(async path=>{
      const f=await githubFetch(token,`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
      if(f.encoding!=="base64"||!f.content)throw new Error("ファイルを読めませんでした: "+path);
      const content=Buffer.from(f.content.replace(/\n/g,""),"base64").toString("utf8");
      return {path,sha:f.sha,content:content.slice(0,70000)};
    }));
    const total=fetched.reduce((n,x)=>n+x.content.length,0);
    if(total>220000)throw new Error("対象コードが大きすぎるため、安全のため停止しました。");

    const patch=await runCodeModel([
      {role:"system",content:"あなたは熟練したコード編集AI。与えられた既存ファイルだけを必要最小限変更する。既存機能を壊さない。返答はJSONのみ。形式: {\"changes\":[{\"path\":\"既存パス\",\"content\":\"ファイル全体\"}]}. 変更不要なファイルは含めない。省略記号や擬似コードは禁止。秘密情報やAPIキーをコードに書かない。"},
      {role:"user",content:"リポジトリ: "+repo+"\n変更指示:\n"+prompt+"\n\n既存ファイル:\n"+fetched.map(x=>"===== "+x.path+" =====\n"+x.content).join("\n\n")}
    ]);
    const changes=jsonFromText(patch.text)?.changes;
    if(!Array.isArray(changes)||!changes.length)throw new Error("AIが安全な変更案を返しませんでした。");
    const valid=changes.filter(x=>x&&chosen.includes(x.path)&&typeof x.content==="string"&&x.content.length<=120000);
    if(!valid.length)throw new Error("AIが有効なファイル変更を返しませんでした。");

    const commits=[];
    for(const change of valid){
      const current=fetched.find(x=>x.path===change.path);
      if(change.content===current.content)continue;
      const r=await githubFetch(token,`/repos/${repo}/contents/${change.path}`,{
        method:"PUT",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({message:"AI HUB: "+prompt.slice(0,60),content:Buffer.from(change.content,"utf8").toString("base64"),sha:current.sha,branch})
      });
      commits.push({path:change.path,sha:r.commit?.sha||null});
    }
    if(!commits.length)return NextResponse.json({ok:true,repo,branch,changedFiles:[],message:"変更は必要ないとAIが判断しました。"});
    return NextResponse.json({ok:true,repo,branch,changedFiles:commits.map(x=>x.path),commit:commits[commits.length-1].sha});
  }catch(e){
    const status=e?.status===401?401:e?.status===403?403:500;
    return NextResponse.json({error:e?.message||"GitHubへの反映に失敗しました。"}, {status});
  }
}
