"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Activity, AlertCircle, CircleDollarSign, ClipboardList, CreditCard, Loader2, RefreshCw, Users } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { PageHeading } from "@/components/page-heading"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { apiRequest } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { firstAllowedDestination } from "@/lib/permissions"

type Summary=Record<string,string|number|null|undefined>

export default function DashboardPage(){
 const context=useAppContext();const router=useRouter();const canView=context.canAccess(["reporting.read"])
 const [summary,setSummary]=useState<Summary>();const[loading,setLoading]=useState(true);const[error,setError]=useState("")
 const fallback=firstAllowedDestination(context.canAccess)
 const range=useMemo(()=>dayRangeRiyadh(),[])
 useEffect(()=>{if(!context.loading&&!canView)router.replace(fallback)},[canView,context.loading,fallback,router])
 async function load(){if(!context.organizationId||!context.branchId)return;setLoading(true);setError("");try{const query=new URLSearchParams({branchId:context.branchId,from:range.from,to:range.to});const response=await apiRequest<Summary>(`/organizations/${context.organizationId}/dashboard/summary?${query}`);setSummary(response.data)}catch(reason){setError(humanError(reason,"تعذر تحميل مؤشرات الفرع."))}finally{setLoading(false)}}
 useEffect(()=>{const frame=requestAnimationFrame(()=>void load());return()=>cancelAnimationFrame(frame)},[context.branchId,context.organizationId]) // eslint-disable-line react-hooks/exhaustive-deps
 if(context.loading||!canView)return <div className="grid min-h-[55vh] place-items-center"><Loader2 className="animate-spin text-primary"/></div>
 const activeMembers=value(summary,"activeMembers","active_members"),activeSubscriptions=value(summary,"activeSubscriptions","active_subscriptions"),attendance=value(summary,"acceptedAttendance","accepted_attendance"),revenue=number(summary,"invoicedGrossMinor","invoiced_gross_minor")+number(summary,"otherIncomeMinor","other_income_minor"),pending=value(summary,"pendingOnlineRequests","pending_online_requests"),feedback=value(summary,"openFeedbackCases","open_feedback_cases")
 const cards=[{label:"الأعضاء النشطون",value:activeMembers,icon:Users,href:"/members",permissions:["members.read"]},{label:"الاشتراكات النشطة",value:activeSubscriptions,icon:CreditCard,href:"/subscriptions",permissions:["subscriptions.read"]},{label:"زيارات اليوم المقبولة",value:attendance,icon:Activity,href:"/attendance",permissions:["attendance.read"]},{label:"إيرادات اليوم",value:money(revenue),icon:CircleDollarSign,href:"/finance",permissions:["finance.invoices.read","finance.other-income.read"]}]
 return <div className="fade-up"><PageHeading eyebrow={dateLabel()} title={`مرحبًا، ${context.account?.displayName?.trim()||"مدير النظام"}`} description="ملخص حي من قاعدة البيانات للفرع الحالي. لا تعرض هذه الصفحة أرقامًا تجريبية أو تقديرية." />
  {error&&<div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/8 p-4 text-sm text-red-600"><AlertCircle/><span>{error}</span><Button className="mr-auto" variant="outline" size="sm" onClick={()=>void load()}><RefreshCw/>إعادة المحاولة</Button></div>}
  {loading?<div className="grid min-h-72 place-items-center"><Loader2 className="size-8 animate-spin text-primary"/></div>:<>
   <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.filter(card=>context.canAccess(card.permissions)).map(card=><Link href={card.href} key={card.label}><Card className="h-full transition hover:-translate-y-0.5 hover:border-primary"><CardContent className="p-5"><span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-amber-600"><card.icon/></span><p className="mt-5 text-xs font-semibold text-muted-foreground">{card.label}</p><p className="mt-2 text-2xl font-black">{card.value}</p><p className="mt-2 text-[10px] text-muted-foreground">بيانات اليوم في الفرع الحالي</p></CardContent></Card></Link>)}</section>
   {context.canAccess(["online-requests.read","feedback.read"])&&<Card className="mt-5"><CardContent className="grid gap-4 p-5 md:grid-cols-2"><Link href="/operations" className="flex items-center gap-4 rounded-2xl bg-secondary/50 p-5 transition hover:bg-secondary"><span className="grid size-11 place-items-center rounded-xl bg-blue-500/10 text-blue-600"><ClipboardList/></span><div><p className="text-sm font-black">طلبات إلكترونية تنتظر المراجعة</p><p className="mt-1 text-2xl font-black">{pending}</p></div></Link><Link href="/operations" className="flex items-center gap-4 rounded-2xl bg-secondary/50 p-5 transition hover:bg-secondary"><span className="grid size-11 place-items-center rounded-xl bg-orange-500/10 text-orange-600"><AlertCircle/></span><div><p className="text-sm font-black">شكاوى وملاحظات مفتوحة</p><p className="mt-1 text-2xl font-black">{feedback}</p></div></Link></CardContent></Card>}
  </>}
 </div>
}

function value(summary:Summary|undefined,...keys:string[]){for(const key of keys){const candidate=summary?.[key];if(candidate!==undefined&&candidate!==null)return String(candidate)}return "0"}
function number(summary:Summary|undefined,...keys:string[]){return Number(value(summary,...keys))||0}
function money(minor:number){return new Intl.NumberFormat("ar-SA",{style:"currency",currency:"SAR"}).format(minor/100)}
function dateLabel(){return new Intl.DateTimeFormat("ar-SA",{dateStyle:"full",timeZone:"Asia/Riyadh"}).format(new Date())}
function dayRangeRiyadh(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const get=(type:string)=>parts.find(part=>part.type===type)?.value??"";const date=`${get("year")}-${get("month")}-${get("day")}`;const from=new Date(`${date}T00:00:00+03:00`);const to=new Date(from.getTime()+86_400_000);return{from:from.toISOString(),to:to.toISOString()}}
