import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { toPublicApiProblem } from "@/lib/api-problem"
import { accessTokenCookieOptions,refreshTokenCookieOptions } from "@/lib/server-session"
import { rejectUnsafeRequest } from "@/lib/request-security"

export async function POST(request:Request){const rejected=rejectUnsafeRequest(request,{requireJson:true});if(rejected)return rejected;const body=await request.json().catch(()=>null) as {accessToken?:string;refreshToken?:string;expiresIn?:number}|null;if(!body?.accessToken)return NextResponse.json(toPublicApiProblem({code:"access_token_required"},400,request.headers.get("x-correlation-id")??undefined),{status:400});const store=await cookies();store.set("go_access_token",body.accessToken,accessTokenCookieOptions(body.expiresIn));if(body.refreshToken)store.set("go_refresh_token",body.refreshToken,refreshTokenCookieOptions);return NextResponse.json({data:{authenticated:true}},{headers:{"Cache-Control":"no-store"}})}
export async function DELETE(request:Request){const rejected=rejectUnsafeRequest(request);if(rejected)return rejected;const store=await cookies();store.delete("go_access_token");store.delete("go_refresh_token");return new NextResponse(null,{status:204})}
