"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Activity, ArrowLeft, ArrowUpLeft, CalendarCheck2, CircleDollarSign, Clock3, CreditCard, ScanLine, TrendingUp, UserPlus, Users } from "lucide-react"
import { PageHeading } from "@/components/page-heading"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useAppContext } from "@/components/app-context"

const stats = [
  {label:"إجمالي الأعضاء",value:"2,847",note:"+124 هذا الشهر",change:"+12.5%",icon:Users,color:"bg-blue-500/10 text-blue-600"},
  {label:"الاشتراكات النشطة",value:"2,214",note:"77.7% من الأعضاء",change:"+8.2%",icon:CreditCard,color:"bg-primary/15 text-amber-600"},
  {label:"إيرادات اليوم",value:"18,750",suffix:"ر.س",note:"مقارنة بـ 16,240 أمس",change:"+15.4%",icon:CircleDollarSign,color:"bg-emerald-500/10 text-emerald-600"},
  {label:"زيارات اليوم",value:"386",note:"الذروة 06:00 م",change:"+6.7%",icon:Activity,color:"bg-violet-500/10 text-violet-600"},
]

const visits = [
  {name:"عبدالله السبيعي",code:"GF-2841",time:"10:42 ص",status:"ACCEPTED"},
  {name:"نورة القحطاني",code:"GF-1932",time:"10:38 ص",status:"ACCEPTED"},
  {name:"ماجد الدوسري",code:"GF-0874",time:"10:31 ص",status:"REJECTED"},
  {name:"ريم الحربي",code:"GF-2418",time:"10:26 ص",status:"ACCEPTED"},
]

function MiniChart({ index }: { index:number }) {
 const paths=["M2 27C17 25 20 13 34 18s19 8 29-3 17-7 29-13","M2 27c12-3 17-12 28-9s18 10 28 4 18-19 34-15","M2 28c15-1 15-12 27-10s16 8 25 2S70 8 92 5","M2 26c11-6 19 2 28-3s15-13 25-7 19 13 37 4"]
 return <svg viewBox="0 0 94 32" className="h-9 w-24" aria-hidden="true"><path d={paths[index]} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/><path d={`${paths[index]} V32 H2 Z`} className="opacity-[.08]" fill="currentColor"/></svg>
}

function RevenueChart() {
 const values=[24,31,28,45,42,60,52,68,63,77,72,88]
 const points=values.map((v,i)=>`${i*(100/(values.length-1))},${100-v}`).join(" ")
 return <div className="mt-5">
   <div className="relative h-56 overflow-hidden rounded-xl bg-secondary/35 px-2 pt-4">
    <div className="absolute inset-0 grid grid-rows-4">{[0,1,2,3].map(i=><div key={i} className="border-b border-dashed border-border/70"/>)}</div>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="relative z-10 h-[190px] w-full overflow-visible" aria-label="منحنى الإيرادات الشهرية">
      <defs><linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffcc00" stopOpacity=".32"/><stop offset="1" stopColor="#ffcc00" stopOpacity="0"/></linearGradient></defs>
      <polygon points={`0,100 ${points} 100,100`} fill="url(#revenue)"/>
      <polyline points={points} fill="none" stroke="#ffcc00" strokeWidth="2.1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/>
      {values.map((v,i)=><circle key={i} cx={i*(100/(values.length-1))} cy={100-v} r="1.2" fill="#ffcc00" stroke="var(--card)" strokeWidth=".8" vectorEffect="non-scaling-stroke"/>)}
    </svg>
   </div>
   <div className="mt-3 flex justify-between text-[10px] text-muted-foreground">{["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"].map((m,i)=><span key={m} className={i%2?"hidden sm:inline":""}>{m}</span>)}</div>
 </div>
}

export default function DashboardPage() {
 const context=useAppContext()
 const router=useRouter()
 const canViewDashboard=context.canAccess(["reporting.read"])
 const fallbackDestination=context.canAccess(["restaurant.orders.read"]) ? "/restaurant" : context.canAccess(["sales.checkout","finance.payments.record"]) ? "/cashier" : context.canAccess(["members.read"]) ? "/members" : context.canAccess(["workforce.read","coaching.read"]) ? "/staff" : context.canAccess(["organization.read","catalog.read","commercial.read","iam.roles.read"]) ? "/master-data" : "/self-service"
 useEffect(()=>{if(!context.loading&&!canViewDashboard)router.replace(fallbackDestination)},[canViewDashboard,context.loading,fallbackDestination,router])
 if(context.loading||!canViewDashboard)return <div className="grid min-h-[55vh] place-items-center"><span className="size-9 animate-spin rounded-full border-4 border-primary border-t-transparent"/></div>
 return <div className="fade-up">
  <PageHeading eyebrow="الأربعاء، 12 أغسطس 2026" title="صباح الخير، محمد 👋" description="إليك ملخص أداء النادي اليوم وأهم الأنشطة التي تحتاج إلى انتباهك." action="تسجيل عضو جديد" actionHref="/members" />

  <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="مؤشرات الأداء">
    {stats.map((item,i)=><Card key={item.label} className="overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
      <CardContent className="p-5"><div className="flex items-start justify-between"><span className={`grid size-11 place-items-center rounded-xl ${item.color}`}><item.icon className="size-5"/></span><Badge variant="success"><TrendingUp className="size-3"/>{item.change}</Badge></div>
      <p className="mt-5 text-xs font-semibold text-muted-foreground">{item.label}</p><div className="mt-1 flex items-baseline gap-2"><strong className="text-2xl font-black">{item.value}</strong>{item.suffix&&<span className="text-xs font-bold text-muted-foreground">{item.suffix}</span>}</div>
      <div className="mt-3 flex items-center justify-between"><p className="text-[10px] text-muted-foreground">{item.note}</p><span className={item.color.split(" ")[1]}><MiniChart index={i}/></span></div></CardContent>
    </Card>)}
  </section>

  <section className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_.8fr]">
    <Card><CardHeader><div><CardTitle>نمو الإيرادات</CardTitle><CardDescription className="mt-1">إجمالي الإيرادات خلال آخر 12 شهرًا</CardDescription></div><div className="text-left"><p className="text-xl font-black">1.24 مليون <small className="text-[10px]">ر.س</small></p><Badge variant="success" className="mt-1">+18.2% عن العام الماضي</Badge></div></CardHeader><CardContent className="pt-0"><RevenueChart/></CardContent></Card>
    <Card><CardHeader><div><CardTitle>حالة الاشتراكات</CardTitle><CardDescription className="mt-1">التوزيع الحالي للأعضاء</CardDescription></div><Link href="/reports"><Button variant="ghost" size="sm">عرض التقرير <ArrowLeft/></Button></Link></CardHeader>
      <CardContent><div className="mx-auto grid size-48 place-items-center rounded-full" style={{background:"conic-gradient(#ffcc00 0 68%, #7c3aed 68% 80%, #ef4444 80% 88%, color-mix(in srgb, var(--foreground) 12%, transparent) 88%)"}}><div className="grid size-32 place-items-center rounded-full bg-card text-center"><div><p className="text-3xl font-black">2,847</p><p className="text-[10px] text-muted-foreground">إجمالي الأعضاء</p></div></div></div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-xs">{[["نشط","68%","bg-primary"],["مجمّد","12%","bg-violet-600"],["منتهي","8%","bg-red-500"],["أخرى","12%","bg-foreground/15"]].map(x=><div key={x[0]} className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${x[2]}`}/><span className="text-muted-foreground">{x[0]}</span><b className="mr-auto">{x[1]}</b></div>)}</div></CardContent>
    </Card>
  </section>

  <section className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
    <Card><CardHeader><div><CardTitle>آخر عمليات الدخول</CardTitle><CardDescription className="mt-1">تحديث مباشر من بوابة الفرع</CardDescription></div><span className="flex items-center gap-2 text-[10px] text-emerald-600"><span className="size-2 animate-pulse rounded-full bg-emerald-500"/> مباشر</span></CardHeader><CardContent className="pt-2"><div className="divide-y">{visits.map(v=><div key={v.code} className="flex items-center gap-3 py-3.5"><span className="grid size-9 place-items-center rounded-xl bg-secondary text-xs font-black">{v.name[0]}</span><div className="min-w-0"><p className="truncate text-xs font-bold">{v.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{v.code}</p></div><span className="mr-auto text-[10px] text-muted-foreground">{v.time}</span><StatusBadge status={v.status}/></div>)}</div><Link href="/attendance"><Button variant="outline" className="mt-3 w-full">عرض سجل الحضور <ArrowLeft/></Button></Link></CardContent></Card>
    <Card><CardHeader><div><CardTitle>أداء الفروع</CardTitle><CardDescription className="mt-1">نسبة تحقيق الهدف الشهري</CardDescription></div></CardHeader><CardContent className="space-y-5">{[["فرع الزلفي الرئيسي",86,"342,600 ر.س"],["فرع الصناعية",71,"218,400 ر.س"],["فرع الروضة",58,"164,250 ر.س"]].map((b,i)=><div key={b[0]}><div className="mb-2 flex items-center"><span className="grid size-7 place-items-center rounded-lg bg-secondary text-[10px] font-black">0{i+1}</span><p className="mr-2 text-xs font-bold">{b[0]}</p><div className="mr-auto text-left"><b className="block text-xs">{b[2]}</b><span className="text-[9px] text-muted-foreground">{b[1]}% من الهدف</span></div></div><Progress value={Number(b[1])}/></div>)}</CardContent></Card>
  </section>

  <section className="mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
    <Card><CardHeader><div><CardTitle>إجراءات سريعة</CardTitle><CardDescription className="mt-1">اختصارات للمهام المتكررة</CardDescription></div></CardHeader><CardContent className="grid grid-cols-2 gap-3">{[[UserPlus,"عضو جديد","سجّل بيانات العضو","/members"],[ScanLine,"تسجيل دخول","امسح بطاقة العضو","/attendance"],[CalendarCheck2,"حجز جديد","احجز حصة أو ملعب","/bookings"],[CircleDollarSign,"تحصيل دفعة","سجّل دفعة على فاتورة","/finance"]].map(([Icon,title,desc,href])=>{const C=Icon as typeof UserPlus; return <Link key={String(title)} href={String(href)} className="group rounded-xl border bg-secondary/30 p-4 text-right transition hover:border-primary hover:bg-primary/5"><C className="size-5 text-amber-600 transition group-hover:scale-110"/><p className="mt-3 text-xs font-bold">{String(title)}</p><p className="mt-1 text-[9px] text-muted-foreground">{String(desc)}</p></Link>})}</CardContent></Card>
    <Card><CardHeader><div><CardTitle>جدول اليوم</CardTitle><CardDescription className="mt-1">الحصص والمواعيد القادمة</CardDescription></div><Link href="/bookings"><Button variant="ghost" size="sm">التقويم <ArrowUpLeft/></Button></Link></CardHeader><CardContent className="space-y-3">{[["04:30 م","كروس فت المتقدم","أ. خالد","18/20"],["06:00 م","لياقة وحرق دهون","أ. نورة","14/16"],["07:30 م","تدريب شخصي","أ. فيصل","1/1"]].map((s,i)=><div key={s[0]} className="flex items-center gap-3 rounded-xl bg-secondary/45 p-3"><span className="grid size-10 place-items-center rounded-xl bg-card text-amber-600"><Clock3 className="size-4"/></span><div><p className="text-xs font-bold">{s[1]}</p><p className="mt-1 text-[10px] text-muted-foreground">{s[2]} · {s[0]}</p></div><div className="mr-auto text-left"><Badge variant={i===2?"secondary":"success"}>{s[3]}</Badge><p className="mt-1 text-[9px] text-muted-foreground">مقعد محجوز</p></div></div>)}</CardContent></Card>
  </section>
 </div>
}
import Link from "next/link"
