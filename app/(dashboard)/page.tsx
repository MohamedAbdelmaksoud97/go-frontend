"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Activity, AlertCircle, BarChart3, CircleDollarSign, ClipboardList, CreditCard, Loader2, PieChart, RefreshCw, TrendingUp, Users } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { PageHeading } from "@/components/page-heading"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { apiRequest } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { firstAllowedDestination } from "@/lib/permissions"

type Summary=Record<string,string|number|null|undefined>
type DailyMetric={businessDate?:string;invoicedGrossMinor?:string|number;otherIncomeMinor?:string|number;totalRevenueMinor?:string|number}
type SubscriptionStatus={status?:string;count?:string|number}
type ServiceActivity={serviceId?:string;serviceName?:string;attempts?:string|number;accepted?:string|number}

const STATUS_META:Record<string,{label:string;color:string}>={
 ACTIVE:{label:"نشط",color:"#ffcc00"},
 ACTIVE_PROVISIONAL:{label:"نشط مؤقتًا",color:"#f59e0b"},
 SCHEDULED:{label:"مجدول",color:"#3b82f6"},
 FROZEN:{label:"مجمّد",color:"#8b5cf6"},
 EXPIRED:{label:"منتهي",color:"#ef4444"},
 CANCELLED:{label:"ملغي",color:"#6b7280"},
}

export default function DashboardPage(){
 const context=useAppContext();const router=useRouter();const canView=context.canAccess(["reporting.read"])
 const [summary,setSummary]=useState<Summary>();const[daily,setDaily]=useState<DailyMetric[]>([]);const[statuses,setStatuses]=useState<SubscriptionStatus[]>([]);const[services,setServices]=useState<ServiceActivity[]>([])
 const[loading,setLoading]=useState(true);const[error,setError]=useState("");const[chartWarning,setChartWarning]=useState("");const[asOf,setAsOf]=useState<string>()
 const fallback=firstAllowedDestination(context.canAccess)
 const range=useMemo(()=>dayRangeRiyadh(),[]);const chartRange=useMemo(()=>rollingRangeRiyadh(30),[])
 useEffect(()=>{if(!context.loading&&!canView)router.replace(fallback)},[canView,context.loading,fallback,router])
 async function load(){
  if(!context.organizationId||!context.branchId)return
  setLoading(true);setError("");setChartWarning("")
  const organizationId=context.organizationId,branchId=context.branchId
  const summaryQuery=new URLSearchParams({branchId,from:range.from,to:range.to})
  const activityQuery=new URLSearchParams({branchId,from:chartRange.from,to:chartRange.to})
  const statusQuery=new URLSearchParams({branchId,limit:"100"})
  try{
   const results=await Promise.allSettled([
    apiRequest<Summary>(`/organizations/${organizationId}/dashboard/summary?${summaryQuery}`),
    apiRequest<DailyMetric[]>(`/organizations/${organizationId}/reports/revenue-trend?${activityQuery}`),
    apiRequest<SubscriptionStatus[]>(`/organizations/${organizationId}/reports/subscription-status-chart?${statusQuery}`),
    apiRequest<ServiceActivity[]>(`/organizations/${organizationId}/reports/service-activity-chart?${activityQuery}`),
   ])
   const summaryResult=results[0]
   if(summaryResult.status==="rejected")throw summaryResult.reason
   setSummary(summaryResult.value.data)
   if(results[1].status==="fulfilled"){setDaily(results[1].value.data);setAsOf(new Date().toISOString())}else setDaily([])
   if(results[2].status==="fulfilled")setStatuses(results[2].value.data);else setStatuses([])
   if(results[3].status==="fulfilled")setServices(results[3].value.data);else setServices([])
   if(results.slice(1).some(result=>result.status==="rejected"))setChartWarning("تعذر تحميل بعض الرسوم الآن. يمكنك إعادة المحاولة دون أن تتأثر مؤشرات اليوم.")
  }catch(reason){setError(humanError(reason,"تعذر تحميل مؤشرات الفرع."))}finally{setLoading(false)}
 }
 useEffect(()=>{const frame=requestAnimationFrame(()=>void load());return()=>cancelAnimationFrame(frame)},[context.branchId,context.organizationId]) // eslint-disable-line react-hooks/exhaustive-deps
 if(context.loading||!canView)return <div className="grid min-h-[55vh] place-items-center"><Loader2 className="animate-spin text-primary"/></div>
 const activeMembers=value(summary,"activeMembers","active_members"),activeSubscriptions=value(summary,"activeSubscriptions","active_subscriptions"),attendance=value(summary,"acceptedAttendance","accepted_attendance"),revenue=number(summary,"invoicedGrossMinor","invoiced_gross_minor")+number(summary,"otherIncomeMinor","other_income_minor"),pending=value(summary,"pendingOnlineRequests","pending_online_requests"),feedback=value(summary,"openFeedbackCases","open_feedback_cases")
 const quickAction=[
  {permissions:["members.manage"],label:"تسجيل عضو جديد",href:"/members?create=1"},
  {permissions:["sales.checkout"],label:"إنشاء اشتراك جديد",href:"/subscriptions?create=1"},
  {permissions:["attendance.check-in"],label:"تسجيل دخول عضو",href:"/attendance?create=1"},
  {permissions:["bookings.create"],label:"إنشاء حجز جديد",href:"/bookings?create=1"},
  {permissions:["crm.leads.manage"],label:"إضافة عميل محتمل",href:"/crm?create=1"},
 ].find(item=>context.canAccess(item.permissions))
 const cards=[{label:"الأعضاء النشطون",value:activeMembers,icon:Users,href:"/members",permissions:["members.read"]},{label:"الاشتراكات النشطة",value:activeSubscriptions,icon:CreditCard,href:"/subscriptions",permissions:["subscriptions.read"]},{label:"زيارات اليوم المقبولة",value:attendance,icon:Activity,href:"/attendance",permissions:["attendance.read"]},{label:"إيرادات اليوم",value:money(revenue),icon:CircleDollarSign,href:"/finance",permissions:["finance.invoices.read","finance.other-income.read"]}]
 return <div className="fade-up"><PageHeading eyebrow={dateLabel()} title={`مرحبًا، ${context.account?.displayName?.trim()||"مدير النظام"}`} description="نظرة شاملة على أداء الفرع اليوم وأهم المؤشرات التي تساعدك على متابعة العمل واتخاذ القرار." action={quickAction?.label} actionHref={quickAction?.href} />
  {error&&<div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/8 p-4 text-sm text-red-600"><AlertCircle/><span>{error}</span><Button className="mr-auto" variant="outline" size="sm" onClick={()=>void load()}><RefreshCw/>إعادة المحاولة</Button></div>}
  {chartWarning&&<div className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4 text-sm text-amber-600"><BarChart3/><span>{chartWarning}</span><Button className="mr-auto" variant="outline" size="sm" onClick={()=>void load()}><RefreshCw/>إعادة التحميل</Button></div>}
  {loading?<div className="grid min-h-72 place-items-center"><Loader2 className="size-8 animate-spin text-primary"/></div>:<>
   <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.filter(card=>context.canAccess(card.permissions)).map(card=><Link href={card.href} key={card.label}><Card className="h-full transition hover:-translate-y-0.5 hover:border-primary"><CardContent className="p-5"><span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-amber-600"><card.icon/></span><p className="mt-5 text-xs font-semibold text-muted-foreground">{card.label}</p><p className="mt-2 text-2xl font-black">{card.value}</p><p className="mt-2 text-[10px] text-muted-foreground">بيانات اليوم في الفرع الحالي</p></CardContent></Card></Link>)}</section>
   {context.canAccess(["online-requests.read","feedback.read","feedback.reply"])&&<Card className="mt-5"><CardContent className="grid gap-4 p-5 md:grid-cols-2">{context.canAccess(["online-requests.read"])&&<Link href="/operations" className="flex items-center gap-4 rounded-2xl bg-secondary/50 p-5 transition hover:bg-secondary"><span className="grid size-11 place-items-center rounded-xl bg-blue-500/10 text-blue-600"><ClipboardList/></span><div><p className="text-sm font-black">طلبات إلكترونية تنتظر المراجعة</p><p className="mt-1 text-2xl font-black">{pending}</p></div></Link>}{context.canAccess(["feedback.read","feedback.reply"])&&<Link href="/feedback" className="flex items-center gap-4 rounded-2xl bg-secondary/50 p-5 transition hover:bg-secondary"><span className="grid size-11 place-items-center rounded-xl bg-orange-500/10 text-orange-600"><AlertCircle/></span><div><p className="text-sm font-black">تذاكر شكاوى واقتراحات مفتوحة</p><p className="mt-1 text-2xl font-black">{feedback}</p></div></Link>}</CardContent></Card>}
   <section className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_.8fr]">
    <RevenueChart rows={daily} asOf={asOf}/>
    <SubscriptionChart rows={statuses}/>
   </section>
   <ServiceActivityChart rows={services}/>
  </>}
 </div>
}

function RevenueChart({rows,asOf}:{rows:DailyMetric[];asOf?:string}){
 const series=completeRevenueSeries(rows,30)
 const values=series.map(row=>row.amountMinor),total=values.reduce((sum,current)=>sum+current,0),maximum=Math.max(...values,1)
 const first=series[0]?.businessDate,last=series.at(-1)?.businessDate
 const peak=series.reduce((highest,current)=>current.amountMinor>highest.amountMinor?current:highest,series[0]??{businessDate:"",amountMinor:0})
 return <Card><CardHeader><div><CardTitle className="flex items-center gap-2"><TrendingUp className="size-5 text-amber-600"/>الإيرادات اليومية</CardTitle><CardDescription className="mt-1">إجمالي الفواتير والإيرادات الأخرى لكل يوم في الفرع خلال آخر 30 يومًا</CardDescription></div><div className="text-left"><p className="text-xl font-black">{money(total)}</p><p className="mt-1 text-[9px] text-muted-foreground">{asOf?`آخر تحديث ${shortDateTime(asOf)}`:"من بيانات قاعدة النظام"}</p></div></CardHeader><CardContent className="pt-2">{total===0?<ChartEmpty text="لا توجد حركة مالية مسجلة في هذه الفترة."/>:<><div className="mb-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground"><span className="flex items-center gap-1.5"><i className="block size-2.5 rounded-sm bg-primary"/>كل عمود يمثل إيراد يوم واحد</span><span className="mr-auto">أعلى يوم: <b className="text-foreground">{formatBusinessDate(peak.businessDate)} · {money(peak.amountMinor)}</b></span></div><div className="relative h-64 overflow-hidden rounded-xl bg-secondary/35 px-4 pb-4 pt-5" role="img" aria-label="أعمدة الإيرادات اليومية خلال آخر ثلاثين يومًا"><div className="pointer-events-none absolute inset-x-4 bottom-4 top-5 grid grid-rows-4">{[0,1,2,3].map(item=><div key={item} className="border-b border-dashed border-border/70"/>)}</div><div className="relative z-10 flex h-full items-end gap-1" dir="ltr">{series.map(row=>{const height=row.amountMinor>0?Math.max(4,(row.amountMinor/maximum)*100):0;return <div key={row.businessDate} className="group relative flex h-full min-w-0 flex-1 items-end"><div className="w-full rounded-t-sm bg-primary/75 transition hover:bg-primary" style={{height:`${height}%`}}/><span className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border bg-popover px-2 py-1 text-[10px] font-bold text-popover-foreground shadow-lg group-hover:block" style={{bottom:`calc(${height}% + 8px)`}}>{formatBusinessDate(row.businessDate)} · {money(row.amountMinor)}</span></div>})}</div></div><div className="mt-3 flex justify-between text-[10px] text-muted-foreground" dir="ltr"><span dir="rtl">{formatBusinessDate(first)}</span><span dir="rtl">{formatBusinessDate(last)}</span></div></>}</CardContent></Card>
}

function SubscriptionChart({rows}:{rows:SubscriptionStatus[]}){
 const normalized=rows.map((row,index)=>{const status=String(row.status??"OTHER");return{status,count:Math.max(0,Number(row.count??0)),...(STATUS_META[status]??{label:"أخرى",color:["#14b8a6","#64748b","#f97316"][index%3]})}}).filter(item=>item.count>0)
 const total=normalized.reduce((sum,item)=>sum+item.count,0)
 const stops=normalized.map((item,index)=>{const from=normalized.slice(0,index).reduce((sum,current)=>sum+current.count,0);const to=from+item.count;return`${item.color} ${(from/total)*100}% ${(to/total)*100}%`}).join(", ")
 return <Card><CardHeader><div><CardTitle className="flex items-center gap-2"><PieChart className="size-5 text-amber-600"/>حالة الاشتراكات</CardTitle><CardDescription className="mt-1">التوزيع الحقيقي في الفرع الحالي</CardDescription></div></CardHeader><CardContent>{total===0?<ChartEmpty text="لا توجد اشتراكات مسجلة في هذا الفرع."/>:<><div className="mx-auto grid size-48 place-items-center rounded-full" style={{background:`conic-gradient(${stops})`}}><div className="grid size-32 place-items-center rounded-full bg-card text-center"><div><p className="text-3xl font-black">{total.toLocaleString("ar-SA")}</p><p className="text-[10px] text-muted-foreground">إجمالي الاشتراكات</p></div></div></div><div className="mt-5 grid grid-cols-2 gap-3 text-xs">{normalized.map(item=><div key={item.status} className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{background:item.color}}/><span className="truncate text-muted-foreground">{item.label}</span><b className="mr-auto">{Math.round((item.count/total)*100)}%</b></div>)}</div></>}</CardContent></Card>
}

function ServiceActivityChart({rows}:{rows:ServiceActivity[]}){
 const values=rows.map(row=>({id:String(row.serviceId??row.serviceName??"service"),name:String(row.serviceName??"خدمة غير محددة"),accepted:Math.max(0,Number(row.accepted??0)),attempts:Math.max(0,Number(row.attempts??0))})).sort((a,b)=>b.accepted-a.accepted).slice(0,8)
 const maximum=Math.max(...values.map(item=>item.attempts),1)
 return <Card className="mt-5"><CardHeader><div><CardTitle className="flex items-center gap-2"><Activity className="size-5 text-amber-600"/>نشاط الخدمات</CardTitle><CardDescription className="mt-1">محاولات الدخول والزيارات المقبولة خلال آخر 30 يومًا</CardDescription></div></CardHeader><CardContent>{values.length===0?<ChartEmpty text="لا توجد زيارات مرتبطة بخدمات في هذه الفترة."/>:<div className="space-y-4">{values.map(item=><div key={item.id}><div className="mb-2 flex items-center gap-3 text-xs"><span className="min-w-0 truncate font-bold">{item.name}</span><span className="mr-auto shrink-0 text-muted-foreground">{item.accepted.toLocaleString("ar-SA")} مقبولة من {item.attempts.toLocaleString("ar-SA")}</span></div><div className="h-3 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-[width]" style={{width:`${Math.max(2,(item.accepted/maximum)*100)}%`}}/></div></div>)}</div>}</CardContent></Card>
}

function ChartEmpty({text}:{text:string}){return <div className="grid min-h-52 place-items-center rounded-xl border border-dashed bg-secondary/20 p-6 text-center"><div><BarChart3 className="mx-auto size-9 text-muted-foreground/50"/><p className="mt-3 text-sm font-bold">لا توجد بيانات للرسم بعد</p><p className="mt-1 text-xs text-muted-foreground">{text}</p></div></div>}
function completeRevenueSeries(rows:DailyMetric[],days:number){
 const byDate=new Map<string,number>()
 for(const row of rows){
  const businessDate=String(row.businessDate??"").slice(0,10)
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(businessDate))continue
  const provided=Number(row.totalRevenueMinor)
  const amount=Number.isFinite(provided)?provided:(Number(row.invoicedGrossMinor??0)||0)+(Number(row.otherIncomeMinor??0)||0)
  byDate.set(businessDate,(byDate.get(businessDate)??0)+Math.max(0,amount))
 }
 const {fromDate}=rollingRangeRiyadh(days),start=new Date(`${fromDate}T00:00:00Z`)
 return Array.from({length:days},(_,index)=>{const businessDate=new Date(start.getTime()+index*86_400_000).toISOString().slice(0,10);return{businessDate,amountMinor:byDate.get(businessDate)??0}})
}
function value(summary:Summary|undefined,...keys:string[]){for(const key of keys){const candidate=summary?.[key];if(candidate!==undefined&&candidate!==null)return String(candidate)}return "0"}
function number(summary:Summary|undefined,...keys:string[]){return Number(value(summary,...keys))||0}
function money(minor:number){return new Intl.NumberFormat("ar-SA",{style:"currency",currency:"SAR",maximumFractionDigits:2}).format(minor/100)}
function dateLabel(){return new Intl.DateTimeFormat("ar-SA",{dateStyle:"full",timeZone:"Asia/Riyadh"}).format(new Date())}
function dayRangeRiyadh(){const date=riyadhDate(new Date());const from=new Date(`${date}T00:00:00+03:00`);const to=new Date(from.getTime()+86_400_000);return{from:from.toISOString(),to:to.toISOString()}}
function rollingRangeRiyadh(days:number){const toDate=riyadhDate(new Date()),toStart=new Date(`${toDate}T00:00:00+03:00`),fromStart=new Date(toStart.getTime()-(days-1)*86_400_000),fromDate=riyadhDate(fromStart),to=new Date(toStart.getTime()+86_400_000);return{fromDate,toDate,from:fromStart.toISOString(),to:to.toISOString()}}
function riyadhDate(date:Date){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);const get=(type:string)=>parts.find(part=>part.type===type)?.value??"";return`${get("year")}-${get("month")}-${get("day")}`}
function formatBusinessDate(value?:string){if(!value)return"";return new Intl.DateTimeFormat("ar-SA",{day:"numeric",month:"short",timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`))}
function shortDateTime(value:string){return new Intl.DateTimeFormat("ar-SA",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit",timeZone:"Asia/Riyadh"}).format(new Date(value))}
