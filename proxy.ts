import { NextResponse,type NextRequest } from "next/server"

const publicPaths=["/login","/join","/forbidden"]
export function proxy(request:NextRequest){
 if(!process.env.API_BASE_URL&&!process.env.NEXT_PUBLIC_API_BASE_URL)return NextResponse.next()
 const pathname=request.nextUrl.pathname
 if(publicPaths.some(path=>pathname===path||pathname.startsWith(`${path}/`)))return NextResponse.next()
 if(!request.cookies.has("go_access_token")){const login=new URL("/login",request.url);login.searchParams.set("returnTo",pathname);return NextResponse.redirect(login)}
 return NextResponse.next()
}
export const config={matcher:["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"]}
