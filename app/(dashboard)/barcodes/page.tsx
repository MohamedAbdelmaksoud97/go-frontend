"use client"

import { useEffect, useState } from "react"
import { Barcode, Check, Loader2, Printer, Search, X } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type Credential={id?:string;value?:string;code?:string;svg?:string;subjectName?:string;subjectType?:string}
type Person={id:string;name?:string;fullNameAr?:string;memberName?:string;displayName?:string;memberNumber?:string;employeeNumber?:string;nationalId?:string;contacts?:Array<{type?:string;value?:string;isPrimary?:boolean}>}

export default function BarcodesPage(){
 const context=useAppContext()
 const [subjectType,setSubjectType]=useState("MEMBER")
 const [subjectId,setSubjectId]=useState("")
 const [selectedPerson,setSelectedPerson]=useState<Person>()
 const [query,setQuery]=useState("")
 const [people,setPeople]=useState<Person[]>([])
 const [credential,setCredential]=useState<Credential>()
 const [loading,setLoading]=useState(false)
 const [loadingPeople,setLoadingPeople]=useState(false)
 const [searchError,setSearchError]=useState("")
 const [error,setError]=useState("")

 useEffect(()=>{
  const search=query.trim()
  if(!context.organizationId||!context.branchId||!hasRuntimeApi()||search.length<2)return
  let cancelled=false
  const resource=subjectType==="MEMBER"?"members":"employees"
  const activeFilter=subjectType==="MEMBER"?"&status=ACTIVE":""
  const timer=window.setTimeout(()=>{
   setLoadingPeople(true);setSearchError("");setPeople([])
   apiRequest<Person[]|{items:Person[]}>(`/organizations/${context.organizationId}/${resource}?branchId=${encodeURIComponent(context.branchId)}&search=${encodeURIComponent(search)}&limit=20${activeFilter}`)
    .then(response=>{if(!cancelled)setPeople(Array.isArray(response.data)?response.data:response.data.items??[])})
    .catch(reason=>{if(!cancelled){setPeople([]);setSearchError(humanError(reason,subjectType==="MEMBER"?"تعذر البحث عن الأعضاء في الفرع الحالي.":"تعذر البحث عن الموظفين المتاحين."))}})
    .finally(()=>{if(!cancelled)setLoadingPeople(false)})
  },300)
  return()=>{cancelled=true;window.clearTimeout(timer)}
 },[context.branchId,context.organizationId,query,subjectType])

 function changeType(value:string){setSubjectType(value);setSubjectId("");setSelectedPerson(undefined);setQuery("");setPeople([]);setSearchError("");setCredential(undefined)}
 function selectPerson(person:Person){setSubjectId(person.id);setSelectedPerson(person);setQuery("");setPeople([]);setSearchError("");setCredential(undefined)}
 function clearPerson(){setSubjectId("");setSelectedPerson(undefined);setQuery("");setPeople([]);setCredential(undefined)}
 async function issue(){setLoading(true);setError("");try{const response=await apiRequest<Credential>(`/organizations/${context.organizationId}/access-credentials/barcodes`,{method:"POST",body:JSON.stringify({subjectType,subjectId})});setCredential(response.data)}catch(reason){setError(humanError(reason,"تعذر إصدار بطاقة الدخول. حاول مرة أخرى."))}finally{setLoading(false)}}

 return <div className="mx-auto max-w-4xl fade-up">
  <Badge variant="outline"><Barcode/>بطاقات الدخول</Badge>
  <h1 className="mt-4 text-3xl font-black">إصدار وطباعة بطاقة دخول</h1>
  <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">اختر العضو أو الموظف، ثم أصدر بطاقة جاهزة للاستخدام والطباعة.</p>
  <Card className="mt-7 print:hidden"><CardContent className="grid gap-4 p-5 sm:grid-cols-[.7fr_1.3fr_auto]">
   <label className="text-xs font-bold">البطاقة تخص<select className="mt-2 h-11 w-full rounded-xl border bg-background px-3" value={subjectType} onChange={event=>changeType(event.target.value)}><option value="MEMBER">عضو</option><option value="EMPLOYEE">موظف</option></select></label>
   <label className="text-xs font-bold">{subjectType==="MEMBER"?"ابحث واختر العضو":"ابحث واختر الموظف"}<div className="relative mt-2">
    <Search className="pointer-events-none absolute right-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"/>
    <input role="combobox" aria-expanded={!selectedPerson&&query.trim().length>=2} aria-controls="person-search-results" aria-autocomplete="list" autoComplete="off" className="h-11 w-full rounded-xl border bg-background pr-10 pl-10 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" value={selectedPerson?personLabel(selectedPerson):query} placeholder={subjectType==="MEMBER"?"الاسم أو رقم العضوية أو الهاتف أو رقم الهوية":"الاسم أو الرقم الوظيفي"} onChange={event=>{const next=event.target.value;setSelectedPerson(undefined);setSubjectId("");setQuery(next);setPeople([]);setLoadingPeople(next.trim().length>=2);setSearchError("");setCredential(undefined)}}/>
    {(selectedPerson||query)&&<button type="button" onClick={clearPerson} className="absolute left-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="مسح الاختيار"><X className="size-4"/></button>}
    {!selectedPerson&&query.trim().length>=2&&<div id="person-search-results" role="listbox" className="absolute inset-x-0 top-[calc(100%+.45rem)] z-30 max-h-72 overflow-y-auto rounded-2xl border bg-popover p-2 shadow-2xl">
     {loadingPeople?<div className="grid min-h-24 place-items-center"><Loader2 className="animate-spin text-primary"/></div>:people.length?people.map(person=><button key={person.id} type="button" role="option" aria-selected={subjectId===person.id} onClick={()=>selectPerson(person)} className="flex w-full items-center gap-3 rounded-xl p-3 text-right transition hover:bg-secondary"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 font-black text-primary">{personName(person).charAt(0)||"ع"}</span><span className="min-w-0 flex-1"><span className="block truncate font-black">{personName(person)}</span><span className="mt-1 block truncate text-[11px] text-muted-foreground" dir="ltr">{personSecondary(person)}</span></span><Check className="size-4 opacity-0"/></button>):<p className="p-5 text-center text-xs leading-6 text-muted-foreground">{searchError||"لا توجد نتائج مطابقة في الفرع الحالي."}</p>}
    </div>}
   </div><span className="mt-2 block text-[10px] font-normal text-muted-foreground">{selectedPerson?`تم اختيار ${personName(selectedPerson)}.`:query.trim().length>0&&query.trim().length<2?"اكتب حرفين أو رقمين على الأقل لبدء البحث.":subjectType==="MEMBER"?"يبحث النظام داخل أعضاء الفرع الحالي فقط.":"يبحث النظام في الموظفين المتاحين لك."}</span></label>
   <Button className="mt-auto h-11" onClick={issue} disabled={!subjectId||loading}>{loading?<Loader2 className="animate-spin"/>:<Barcode/>}إصدار البطاقة</Button>
  </CardContent></Card>
  {error&&<p className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs text-red-600">{error}</p>}
  {credential&&<div className="mx-auto mt-8 max-w-sm rounded-3xl border-2 border-black bg-white p-7 text-center text-black shadow-xl print:mt-0 print:shadow-none"><div className="text-2xl font-black">GO <span className="text-[#dba900]">FITNESS</span></div><p className="mt-5 text-sm font-bold">{credential.subjectName??"عضو GO Fitness"}</p><p className="mt-1 text-[10px] text-zinc-500">{subjectType==="MEMBER"?"بطاقة عضو":"بطاقة موظف"}</p>{credential.svg&&<div className="mt-6 flex justify-center" dangerouslySetInnerHTML={{__html:credential.svg}}/>}<p dir="ltr" className="mt-4 font-mono tracking-[.2em]">{credential.value??credential.code}</p><Button className="mt-6 print:hidden" onClick={()=>window.print()}><Printer/>طباعة البطاقة</Button></div>}
 </div>
}

function personName(person:Person){return person.name??person.fullNameAr??person.memberName??person.displayName??"اسم غير متاح"}
function personLabel(person:Person){const number=person.memberNumber??person.employeeNumber;return `${personName(person)}${number?` — ${number}`:""}`}
function personSecondary(person:Person){const number=person.memberNumber??person.employeeNumber;const phone=person.contacts?.find(contact=>contact.type==="PHONE"&&contact.isPrimary)?.value??person.contacts?.find(contact=>contact.type==="PHONE")?.value;return [number,phone].filter(Boolean).join(" · ")||"لا توجد بيانات تعريف إضافية"}
