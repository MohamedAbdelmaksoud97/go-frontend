"use client"

import Link from "next/link"
import { useState } from "react"
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { executeOperation, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

export default function JoinPage(){
 const organizationId=process.env.NEXT_PUBLIC_ORGANIZATION_ID??""
 const[form,setForm]=useState({memberNumber:"",phone:"+9665",activationCode:"",password:"",confirmPassword:""})
 const[showPassword,setShowPassword]=useState(false),[loading,setLoading]=useState(false),[done,setDone]=useState(false),[error,setError]=useState("")

 async function submit(event:React.FormEvent){
  event.preventDefault();setError("")
  if(form.password.length<12){setError("كلمة المرور يجب ألا تقل عن 12 حرفًا.");return}
  if(form.password!==form.confirmPassword){setError("كلمتا المرور غير متطابقتين.");return}
  setLoading(true)
  try{
   if(!organizationId)throw new Error("صفحة تفعيل الحساب غير مهيأة حاليًا. تواصل مع استقبال النادي.")
   if(hasRuntimeApi())await executeOperation("/api/v1/auth/member/account-activations","post",{},{organizationId,memberNumber:form.memberNumber,phone:form.phone,activationCode:form.activationCode,password:form.password})
   setDone(true)
  }catch(reason){setError(humanError(reason,"تعذر تفعيل الحساب. راجع البيانات أو اطلب رمزًا جديدًا من الاستقبال."))}finally{setLoading(false)}
 }

 return <main dir="rtl" className="relative grid min-h-screen place-items-center overflow-hidden bg-[#10100f] p-5 text-white"><div className="absolute inset-0 dot-grid opacity-20"/><div className="absolute -top-40 right-0 size-[500px] rounded-full bg-primary/20 blur-[120px]"/><div className="relative z-10 w-full max-w-xl rounded-[32px] border border-white/10 bg-white/[.045] p-6 backdrop-blur-xl sm:p-9"><BrandLogo className="text-white"/>{done?<div className="py-14 text-center"><CheckCircle2 className="mx-auto size-16 text-emerald-400"/><h1 className="mt-5 text-3xl font-black">تم تفعيل حسابك</h1><p className="mt-3 text-sm leading-7 text-white/55">ارتبط الحساب تلقائيًا بعضويتك واشتراكاتك وفواتيرك. يمكنك الآن تسجيل الدخول برقم الجوال وكلمة المرور.</p><Link href="/login" className={buttonVariants({size:"lg",className:"mt-7 w-full"})}>الانتقال إلى تسجيل الدخول</Link></div>:<><div className="mt-9"><span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"><ShieldCheck className="size-3"/>لأعضاء النادي المسجلين فقط</span><h1 className="mt-4 text-3xl font-black">تفعيل حساب العضو</h1><p className="mt-2 text-sm leading-7 text-white/50">لا تنشئ هذه الصفحة عضوية جديدة. اطلب من موظف الاستقبال رمز التفعيل، ثم أدخل رقم عضويتك والجوال المسجل وحدد كلمة المرور.</p></div><form onSubmit={submit} className="mt-7 grid gap-4"><label className="text-xs font-bold">رقم العضوية<Input dir="ltr" autoComplete="username" className="mt-2 border-white/10 bg-white/5 text-white" required value={form.memberNumber} onChange={event=>setForm(current=>({...current,memberNumber:event.target.value.toUpperCase()}))} placeholder="GO000001"/></label><label className="text-xs font-bold">رقم الجوال المسجل<Input dir="ltr" type="tel" className="mt-2 border-white/10 bg-white/5 text-white" required value={form.phone} onChange={event=>setForm(current=>({...current,phone:event.target.value}))} placeholder="+9665XXXXXXXX"/></label><label className="text-xs font-bold">رمز التفعيل<Input dir="ltr" inputMode="numeric" maxLength={8} className="mt-2 border-white/10 bg-white/5 text-center text-lg tracking-[.35em] text-white" required value={form.activationCode} onChange={event=>setForm(current=>({...current,activationCode:event.target.value.replace(/\D/g,"")}))} placeholder="00000000"/></label><label className="text-xs font-bold">كلمة المرور الجديدة<span className="relative mt-2 block"><Input dir="ltr" type={showPassword?"text":"password"} autoComplete="new-password" className="border-white/10 bg-white/5 pl-12 text-white" required value={form.password} onChange={event=>setForm(current=>({...current,password:event.target.value}))}/><button type="button" onClick={()=>setShowPassword(value=>!value)} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/55" aria-label={showPassword?"إخفاء كلمة المرور":"إظهار كلمة المرور"}>{showPassword?<EyeOff/>:<Eye/>}</button></span><span className="mt-2 block text-[10px] font-normal text-white/40">12 حرفًا على الأقل.</span></label><label className="text-xs font-bold">تأكيد كلمة المرور<Input dir="ltr" type={showPassword?"text":"password"} autoComplete="new-password" className="mt-2 border-white/10 bg-white/5 text-white" required value={form.confirmPassword} onChange={event=>setForm(current=>({...current,confirmPassword:event.target.value}))}/></label>{error&&<p role="alert" className="rounded-xl bg-red-500/15 p-3 text-xs text-red-300">{error}</p>}<Button type="submit" size="lg" className="h-12" disabled={loading}>{loading?<Loader2 className="animate-spin"/>:<KeyRound/>}{loading?"جارٍ ربط الحساب...":"تفعيل الحساب وربطه بالعضوية"}</Button><Link href="/login" className={buttonVariants({variant:"ghost",className:"w-full"})}>لدي حساب بالفعل — تسجيل الدخول</Link></form></>}</div></main>
}
