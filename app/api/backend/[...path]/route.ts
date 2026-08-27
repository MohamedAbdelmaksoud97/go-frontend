import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { toPublicApiProblem } from "@/lib/api-problem"

const API_BASE=(process.env.API_BASE_URL??process.env.NEXT_PUBLIC_API_BASE_URL??"http://127.0.0.1:3001").replace(/\/$/,"")
async function proxy(request:Request,{params}:{params:Promise<{path:string[]}>}){
 const {path}=await params;const incoming=new URL(request.url);const targetPath=`/${path.join("/")}${incoming.search}`;if(targetPath.startsWith("/hooks/"))return NextResponse.json(toPublicApiProblem({code:"server_hook_forbidden"},403,request.headers.get("x-correlation-id")??undefined),{status:403})
 const headers=new Headers();for(const name of ["accept","content-type","x-correlation-id","idempotency-key","x-device-id"]) {const value=request.headers.get(name);if(value)headers.set(name,value)}
 const store=await cookies();const token=store.get("go_access_token")?.value
 const body=["GET","HEAD"].includes(request.method)?undefined:await request.arrayBuffer()
 const forward=(accessToken?:string)=>{if(accessToken)headers.set("authorization",`Bearer ${accessToken}`);else headers.delete("authorization");return fetch(`${API_BASE}${targetPath}`,{method:request.method,headers,body,cache:"no-store",redirect:"manual"})}
 // Keep refresh-token rotation out of this highly parallel proxy. The browser
 // coordinates one refresh request across API calls and tabs, then retries.
 let response:Response
 try{response=await forward(token)}catch{return NextResponse.json(toPublicApiProblem({code:"backend_unavailable"},503,request.headers.get("x-correlation-id")??undefined),{status:503})}
 const outHeaders=new Headers();for(const name of ["content-type","x-correlation-id","retry-after"]) {const value=response.headers.get(name);if(value)outHeaders.set(name,value)}
 if(!response.ok){const payload=await response.json().catch(()=>null);const problem=toPublicApiProblem(payload,response.status,response.headers.get("x-correlation-id")??request.headers.get("x-correlation-id")??undefined);return NextResponse.json(problem,{status:response.status,headers:outHeaders})}
 return new NextResponse(response.body,{status:response.status,headers:outHeaders})
}
export const GET=proxy;export const POST=proxy;export const PATCH=proxy;export const PUT=proxy;export const DELETE=proxy
