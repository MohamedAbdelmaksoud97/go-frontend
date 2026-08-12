"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, FileCheck2, FileUp, Loader2, Search, ShieldCheck } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type UploadGrant={fileId:string;signedUploadUrl:string;expectedVersion?:number;headers?:Record<string,string>}
type Owner={id:string;fullNameAr?:string;memberName?:string;displayName?:string;memberNumber?:string;employeeNumber?:string;expenseNumber?:string;description?:string}
const demoOwners:Record<string,Owner[]>={MEMBER:[{id:"demo-member-1",fullNameAr:"أحمد محمد العتيبي",memberNumber:"GF-2841"},{id:"demo-member-2",fullNameAr:"نورة القحطاني",memberNumber:"GF-1932"}],EMPLOYEE:[{id:"demo-employee-1",fullNameAr:"خالد السبيعي",employeeNumber:"EMP-041"}],EXPENSE:[{id:"demo-expense-1",description:"صيانة أجهزة اللياقة",expenseNumber:"EXP-1082"}]}

export default function FilesPage(){
 const context=useAppContext()
 const [file,setFile]=useState<File>()
 const [ownerType,setOwnerType]=useState("MEMBER")
 const [ownerId,setOwnerId]=useState("")
 const [owners,setOwners]=useState<Owner[]>(()=>hasRuntimeApi()?[]:demoOwners.MEMBER)
 const [kind,setKind]=useState("PROFILE")
 const [progress,setProgress]=useState(0)
 const [message,setMessage]=useState("")
 const [loading,setLoading]=useState(false)
 const [loadingOwners,setLoadingOwners]=useState(hasRuntimeApi())

 useEffect(()=>{
  if(!context.organizationId||!hasRuntimeApi())return
  let cancelled=false
  const resource=ownerType==="MEMBER"?"members":ownerType==="EMPLOYEE"?"employees":"expenses"
  apiRequest<Owner[]|{items:Owner[]}>(`/organizations/${context.organizationId}/${resource}?branchId=${encodeURIComponent(context.branchId)}&limit=100`)
   .then(response=>{if(!cancelled)setOwners(Array.isArray(response.data)?response.data:response.data.items??[])})
   .catch(()=>{if(!cancelled)setOwners([])})
   .finally(()=>{if(!cancelled)setLoadingOwners(false)})
  return()=>{cancelled=true}
 },[context.branchId,context.organizationId,ownerType])

 function changeOwnerType(value:string){setOwnerType(value);setOwnerId("");setOwners(hasRuntimeApi()?[]:demoOwners[value]??[]);setLoadingOwners(hasRuntimeApi())}
 async function upload(){
  if(!file||!context.organizationId)return
  setMessage("");setProgress(0)
  if(file.size>10*1024*1024){setMessage("حجم الملف أكبر من 10 ميجابايت. اختر ملفًا أصغر.");return}
  if(!["application/pdf","image/jpeg","image/png"].includes(file.type)){setMessage("اختر ملف PDF أو صورة بصيغة JPG أو PNG.");return}
  setLoading(true)
  try{
   setProgress(10)
   const hash=await crypto.subtle.digest("SHA-256",await file.arrayBuffer())
   const sha256=[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,"0")).join("")
   setProgress(30)
   const grant=await apiRequest<UploadGrant>(`/organizations/${context.organizationId}/files/upload-requests`,{method:"POST",body:JSON.stringify({branchId:context.branchId,ownerType,ownerId,kind,fileName:file.name,contentType:file.type,sizeBytes:file.size,sha256})})
   setProgress(55)
   const uploaded=await fetch(grant.data.signedUploadUrl,{method:"PUT",headers:grant.data.headers,body:file})
   if(!uploaded.ok)throw new Error()
   setProgress(80)
   await apiRequest(`/organizations/${context.organizationId}/files/${grant.data.fileId}/upload-completions`,{method:"POST",body:JSON.stringify({expectedVersion:grant.data.expectedVersion??1})})
   setProgress(100);setMessage("تم رفع الملف بنجاح. سيظهر للتنزيل بعد اكتمال المراجعة الأمنية.")
  }catch(reason){setMessage(humanError(reason,"تعذر رفع الملف. تحقق من الاتصال وحاول مرة أخرى."))}finally{setLoading(false)}
 }

 return <div className="mx-auto max-w-4xl fade-up">
  <Badge variant="outline"><ShieldCheck/>مستندات آمنة</Badge>
  <h1 className="mt-4 text-3xl font-black">الملفات والمستندات</h1>
  <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">أضف مستندًا إلى ملف عضو أو موظف أو مصروف. الملفات المقبولة PDF وJPG وPNG حتى 10 ميجابايت.</p>
  <Card className="mt-7"><CardHeader><CardTitle>رفع ملف جديد</CardTitle><Badge variant="secondary">حتى 10 ميجابايت</Badge></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2">
   <label className="text-xs font-bold">إضافة المستند إلى<select className="mt-2 h-11 w-full rounded-xl border bg-background px-3" value={ownerType} onChange={event=>changeOwnerType(event.target.value)}><option value="MEMBER">ملف عضو</option><option value="EMPLOYEE">ملف موظف</option><option value="EXPENSE">مستند مصروف</option></select></label>
   <label className="text-xs font-bold">اختر السجل<div className="relative mt-2"><Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><select className="h-11 w-full rounded-xl border bg-background pr-10 pl-3 text-sm" value={ownerId} onChange={event=>setOwnerId(event.target.value)}><option value="">{loadingOwners?"جارٍ تجهيز القائمة...":"اختر من القائمة"}</option>{owners.map(owner=><option key={owner.id} value={owner.id}>{owner.fullNameAr??owner.memberName??owner.displayName??owner.description??"سجل"}{(owner.memberNumber??owner.employeeNumber??owner.expenseNumber)?` — ${owner.memberNumber??owner.employeeNumber??owner.expenseNumber}`:""}</option>)}</select></div></label>
   <label className="text-xs font-bold">نوع المستند<select className="mt-2 h-11 w-full rounded-xl border bg-background px-3" value={kind} onChange={event=>setKind(event.target.value)}><option value="PROFILE">صورة شخصية</option><option value="IDENTITY">إثبات هوية</option><option value="CONSENT">نموذج موافقة</option><option value="ATTACHMENT">مرفق عام</option></select></label>
   <label className="text-xs font-bold">اختر الملف<Input type="file" accept="application/pdf,image/jpeg,image/png" className="mt-2 h-11 pt-2" onChange={event=>setFile(event.target.files?.[0])}/></label>
   {file&&<div className="flex items-center gap-3 rounded-xl bg-secondary p-4 sm:col-span-2"><FileCheck2 className="text-emerald-500"/><div className="min-w-0"><p className="truncate text-xs font-bold">{file.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{(file.size/1024/1024).toFixed(2)} ميجابايت · {file.type==="application/pdf"?"مستند PDF":"صورة"}</p></div></div>}
   {loading&&<div className="sm:col-span-2"><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{width:`${progress}%`}}/></div><p className="mt-2 text-[10px] text-muted-foreground">جارٍ رفع الملف… {progress}%</p></div>}
   {message&&<p className={`rounded-xl p-3 text-xs sm:col-span-2 ${progress===100?"bg-emerald-500/10 text-emerald-600":"bg-red-500/10 text-red-600"}`}>{progress===100&&<CheckCircle2 className="ml-2 inline size-4"/>}{message}</p>}
   <Button className="h-11 sm:col-span-2" onClick={upload} disabled={!file||!ownerId||loading}>{loading?<Loader2 className="animate-spin"/>:<FileUp/>}رفع المستند</Button>
  </CardContent></Card>
 </div>
}
