import { cookies } from "next/headers"
import { NextResponse } from "next/server"

const cookieOptions={httpOnly:true,sameSite:"lax" as const,secure:process.env.NODE_ENV==="production",path:"/"}
const sessionMaxAge=60*60*24*7
export async function POST(request:Request){const body=await request.json() as {accessToken?:string;refreshToken?:string;expiresIn?:number};if(!body.accessToken)return NextResponse.json({error:"access_token_required"},{status:400});const store=await cookies();store.set("go_access_token",body.accessToken,{...cookieOptions,maxAge:sessionMaxAge});if(body.refreshToken)store.set("go_refresh_token",body.refreshToken,{...cookieOptions,maxAge:sessionMaxAge});return NextResponse.json({data:{authenticated:true}})}
export async function DELETE(){const store=await cookies();store.delete("go_access_token");store.delete("go_refresh_token");return new NextResponse(null,{status:204})}
