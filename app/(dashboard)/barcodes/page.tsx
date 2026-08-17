"use client"

import { useEffect, useState } from "react"
import { Barcode, Loader2, Printer, Search } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type Credential={id?:string;value?:string;code?:string;svg?:string;subjectName?:string;subjectType?:string}
type Person={id:string;fullNameAr?:string;memberName?:string;displayName?:string;memberNumber?:string;employeeNumber?:string}

export default function BarcodesPage(){
 const context=useAppContext()
 const [subjectType,setSubjectType]=useState("MEMBER")
 const [subjectId,setSubjectId]=useState("")
 const [people,setPeople]=useState<Person[]>([])
 const [credential,setCredential]=useState<Credential>()
 const [loading,setLoading]=useState(false)
 const [loadingPeople,setLoadingPeople]=useState(hasRuntimeApi())
 const [error,setError]=useState("")

 useEffect(()=>{
  if(!context.organizationId||!hasRuntimeApi())return
  let cancelled=false
  const resource=subjectType==="MEMBER"?"members":"employees"
  apiRequest<Person[]|{items:Person[]}>(`/organizations/${context.organizationId}/${resource}?branchId=${encodeURIComponent(context.branchId)}&limit=100`)
   .then(response=>{if(!cancelled)setPeople(Array.isArray(response.data)?response.data:response.data.items??[])})
   .catch(()=>{if(!cancelled)setPeople([])})
   .finally(()=>{if(!cancelled)setLoadingPeople(false)})
  return()=>{cancelled=true}
 },[context.branchId,context.organizationId,subjectType])

 function changeType(value:string){setSubjectType(value);setSubjectId("");setPeople([]);setLoadingPeople(hasRuntimeApi())}
 async function issue(){setLoading(true);setError("");try{const response=await apiRequest<Credential>(`/organizations/${context.organizationId}/access-credentials/barcodes`,{method:"POST",body:JSON.stringify({subjectType,subjectId})});setCredential(response.data)}catch(reason){setError(humanError(reason,"تعذر إصدار بطاقة الدخول. حاول مرة أخرى."))}finally{setLoading(false)}}

 return <div className="mx-auto max-w-4xl fade-up">
  <Badge variant="outline"><Barcode/>بطاقات الدخول</Badge>
  <h1 className="mt-4 text-3xl font-black">إصدار وطباعة بطاقة دخول</h1>
  <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">اختر العضو أو الموظف، ثم أصدر بطاقة جاهزة للاستخدام والطباعة.</p>
  <Card className="mt-7 print:hidden"><CardContent className="grid gap-4 p-5 sm:grid-cols-[.7fr_1.3fr_auto]">
   <label className="text-xs font-bold">البطاقة تخص<select className="mt-2 h-11 w-full rounded-xl border bg-background px-3" value={subjectType} onChange={event=>changeType(event.target.value)}><option value="MEMBER">عضو</option><option value="EMPLOYEE">موظف</option></select></label>
   <label className="text-xs font-bold">اختر الاسم<div className="relative mt-2"><Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><select className="h-11 w-full rounded-xl border bg-background pr-10 pl-3 text-sm" value={subjectId} onChange={event=>setSubjectId(event.target.value)}><option value="">{loadingPeople?"جارٍ تجهيز القائمة...":"ابحث واختر من القائمة"}</option>{people.map(person=><option key={person.id} value={person.id}>{person.fullNameAr??person.memberName??person.displayName??"اسم غير متاح"}{(person.memberNumber??person.employeeNumber)?` — ${person.memberNumber??person.employeeNumber}`:""}</option>)}</select></div></label>
   <Button className="mt-auto h-11" onClick={issue} disabled={!subjectId||loading}>{loading?<Loader2 className="animate-spin"/>:<Barcode/>}إصدار البطاقة</Button>
  </CardContent></Card>
  {error&&<p className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs text-red-600">{error}</p>}
  {credential&&<div className="mx-auto mt-8 max-w-sm rounded-3xl border-2 border-black bg-white p-7 text-center text-black shadow-xl print:mt-0 print:shadow-none"><div className="text-2xl font-black">GO <span className="text-[#dba900]">FITNESS</span></div><p className="mt-5 text-sm font-bold">{credential.subjectName??"عضو GO Fitness"}</p><p className="mt-1 text-[10px] text-zinc-500">{subjectType==="MEMBER"?"بطاقة عضو":"بطاقة موظف"}</p>{credential.svg&&<div className="mt-6 flex justify-center" dangerouslySetInnerHTML={{__html:credential.svg}}/>}<p dir="ltr" className="mt-4 font-mono tracking-[.2em]">{credential.value??credential.code}</p><Button className="mt-6 print:hidden" onClick={()=>window.print()}><Printer/>طباعة البطاقة</Button></div>}
 </div>
}
