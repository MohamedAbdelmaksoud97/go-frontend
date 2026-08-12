import { cookies } from "next/headers"
import { NextResponse } from "next/server"

const SUPABASE_URL=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const cookieOptions={httpOnly:true,sameSite:"lax" as const,secure:process.env.NODE_ENV==="production",path:"/"}
export async function POST(){const store=await cookies();const refreshToken=store.get("go_refresh_token")?.value;if(!refreshToken||!SUPABASE_URL||!SUPABASE_KEY)return NextResponse.json({error:"refresh_unavailable"},{status:401});const response=await fetch(`${SUPABASE_URL.replace(/\/$/,"")}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:refreshToken}),cache:"no-store"});if(!response.ok){store.delete("go_access_token");store.delete("go_refresh_token");return NextResponse.json({error:"refresh_failed"},{status:401})}const session=await response.json() as {access_token:string;refresh_token:string;expires_in:number};store.set("go_access_token",session.access_token,{...cookieOptions,maxAge:session.expires_in});store.set("go_refresh_token",session.refresh_token,{...cookieOptions,maxAge:60*60*24*30});return NextResponse.json({data:{authenticated:true}})}
