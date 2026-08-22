import { createHash } from "node:crypto"

const API_BASE=(process.env.API_BASE_URL??process.env.NEXT_PUBLIC_API_BASE_URL??"http://127.0.0.1:3001").replace(/\/$/,"")

export const SESSION_MAX_AGE_SECONDS=60*60*24*7
export const sessionCookieOptions={
 httpOnly:true,
 sameSite:"lax" as const,
 secure:process.env.NODE_ENV==="production",
 path:"/",
 maxAge:SESSION_MAX_AGE_SECONDS,
 priority:"high" as const,
}

export type RefreshedSession={accessToken:string;refreshToken:string;expiresIn?:number}
type RefreshResult={ok:true;session:RefreshedSession}|{ok:false;status:number}
type CachedRefresh={expiresAt:number;request:Promise<RefreshResult>}

// Supabase rotates refresh tokens. Keep one refresh operation per token so that
// parallel dashboard requests and multiple tabs cannot invalidate each other.
const refreshes=new Map<string,CachedRefresh>()
const REFRESH_DEDUPLICATION_WINDOW_MS=30_000

function keyFor(refreshToken:string){return createHash("sha256").update(refreshToken).digest("hex")}

async function requestRefreshedSession(refreshToken:string):Promise<RefreshResult>{
 try{
  const response=await fetch(`${API_BASE}/api/v1/auth/sessions/refreshes`,{
   method:"POST",
   headers:{"Content-Type":"application/json",Accept:"application/json"},
   body:JSON.stringify({refreshToken}),
   cache:"no-store",
  })
  if(!response.ok)return {ok:false,status:response.status}
  const payload=await response.json().catch(()=>null)
  const session=payload?.data as {accessToken?:string;refreshToken?:string;expiresIn?:number}|undefined
  if(!session?.accessToken||!session.refreshToken)return {ok:false,status:502}
  return {ok:true,session:{accessToken:session.accessToken,refreshToken:session.refreshToken,...(session.expiresIn===undefined?{}:{expiresIn:session.expiresIn})}}
 }catch{return {ok:false,status:503}}
}

export function refreshSessionOnce(refreshToken:string):Promise<RefreshResult>{
 const now=Date.now()
 for(const [key,value] of refreshes)if(value.expiresAt<=now)refreshes.delete(key)
 const key=keyFor(refreshToken)
 const existing=refreshes.get(key)
 if(existing&&existing.expiresAt>now)return existing.request
 const request=requestRefreshedSession(refreshToken)
 refreshes.set(key,{request,expiresAt:now+REFRESH_DEDUPLICATION_WINDOW_MS})
 void request.then(result=>{if(!result.ok&&refreshes.get(key)?.request===request)refreshes.delete(key)})
 return request
}
