"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Clipboard, KeyRound, Loader2, RadioTower, RefreshCw, Search, ShieldCheck, UserRoundCog, XCircle } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

type DeviceMode="OBSERVE"|"ENFORCE"
type DeviceStatus="ACTIVE"|"MAINTENANCE"|"DISABLED"
type Device={id:string;branchId:string;name:string;serialNumber:string;model?:string;firmwareVersion?:string;ipAddress?:string;doorCount?:number;readerCount?:number;mode:DeviceMode;status:DeviceStatus;apiKeyPrefix:string;lastSeenAt?:string;lastEventAt?:string;version:number;apiKey?:string}
type EventStatus="ATTENDANCE_RECORDED"|"DEVICE_DENIED"|"UNMAPPED_CREDENTIAL"|"IGNORED"|"FAILED"
type AccessEvent={id:string;deviceId:string;deviceName?:string;deviceOccurredAt:string;doorNumber:number;direction:"IN"|"OUT"|"UNKNOWN";eventType:number;credentialPin?:string;deviceDecision:"ALLOWED"|"DENIED"|"UNKNOWN";processingStatus:EventStatus;processingCode?:string;memberName?:string;memberNumber?:string}
type Member={id:string;name?:string;fullNameAr?:string;memberName?:string;memberNumber?:string;contacts?:Array<{type?:string;value?:string;isPrimary?:boolean}>}
type Credential={id:string;memberId?:string;credentialType:string;credentialValue:string;status:"ACTIVE"|"REVOKED";issuedAt?:string}

const fieldClass="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"

export default function AccessControlPage(){
 const context=useAppContext()
 const canManage=context.canAccess(["attendance.devices.manage"])
 const canManagePins=context.canAccess(["access-credentials.manage"])
 const [devices,setDevices]=useState<Device[]>([])
 const [events,setEvents]=useState<AccessEvent[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState("")
 const [notice,setNotice]=useState("")
 const [registerOpen,setRegisterOpen]=useState(false)
 const [oneTimeKey,setOneTimeKey]=useState("")
 const [busy,setBusy]=useState("")
 const [lastLiveUpdate,setLastLiveUpdate]=useState<Date>()

 const load=useCallback(async()=>{
  if(!context.organizationId||!hasRuntimeApi())return
  setLoading(true);setError("")
  try{const [deviceResponse,eventResponse]=await Promise.all([
   apiRequest<Device[]>(`/organizations/${context.organizationId}/access-devices`),
   apiRequest<AccessEvent[]>(`/organizations/${context.organizationId}/access-device-events?limit=100`),
  ]);setDevices(deviceResponse.data);setEvents(eventResponse.data)}
  catch(reason){setError(humanError(reason,"تعذر تحميل حالة البوابات. تأكد من نشر آخر إصدار للباك إند ثم حاول مجددًا."))}
  finally{setLoading(false)}
 },[context.organizationId])
 useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer)},[load])
 useEffect(()=>{
  function receiveLiveEvents(event:Event){
   const rows=(event as CustomEvent<AccessEvent[]>).detail
   if(!Array.isArray(rows))return
   setEvents(rows)
   setLastLiveUpdate(new Date())
  }
  window.addEventListener("go:access-events",receiveLiveEvents)
  return()=>window.removeEventListener("go:access-events",receiveLiveEvents)
 },[])
 useEffect(()=>{
  if(!context.organizationId||!hasRuntimeApi())return
  let cancelled=false
  async function refreshDevices(){try{const response=await apiRequest<Device[]>(`/organizations/${context.organizationId}/access-devices`);if(!cancelled)setDevices(response.data)}catch{}}
  const timer=window.setInterval(()=>void refreshDevices(),15_000)
  return()=>{cancelled=true;window.clearInterval(timer)}
 },[context.organizationId])

 const currentDevices=useMemo(()=>devices.filter(device=>!context.branchId||device.branchId===context.branchId),[context.branchId,devices])
 const currentDeviceIds=useMemo(()=>new Set(currentDevices.map(device=>device.id)),[currentDevices])
 const currentEvents=useMemo(()=>events.filter(event=>currentDeviceIds.has(event.deviceId)),[currentDeviceIds,events])
 const onlineCount=currentDevices.filter(device=>isOnline(device.lastSeenAt)).length
 const accepted=currentEvents.filter(event=>event.processingStatus==="ATTENDANCE_RECORDED"&&event.deviceDecision==="ALLOWED").length
 const unresolved=currentEvents.filter(event=>event.processingStatus==="UNMAPPED_CREDENTIAL"||event.processingStatus==="FAILED").length

 async function registerDevice(form:HTMLFormElement){
  const data=new FormData(form);setBusy("register");setError("")
  try{const response=await apiRequest<Device>(`/organizations/${context.organizationId}/access-devices`,{method:"POST",body:JSON.stringify({branchId:context.branchId,name:String(data.get("name")),serialNumber:String(data.get("serialNumber")),model:String(data.get("model")),firmwareVersion:String(data.get("firmwareVersion")),ipAddress:String(data.get("ipAddress")),doorCount:Number(data.get("doorCount")),readerCount:Number(data.get("readerCount")),mode:"OBSERVE"})});setOneTimeKey(response.data.apiKey??"");setRegisterOpen(false);setNotice("تم تسجيل اللوحة في وضع المراقبة الآمن. انسخ مفتاح الربط الآن.");await load()}
  catch(reason){setError(humanError(reason,"تعذر تسجيل لوحة البوابة. راجع الرقم التسلسلي وعنوان الشبكة."))}finally{setBusy("")}
 }
 async function updateDevice(device:Device,mode:DeviceMode,status:DeviceStatus){
  setBusy(device.id);setError("")
  try{await apiRequest(`/organizations/${context.organizationId}/access-devices/${device.id}`,{method:"PATCH",body:JSON.stringify({expectedVersion:device.version,mode,status})});setNotice(mode==="ENFORCE"?"تم تفعيل وضع التنفيذ. سيطبق الـBridge خطة صلاحيات GO عند تفعيل الكتابة محليًا.":"تم حفظ إعدادات لوحة البوابة.");await load()}
  catch(reason){setError(humanError(reason,"تعذر تحديث اللوحة. حدّث الصفحة وحاول مجددًا."))}finally{setBusy("")}
 }
 async function rotateKey(device:Device){
  setBusy(device.id);setError("")
  try{const response=await apiRequest<Device>(`/organizations/${context.organizationId}/access-devices/${device.id}/key-rotations`,{method:"POST",body:JSON.stringify({expectedVersion:device.version})});setOneTimeKey(response.data.apiKey??"");setNotice("تم إلغاء المفتاح القديم. انسخ المفتاح الجديد إلى إعدادات الـBridge.");await load()}
  catch(reason){setError(humanError(reason,"تعذر تدوير مفتاح الربط. حدّث الصفحة وحاول مجددًا."))}finally{setBusy("")}
 }

 return <div className="space-y-6 fade-up">
  <header className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap gap-2"><Badge variant="outline"><RadioTower/>التحكم في الوصول</Badge><Badge variant="success"><span className="size-2 animate-pulse rounded-full bg-current"/>اتصال مباشر فوري</Badge></div><h1 className="mt-4 text-3xl font-black">البوابات والبصمة</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">ربط لوحة ZKTeco بقرارات الدخول في GO ومتابعة كل حدث دون تخزين قوالب البصمة.{lastLiveUpdate&&<span className="mr-2">آخر تحديث حي: {lastLiveUpdate.toLocaleTimeString("ar-EG")}</span>}</p></div><div className="flex gap-2"><Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?"animate-spin":""}/>تحديث</Button>{canManage&&<Button onClick={()=>setRegisterOpen(true)}><RadioTower/>تسجيل لوحة</Button>}</div></header>
  {error&&<p role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm font-bold text-red-600">{error}</p>}
  {notice&&<p role="status" className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-700 dark:text-emerald-400">{notice}</p>}
  {oneTimeKey&&<OneTimeKey value={oneTimeKey} onClose={()=>setOneTimeKey("")}/>}

  <section className="grid gap-4 sm:grid-cols-3" aria-label="ملخص حالة الربط">
   <Metric icon={<RadioTower/>} label="اللوحات المتصلة" value={`${onlineCount} / ${currentDevices.length}`} note="متصل خلال آخر دقيقتين"/>
   <Metric icon={<ShieldCheck/>} label="أحداث مقبولة" value={String(accepted)} note="ضمن آخر 100 حدث"/>
   <Metric icon={<UserRoundCog/>} label="تحتاج مراجعة" value={String(unresolved)} note="PIN غير مربوط أو فشل معالجة"/>
  </section>

  {context.canAccess(["access-credentials.read","access-credentials.manage"])&&<PinAssignment canManage={canManagePins} organizationId={context.organizationId}/>}

  <Card><CardHeader><div><CardTitle>لوحة البوابة</CardTitle><CardDescription>بوابة فعلية واحدة بقارئ للدخول وقارئ للخروج. أرقام المنافذ تخص لوحة التحكم وليست أبوابًا منفصلة.</CardDescription></div></CardHeader><CardContent>
   {loading?<Loading/>:currentDevices.length===0?<Empty text="لا توجد لوحة مسجلة لهذا الفرع بعد."/>:<div className="grid gap-4 xl:grid-cols-2">{currentDevices.map(device=><article key={device.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black">{device.name}</h3><p className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">{device.model??"ZKTeco"} · {device.serialNumber}</p></div><div className="flex gap-2"><Badge variant={isOnline(device.lastSeenAt)?"success":"danger"}>{isOnline(device.lastSeenAt)?"متصل":"غير متصل"}</Badge><Badge variant={device.mode==="ENFORCE"?"warning":"outline"}>{device.mode==="ENFORCE"?"تنفيذ":"مراقبة"}</Badge></div></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><Info label="الشبكة" value={device.ipAddress??"—"}/><Info label="مخارج اللوحة / القارئات" value={`${device.doorCount??"—"} / ${device.readerCount??"—"}`}/><Info label="آخر اتصال" value={formatDate(device.lastSeenAt)}/><Info label="آخر حدث" value={formatDate(device.lastEventAt)}/></dl>{canManage&&<div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy===device.id} onClick={()=>void updateDevice(device,device.mode==="OBSERVE"?"ENFORCE":"OBSERVE",device.status)}>{busy===device.id?<Loader2 className="animate-spin"/>:<ShieldCheck/>}{device.mode==="OBSERVE"?"الانتقال للتنفيذ":"العودة للمراقبة"}</Button><Button size="sm" variant="outline" disabled={busy===device.id} onClick={()=>void updateDevice(device,device.mode,device.status==="ACTIVE"?"MAINTENANCE":"ACTIVE")}>{device.status==="ACTIVE"?"وضع الصيانة":"استئناف اللوحة"}</Button><Button size="sm" variant="ghost" disabled={busy===device.id} onClick={()=>void rotateKey(device)}><KeyRound/>تغيير المفتاح</Button></div>}</article>)}</div>}
  </CardContent></Card>

  <Card><CardHeader><div><CardTitle>سجل أحداث البوابة</CardTitle><CardDescription>السجل الخام محفوظ للمتابعة، وقرار GO ظاهر بجوار قرار اللوحة.</CardDescription></div></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[900px] text-sm"><thead className="border-y bg-secondary/50 text-xs text-muted-foreground"><tr><th className="p-3 text-right">الوقت</th><th className="p-3 text-right">العضو</th><th className="p-3 text-right">PIN</th><th className="p-3 text-right">نقطة القراءة</th><th className="p-3 text-right">قرار اللوحة</th><th className="p-3 text-right">معالجة GO</th></tr></thead><tbody>{loading?<tr><td colSpan={6}><Loading/></td></tr>:currentEvents.length===0?<tr><td colSpan={6}><Empty text="لم تصل أحداث من الـBridge لهذا الفرع بعد."/></td></tr>:currentEvents.map(event=><tr key={event.id} className="border-b last:border-0"><td className="p-3 whitespace-nowrap">{formatDate(event.deviceOccurredAt)}</td><td className="p-3"><span className="font-bold">{event.memberName??"غير معروف"}</span>{event.memberNumber&&<span className="mt-1 block text-xs text-muted-foreground">{event.memberNumber}</span>}</td><td className="p-3 font-mono" dir="ltr">{event.credentialPin??"—"}</td><td className="p-3"><span className="font-bold">{readerLabel(event)}</span><span className="mt-1 block text-xs text-muted-foreground">منفذ اللوحة {event.doorNumber}</span></td><td className="p-3"><Badge variant={event.deviceDecision==="ALLOWED"?"success":event.deviceDecision==="DENIED"?"danger":"outline"}>{event.deviceDecision==="ALLOWED"?"فتح":event.deviceDecision==="DENIED"?eventReason(event.eventType):"غير معروف"}</Badge></td><td className="p-3"><Badge variant={event.processingStatus==="ATTENDANCE_RECORDED"?"success":event.processingStatus==="IGNORED"?"outline":"warning"}>{processingLabel(event)}</Badge></td></tr>)}</tbody></table></CardContent></Card>

  {registerOpen&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="register-device-title"><form className="w-full max-w-2xl rounded-3xl border bg-card p-6 shadow-2xl" onSubmit={event=>{event.preventDefault();void registerDevice(event.currentTarget)}}><div className="flex justify-between gap-4"><div><h2 id="register-device-title" className="text-xl font-black">تسجيل لوحة ZKTeco</h2><p className="mt-1 text-sm text-muted-foreground">القيم مكتملة من اختبار ACP-260 الحالي ويمكن تعديلها.</p></div><Button type="button" size="icon" variant="ghost" onClick={()=>setRegisterOpen(false)} aria-label="إغلاق"><XCircle/></Button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field name="name" label="اسم واضح للوحة" value="بوابة الفرع الرئيسية"/><Field name="serialNumber" label="الرقم التسلسلي" value="BRI3232060149" ltr/><Field name="model" label="الموديل" value="ACP-260" ltr/><Field name="firmwareVersion" label="إصدار البرنامج" value="AC Ver 5.2.5 Jun 6 2019" ltr/><Field name="ipAddress" label="عنوان IP داخل النادي" value="192.168.1.201" ltr/><div className="grid grid-cols-2 gap-3"><Field name="doorCount" label="مخارج اللوحة" value="2" type="number"/><Field name="readerCount" label="القارئات" value="4" type="number"/></div></div><p className="mt-4 rounded-xl bg-amber-500/10 p-3 text-xs leading-6 text-amber-700 dark:text-amber-300">سيتم التسجيل في وضع المراقبة أولًا. مفتاح الاتصال يظهر مرة واحدة فقط ولا يحتوي على كلمة مرور الجهاز.</p><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={()=>setRegisterOpen(false)}>إلغاء</Button><Button disabled={busy==="register"}>{busy==="register"?<Loader2 className="animate-spin"/>:<RadioTower/>}تسجيل وإصدار المفتاح</Button></div></form></div>}
 </div>
}

function PinAssignment({canManage,organizationId}:{canManage:boolean;organizationId:string}){
 const context=useAppContext();const [query,setQuery]=useState("");const [members,setMembers]=useState<Member[]>([]);const [selected,setSelected]=useState<Member>();const [pin,setPin]=useState("");const [current,setCurrent]=useState<Credential>();const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [error,setError]=useState("")
 useEffect(()=>{if(!selected&&query.trim().length>=2){const timer=window.setTimeout(()=>{apiRequest<Member[]|{items:Member[]}>(`/organizations/${organizationId}/members?branchId=${context.branchId}&search=${encodeURIComponent(query.trim())}&limit=12`).then(response=>setMembers(Array.isArray(response.data)?response.data:response.data.items??[])).catch(()=>setMembers([]))},250);return()=>window.clearTimeout(timer)}},[context.branchId,organizationId,query,selected])
 async function choose(member:Member){setSelected(member);setQuery(memberName(member));setMembers([]);setCurrent(undefined);setPin("");setError("");try{const response=await apiRequest<Credential[]>(`/organizations/${organizationId}/access-credentials?subjectType=MEMBER&subjectId=${member.id}`);const credential=response.data.find(item=>item.credentialType==="FINGERPRINT_USER_ID"&&item.status==="ACTIVE");setCurrent(credential);setPin(credential?.credentialValue??"")}catch(reason){setError(humanError(reason,"تعذر تحميل رقم بصمة العضو. حاول مجددًا."))}}
 async function assign(){if(!selected)return;setBusy(true);setError("");setMessage("");try{const response=await apiRequest<Credential>(`/organizations/${organizationId}/access-credentials/fingerprint-pins`,{method:"POST",body:JSON.stringify({subjectType:"MEMBER",subjectId:selected.id,pin})});setCurrent(response.data);setMessage(`تم ربط PIN ${pin} بالعضو ${memberName(selected)}. رقم عضويته في GO لم يتغير.`)}catch(reason){setError(humanError(reason,"تعذر ربط رقم البصمة. تأكد أنه أرقام فقط وغير مستخدم لعضو آخر."))}finally{setBusy(false)}}
 return <Card><CardHeader><div><CardTitle>رقم البصمة الرقمي للعضو</CardTitle><CardDescription>العضو القديم يحتفظ بكوده الرقمي السابق، والجديد يحصل على PIN فريد تلقائيًا. استخدم هذا الجزء للمراجعة أو التصحيح فقط؛ رقم العضوية مثل GO00656 لا يتغير.</CardDescription></div></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-[1fr_.55fr_auto]"><label className="relative text-xs font-bold">العضو<div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"/><input className={`${fieldClass} pr-10`} value={query} onChange={event=>{setSelected(undefined);setCurrent(undefined);setMembers([]);setQuery(event.target.value)}} placeholder="الاسم أو رقم العضوية أو الجوال" autoComplete="off"/>{members.length>0&&<div className="absolute inset-x-0 top-full z-30 mt-2 max-h-64 overflow-auto rounded-xl border bg-popover p-2 shadow-xl">{members.map(member=><button key={member.id} type="button" onClick={()=>void choose(member)} className="block w-full rounded-lg p-3 text-right hover:bg-secondary"><strong>{memberName(member)}</strong><span className="mt-1 block text-xs text-muted-foreground" dir="ltr">{member.memberNumber??"—"}</span></button>)}</div>}</div></label><label className="text-xs font-bold">PIN جهاز البصمة<input className={fieldClass} dir="ltr" inputMode="numeric" pattern="[1-9][0-9]{0,8}" maxLength={9} value={pin} onChange={event=>setPin(event.target.value.replace(/\D/gu,"").replace(/^0+/u,"").slice(0,9))} placeholder="مثال: 22782"/></label><Button className="mt-auto h-11" disabled={!canManage||!selected||!pin||busy} onClick={()=>void assign()}>{busy?<Loader2 className="animate-spin"/>:<UserRoundCog/>}{current?"حفظ التصحيح":"ربط كود قديم"}</Button></div>{current&&<p className="mt-3 text-xs text-muted-foreground">الرقم المرتبط تلقائيًا حاليًا: <strong dir="ltr">{current.credentialValue}</strong></p>}{message&&<p role="status" className="mt-3 text-sm font-bold text-emerald-600">{message}</p>}{error&&<p role="alert" className="mt-3 text-sm font-bold text-red-600">{error}</p>}</CardContent></Card>
}

function OneTimeKey({value,onClose}:{value:string;onClose:()=>void}){const [copied,setCopied]=useState(false);return <Card className="border-amber-500/40 bg-amber-500/5"><CardHeader><div><CardTitle>مفتاح الـBridge — يظهر مرة واحدة</CardTitle><CardDescription>انسخه إلى DeviceApiKey في bridge.config.ini ولا ترسله في رسالة أو صورة.</CardDescription></div><Button size="icon" variant="ghost" onClick={onClose} aria-label="إخفاء المفتاح"><XCircle/></Button></CardHeader><CardContent><code className="block overflow-x-auto rounded-xl border bg-background p-4 text-left text-xs" dir="ltr">{value}</code><Button className="mt-3" variant="outline" onClick={async()=>{await navigator.clipboard.writeText(value);setCopied(true)}}>{copied?<CheckCircle2/>:<Clipboard/>}{copied?"تم النسخ":"نسخ المفتاح"}</Button></CardContent></Card>}
function Metric({icon,label,value,note}:{icon:React.ReactNode;label:string;value:string;note:string}){return <Card><CardContent className="flex items-center gap-4"><span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-black">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{note}</p></div></CardContent></Card>}
function Info({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-secondary/55 p-3"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-bold" dir={label==="الشبكة"?"ltr":undefined}>{value}</dd></div>}
function Field({name,label,value,ltr,type="text"}:{name:string;label:string;value:string;ltr?:boolean;type?:string}){return <label className="text-xs font-bold">{label}<input required name={name} type={type} defaultValue={value} dir={ltr?"ltr":undefined} min={type==="number"?1:undefined} max={type==="number"?16:undefined} className={fieldClass}/></label>}
function Loading(){return <div className="grid min-h-32 place-items-center"><Loader2 className="animate-spin text-primary"/><span className="sr-only">جارٍ التحميل</span></div>}
function Empty({text}:{text:string}){return <div className="grid min-h-32 place-items-center text-sm text-muted-foreground">{text}</div>}
function memberName(member:Member){return member.name??member.fullNameAr??member.memberName??"عضو بدون اسم"}
function isOnline(value?:string){return Boolean(value&&Date.now()-new Date(value).getTime()<120_000)}
function formatDate(value?:string){return value?new Intl.DateTimeFormat("ar-EG",{dateStyle:"short",timeStyle:"short"}).format(new Date(value)):"—"}
function eventReason(type:number){return type===29?"صلاحية منتهية":type===34?"بصمة غير مسجلة":`رفض اللوحة (${type})`}
function readerLabel(event:AccessEvent){return event.direction==="IN"?"قارئ الدخول":event.direction==="OUT"?"قارئ الخروج":"قارئ غير محدد"}
function processingLabel(event:AccessEvent){if(event.processingStatus==="ATTENDANCE_RECORDED")return event.processingCode==="SYSTEM_ACCEPTED"?"دخول مسجل":"رفضه GO";if(event.processingStatus==="UNMAPPED_CREDENTIAL")return "PIN غير مربوط";if(event.processingStatus==="DEVICE_DENIED")return "رفض من اللوحة";if(event.processingStatus==="FAILED")return "فشل المعالجة";return event.direction==="OUT"?"حدث خروج":"تم التجاهل"}
