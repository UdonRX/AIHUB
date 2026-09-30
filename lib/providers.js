async function checkSearxInstance(base){
  const u=new URL(base+"/search");
  u.searchParams.set("q","AIHUB");
  u.searchParams.set("language","ja");
  u.searchParams.set("safesearch","1");
  u.searchParams.set("categories","general");
  try{
    const jsonUrl=new URL(u);jsonUrl.searchParams.set("format","json");
    const jr=await timeout(fetch(jsonUrl,{headers:{Accept:"application/json","user-agent":"AIHUB/1.0"}}));
    const jt=await jr.text();
    if(jr.ok){
      try{
        const data=jt?JSON.parse(jt):null;
        if(Array.isArray(data?.results)&&data.results.length)return {ok:true,detail:"JSON検索OK"};
      }catch{}
    }
    const hr=await timeout(fetch(u,{headers:{Accept:"text/html","user-agent":"AIHUB/1.0"}}));
    if(hr.ok){
      const results=parseSearxHtml(await hr.text());
      if(results.length)return {ok:true,detail:"HTML検索OK"};
    }
    if(jr.status===429||hr.status===429)return {ok:false,detail:"HTTP 429 レート制限"};
    if(jr.ok&&jt.trim().startsWith("<"))return {ok:false,detail:"JSON要求にHTMLが返った"};
    return {ok:false,detail:"検索結果0件"};
  }catch(e){return {ok:false,detail:e?.code||"failed"}}
}

export async function checkSearxng(){
  const instances=await getSearxngInstances();
  const failures=[];
  for(const base of instances){
    const check=await checkSearxInstance(base);
    if(check.ok)return {ok:true,instance:base,detail:check.detail};
    failures.push(base+":"+check.detail);
  }
  return {ok:false,detail:failures.join(",")};
}
export async function searxng(query){
  const q=String(query||"").trim().slice(0,500);if(!q)throw new Error("search query required");
  const instances=await getSearxngInstances();
  const failures=[];
  for(const base of instances){
    try{
      const u=new URL(base+"/search");u.searchParams.set("q",q);u.searchParams.set("language","ja");u.searchParams.set("safesearch","1");u.searchParams.set("categories","general");
      const jsonUrl=new URL(u);jsonUrl.searchParams.set("format","json");
      const jr=await timeout(fetch(jsonUrl,{headers:{Accept:"application/json","user-agent":"AIHUB/1.0"}}));
      if(jr.ok){
        try{
          const d=await jr.json();
          if(Array.isArray(d?.results)&&d.results.length){
            return d.results.slice(0,8).map(x=>({title:String(x.title||"Untitled"),url:String(x.url||""),description:String(x.content||x.description||"")}));
          }
        }catch{}
      }
      const hr=await timeout(fetch(u,{headers:{Accept:"text/html","user-agent":"AIHUB/1.0"}}));
      if(hr.ok){
        const results=parseSearxHtml(await hr.text());
        if(results.length)return results;
      }
      failures.push(base+":"+((jr.status===429||hr.status===429)?"429":"no_results"));
    }catch(e){failures.push(base+":"+(e?.code||"failed"))}
  }
  const e=new Error("search unavailable");e.status=503;e.failures=failures;throw e;
}


