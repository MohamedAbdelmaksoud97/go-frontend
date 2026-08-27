import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { toPublicApiProblem } from "@/lib/api-problem"
import { accessTokenCookieOptions,refreshTokenCookieOptions } from "@/lib/server-session"

const API_BASE=(process.env.API_BASE_URL??process.env.NEXT_PUBLIC_API_BASE_URL??"http://127.0.0.1:3001").replace(/\/$/,"")

export async function POST(request:Request,{params}:{params:Promise<{audience:string}>}){
 const {audience}=await params
 const target=audience==="staff"?"/api/v1/auth/staff/password/sign-ins":audience==="member"?"/api/v1/auth/member/password/sign-ins":audience==="member-test"&&process.env.NEXT_PUBLIC_MEMBER_TEST_EMAIL_LOGIN==="true"?"/api/v1/auth/member/test-email/password/sign-ins":undefined
 const correlationId=request.headers.get("x-correlation-id")??undefined
 if(!target)return NextResponse.json(toPublicApiProblem({code:"not_found"},404,correlationId),{status:404})
 const body=await request.text()
 const headers=new Headers({"content-type":"application/json",accept:"application/json"})
 for(const name of ["x-correlation-id","x-device-id","x-forwarded-for"]){const value=request.headers.get(name);if(value)headers.set(name,value)}
 let response:Response
 try{response=await fetch(`${API_BASE}${target}`,{method:"POST",headers,body,cache:"no-store"})}catch{return NextResponse.json(toPublicApiProblem({code:"login_service_unavailable"},503,correlationId),{status:503})}
 const payload=await response.json().catch(()=>null)
 if(!response.ok)return NextResponse.json(toPublicApiProblem(payload,response.status,response.headers.get("x-correlation-id")??correlationId),{status:response.status})
 const session=payload?.data as {accessToken?:string;refreshToken?:string;expiresIn?:number;requiresMfa?:boolean}|undefined
 if(!session?.accessToken||!session.refreshToken)return NextResponse.json(toPublicApiProblem({code:"invalid_auth_response"},502,response.headers.get("x-correlation-id")??correlationId),{status:502})
 const store=await cookies()
 store.set("go_access_token",session.accessToken,accessTokenCookieOptions(session.expiresIn))
 store.set("go_refresh_token",session.refreshToken,refreshTokenCookieOptions)
 return NextResponse.json({data:{authenticated:true,requiresMfa:session.requiresMfa===true}},{headers:{"Cache-Control":"no-store"}})
}
