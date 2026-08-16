import { cookies } from "next/headers"
import { NextResponse } from "next/server"

const API_BASE=(process.env.API_BASE_URL??process.env.NEXT_PUBLIC_API_BASE_URL??"http://127.0.0.1:3001").replace(/\/$/,"")
const cookieOptions={httpOnly:true,sameSite:"lax" as const,secure:process.env.NODE_ENV==="production",path:"/"}

export async function POST(request:Request,{params}:{params:Promise<{audience:string}>}){
 const {audience}=await params
 const target=audience==="staff"?"/api/v1/auth/staff/password/sign-ins":audience==="member"?"/api/v1/auth/member/password/sign-ins":audience==="member-test"&&process.env.NEXT_PUBLIC_MEMBER_TEST_EMAIL_LOGIN==="true"?"/api/v1/auth/member/test-email/password/sign-ins":undefined
 if(!target)return NextResponse.json({type:"about:blank",title:"Not found",status:404,detail:"Unknown login audience.",code:"not_found"},{status:404})
 const body=await request.text()
 const headers=new Headers({"content-type":"application/json",accept:"application/json"})
 for(const name of ["x-correlation-id","x-device-id","x-forwarded-for"]){const value=request.headers.get(name);if(value)headers.set(name,value)}
 const response=await fetch(`${API_BASE}${target}`,{method:"POST",headers,body,cache:"no-store"})
 const payload=await response.json().catch(()=>null)
 if(!response.ok)return NextResponse.json(payload??{type:"about:blank",title:"Login failed",status:response.status,detail:"Unable to sign in.",code:"login_failed"},{status:response.status})
 const session=payload?.data as {accessToken?:string;refreshToken?:string;expiresIn?:number;requiresMfa?:boolean}|undefined
 if(!session?.accessToken||!session.refreshToken)return NextResponse.json({type:"about:blank",title:"Invalid response",status:502,detail:"The authentication service returned an invalid session.",code:"invalid_auth_response"},{status:502})
 const store=await cookies()
 store.set("go_access_token",session.accessToken,{...cookieOptions,maxAge:session.expiresIn??3600})
 store.set("go_refresh_token",session.refreshToken,{...cookieOptions,maxAge:60*60*24*30})
 return NextResponse.json({data:{authenticated:true,requiresMfa:session.requiresMfa===true}})
}
