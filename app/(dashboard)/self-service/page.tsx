"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Barcode, BriefcaseBusiness, CalendarDays, CreditCard, Dumbbell, Loader2, UserRound, UsersRound, WalletCards } from "lucide-react"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type MemberLink={memberId:string;displayName?:string;memberName?:string;relationship?:string;canView?:boolean;canBook?:boolean;canManageMembership?:boolean}
type SelfContext={account?:{displayName?:string};memberLinks?:MemberLink[];members?:MemberLink[];employeeLinks?:unknown[];employees?:unknown[];trainerLinks?:unknown[]}

export default function SelfServicePage(){
 const [data,setData]=useState<SelfContext>({memberLinks:[{memberId:"demo",displayName:"محمد العتيبي",relationship:"SELF",canView:true,canBook:true,canManageMembership:true}]})
 const [loading,setLoading]=useState(hasRuntimeApi())
 useEffect(()=>{if(!hasRuntimeApi())return;const frame=requestAnimationFrame(()=>apiRequest<SelfContext>("/self").then(r=>setData(r.data)).finally(()=>setLoading(false)));return()=>cancelAnimationFrame(frame)},[])
 const members=data.memberLinks??data.members??[]
 return <div className="fade-up"><Badge variant="outline"><UserRound/>مساحتي</Badge><h1 className="mt-4 text-3xl font-black">مرحبًا، {data.account?.displayName??"عضو GO"}</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">كل ما يخص عضويتك وحجوزاتك وجدول عملك في مكان واحد، بحسب نوع حسابك.</p>{loading?<div className="grid place-items-center py-24"><Loader2 className="animate-spin text-primary"/></div>:<>
  <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{members.map(member=><Card key={member.memberId}><CardContent className="p-5"><span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-amber-600">{member.relationship==="SELF"?<UserRound/>:<UsersRound/>}</span><h2 className="mt-4 font-black">{member.displayName??member.memberName??"عضو"}</h2><p className="mt-1 text-[10px] text-muted-foreground">{member.relationship==="SELF"?"عضويتي":"عضوية مرتبطة بحسابي"}</p><div className="mt-4 flex flex-wrap gap-1">{member.canView&&<Badge variant="success">عرض التفاصيل</Badge>}{member.canBook&&<Badge variant="success">إدارة الحجوزات</Badge>}{member.canManageMembership&&<Badge variant="success">إدارة الاشتراك</Badge>}</div><div className="mt-5 grid grid-cols-2 gap-2"><Link href="/subscriptions"><Button variant="outline" className="w-full"><CreditCard/>الاشتراك</Button></Link><Link href="/bookings"><Button className="w-full"><CalendarDays/>الحجوزات</Button></Link></div></CardContent></Card>)}
  <Card><CardContent className="p-5"><span className="grid size-11 place-items-center rounded-xl bg-blue-500/10 text-blue-600"><BriefcaseBusiness/></span><h2 className="mt-4 font-black">عملي اليوم</h2><p className="mt-1 text-[10px] leading-5 text-muted-foreground">مواعيد المناوبة والحضور والانصراف</p><Link href="/staff"><Button variant="outline" className="mt-5 w-full">عرض جدول العمل</Button></Link></CardContent></Card>
  <Card><CardContent className="p-5"><span className="grid size-11 place-items-center rounded-xl bg-violet-500/10 text-violet-600"><Dumbbell/></span><h2 className="mt-4 font-black">مساحة المدرب</h2><p className="mt-1 text-[10px] leading-5 text-muted-foreground">جلسات اليوم والأعضاء وخطط التدريب</p><Link href="/staff"><Button variant="outline" className="mt-5 w-full">عرض جدول التدريب</Button></Link></CardContent></Card>
  </section>
  <section className="mt-5 grid gap-3 sm:grid-cols-3"><Link href="/barcodes"><Card className="transition hover:border-primary"><CardContent className="flex items-center gap-3 p-4"><Barcode className="text-amber-600"/><div><p className="text-xs font-black">بطاقة الدخول</p><p className="mt-1 text-[10px] text-muted-foreground">عرض البطاقة وطباعتها</p></div></CardContent></Card></Link><Link href="/finance"><Card className="transition hover:border-primary"><CardContent className="flex items-center gap-3 p-4"><WalletCards className="text-emerald-600"/><div><p className="text-xs font-black">الفواتير والمدفوعات</p><p className="mt-1 text-[10px] text-muted-foreground">متابعة الرصيد والفواتير</p></div></CardContent></Card></Link><Link href="/bookings"><Card className="transition hover:border-primary"><CardContent className="flex items-center gap-3 p-4"><CalendarDays className="text-violet-600"/><div><p className="text-xs font-black">مواعيدي</p><p className="mt-1 text-[10px] text-muted-foreground">الحصص والحجوزات القادمة</p></div></CardContent></Card></Link></section>
 </>}</div>
}
