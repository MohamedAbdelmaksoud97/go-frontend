import { cookies } from "next/headers"
import { NextResponse } from "next/server"

const API_BASE=(process.env.API_BASE_URL??process.env.NEXT_PUBLIC_API_BASE_URL??"http://127.0.0.1:3001").replace(/\/$/,"")
async function proxy(request:Request,{params}:{params:Promise<{path:string[]}>}){
 const {path}=await params;const incoming=new URL(request.url);const targetPath=`/${path.join("/")}${incoming.search}`;if(targetPath.startsWith("/hooks/"))return NextResponse.json({type:"about:blank",title:"Forbidden",status:403,detail:"Server hooks cannot be called from the browser.",code:"server_hook_forbidden"},{status:403})
 const headers=new Headers();for(const name of ["accept","content-type","x-correlation-id","idempotency-key","x-device-id"]) {const value=request.headers.get(name);if(value)headers.set(name,value)}
 const token=(await cookies()).get("go_access_token")?.value;if(token)headers.set("authorization",`Bearer ${token}`)
 const response=await fetch(`${API_BASE}${targetPath}`,{method:request.method,headers,body:["GET","HEAD"].includes(request.method)?undefined:await request.arrayBuffer(),cache:"no-store",redirect:"manual"})
 const outHeaders=new Headers();for(const name of ["content-type","x-correlation-id","retry-after"]) {const value=response.headers.get(name);if(value)outHeaders.set(name,value)}
 return new NextResponse(response.body,{status:response.status,headers:outHeaders})
}
export const GET=proxy;export const POST=proxy;export const PATCH=proxy;export const PUT=proxy;export const DELETE=proxy
