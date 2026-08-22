import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { refreshSessionOnce,sessionCookieOptions } from "@/lib/server-session"

export async function POST(){
 const store=await cookies()
 const refreshToken=store.get("go_refresh_token")?.value
 if(!refreshToken)return NextResponse.json({error:"refresh_unavailable"},{status:401})
 const result=await refreshSessionOnce(refreshToken)
 if(!result.ok){
  const invalidSession=[400,401,403].includes(result.status)
  if(invalidSession){store.delete("go_access_token");store.delete("go_refresh_token")}
  return NextResponse.json({error:invalidSession?"refresh_failed":"refresh_temporarily_unavailable"},{status:invalidSession?401:result.status})
 }
 store.set("go_access_token",result.session.accessToken,sessionCookieOptions)
 store.set("go_refresh_token",result.session.refreshToken,sessionCookieOptions)
 return NextResponse.json({data:{authenticated:true}})
}
