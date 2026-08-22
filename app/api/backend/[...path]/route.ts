import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { refreshSessionOnce,sessionCookieOptions,type RefreshedSession } from "@/lib/server-session"

const API_BASE=(process.env.API_BASE_URL??process.env.NEXT_PUBLIC_API_BASE_URL??"http://127.0.0.1:3001").replace(/\/$/,"")
async function proxy(request:Request,{params}:{params:Promise<{path:string[]}>}){
 const {path}=await params;const incoming=new URL(request.url);const targetPath=`/${path.join("/")}${incoming.search}`;if(targetPath.startsWith("/hooks/"))return NextResponse.json({type:"about:blank",title:"Forbidden",status:403,detail:"Server hooks cannot be called from the browser.",code:"server_hook_forbidden"},{status:403})
 const headers=new Headers();for(const name of ["accept","content-type","x-correlation-id","idempotency-key","x-device-id"]) {const value=request.headers.get(name);if(value)headers.set(name,value)}
 const store=await cookies();const token=store.get("go_access_token")?.value;const refreshToken=store.get("go_refresh_token")?.value
 const body=["GET","HEAD"].includes(request.method)?undefined:await request.arrayBuffer()
 const forward=(accessToken?:string)=>{if(accessToken)headers.set("authorization",`Bearer ${accessToken}`);else headers.delete("authorization");return fetch(`${API_BASE}${targetPath}`,{method:request.method,headers,body,cache:"no-store",redirect:"manual"})}
 let response=await forward(token)
 let refreshedSession:RefreshedSession|undefined
 if(response.status===401&&refreshToken){
  const refreshed=await refreshSessionOnce(refreshToken)
  if(refreshed.ok){await response.body?.cancel().catch(()=>undefined);refreshedSession=refreshed.session;response=await forward(refreshed.session.accessToken)}
  else if(![400,401,403].includes(refreshed.status))return NextResponse.json({type:"about:blank",title:"تعذر تجديد الجلسة مؤقتًا",status:refreshed.status,detail:"تعذر الاتصال بخدمة الجلسات الآن. أعد المحاولة بعد قليل دون تسجيل الخروج.",code:"session_refresh_temporarily_unavailable"},{status:refreshed.status,headers:{"Retry-After":"2"}})
 }
 const outHeaders=new Headers();for(const name of ["content-type","x-correlation-id","retry-after"]) {const value=response.headers.get(name);if(value)outHeaders.set(name,value)}
 const outgoing=new NextResponse(response.body,{status:response.status,headers:outHeaders})
 if(refreshedSession){outgoing.cookies.set("go_access_token",refreshedSession.accessToken,sessionCookieOptions);outgoing.cookies.set("go_refresh_token",refreshedSession.refreshToken,sessionCookieOptions)}
 return outgoing
}
export const GET=proxy;export const POST=proxy;export const PATCH=proxy;export const PUT=proxy;export const DELETE=proxy
