import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { toPublicApiProblem } from "@/lib/api-problem"
import { accessTokenCookieOptions,refreshSessionOnce,refreshTokenCookieOptions } from "@/lib/server-session"

export async function POST(){
 const store=await cookies()
 const refreshToken=store.get("go_refresh_token")?.value
 if(!refreshToken)return NextResponse.json(toPublicApiProblem({code:"refresh_unavailable"},401),{status:401})
 const result=await refreshSessionOnce(refreshToken)
 if(!result.ok){
  const invalidSession=[400,401,403].includes(result.status)
  if(invalidSession){store.delete("go_access_token");store.delete("go_refresh_token")}
  const status=invalidSession?401:result.status
  return NextResponse.json(toPublicApiProblem({code:invalidSession?"refresh_failed":"refresh_temporarily_unavailable"},status),{status})
 }
 store.set("go_access_token",result.session.accessToken,accessTokenCookieOptions(result.session.expiresIn))
 store.set("go_refresh_token",result.session.refreshToken,refreshTokenCookieOptions)
 return NextResponse.json({data:{authenticated:true}},{headers:{"Cache-Control":"no-store"}})
}
