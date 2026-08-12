"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle2, Dumbbell, Eye, EyeOff, Loader2, LockKeyhole, Moon, Phone, ShieldCheck, Sun } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ApiError, hasRuntimeApi, requestOtp, verifyOtp } from "@/lib/api-client"

export default function LoginPage(){
 const router=useRouter();const [step,setStep]=useState<"phone"|"code">("phone");const [phone,setPhone]=useState("05");const [code,setCode]=useState("");const [loading,setLoading]=useState(false);const [error,setError]=useState("");const [seconds,setSeconds]=useState(0);const [dark,setDark]=useState(false);const [showCode,setShowCode]=useState(false)
 useEffect(()=>{const frame=requestAnimationFrame(()=>setDark(document.documentElement.classList.contains("dark")));return()=>cancelAnimationFrame(frame)},[])
 useEffect(()=>{if(seconds<=0)return;const timer=setInterval(()=>setSeconds(s=>s-1),1000);return()=>clearInterval(timer)},[seconds])
 function toggle(){const next=!dark;setDark(next);document.documentElement.classList.toggle("dark",next);localStorage.setItem("go-theme",next?"dark":"light")}
 function normalized(){return phone.startsWith("05")?`+966${phone.slice(1).replace(/\s/g,"")}`:phone.replace(/\s/g,"")}
 async function submit(e:React.FormEvent){e.preventDefault();setError("");setLoading(true);try{if(step==="phone"){if(phone.replace(/\D/g,"").length<10)throw new Error("أدخل رقم جوال سعودي صحيح");if(hasRuntimeApi())await requestOtp(normalized());await new Promise(r=>setTimeout(r,hasRuntimeApi()?0:650));setStep("code");setSeconds(45)}else{if(code.length!==6)throw new Error("أدخل رمز التحقق المكوّن من 6 أرقام");if(hasRuntimeApi())await verifyOtp(normalized(),code);await new Promise(r=>setTimeout(r,hasRuntimeApi()?0:500));router.push("/")}}catch(err){setError(err instanceof ApiError?err.problem.detail:err instanceof Error?err.message:"تعذر إكمال الطلب") }finally{setLoading(false)}}
 return <main dir="rtl" className="relative min-h-screen overflow-hidden bg-[#0b0b0a] text-white">
  <div className="absolute inset-0 opacity-25 dot-grid"/><div className="absolute -right-40 -top-40 size-[520px] rounded-full bg-primary/20 blur-[120px]"/><div className="absolute -bottom-40 left-0 size-[420px] rounded-full bg-primary/10 blur-[120px]"/>
  <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
   <section className="hidden flex-col justify-between p-12 lg:flex xl:p-20">
    <BrandLogo className="text-white"/>
    <div className="max-w-xl"><span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary"><Dumbbell className="size-4"/> إدارة أذكى. أداء أقوى.</span><h1 className="mt-7 text-5xl font-black leading-[1.3] xl:text-6xl">كل ما يحتاجه ناديك<br/><span className="text-primary">في مكان واحد.</span></h1><p className="mt-6 max-w-lg text-base leading-8 text-white/55">تابع الأعضاء، الاشتراكات، الحضور، المبيعات وأداء الفروع من لوحة تشغيل صُممت لتجعل يومك أبسط.</p>
    <div className="mt-10 grid grid-cols-3 gap-4">{[["2,847","عضو"],["99.9%","وقت تشغيل"],["3","فروع"]].map(x=><div key={x[1]} className="rounded-2xl border border-white/8 bg-white/[.035] p-4"><b className="block text-xl text-primary">{x[0]}</b><span className="mt-1 block text-[10px] text-white/40">{x[1]}</span></div>)}</div></div>
    <p className="text-[10px] text-white/30">© 2026 GO Fitness. جميع الحقوق محفوظة.</p>
   </section>
   <section className="flex min-h-screen items-center justify-center bg-background p-5 text-foreground lg:rounded-r-[48px]">
    <Button variant="outline" size="icon" onClick={toggle} className="absolute left-5 top-5" aria-label="تغيير المظهر">{dark?<Sun/>:<Moon/>}</Button>
    <div className="w-full max-w-md fade-up"><BrandLogo className="mb-12 justify-center lg:hidden"/><div className="mb-8"><div className="mb-5 grid size-12 place-items-center rounded-2xl bg-primary/15 text-amber-600">{step==="phone"?<LockKeyhole/>:<ShieldCheck/>}</div><h2 className="text-3xl font-black">{step==="phone"?"مرحبًا بعودتك":"تحقق من جوالك"}</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{step==="phone"?"أدخل رقم الجوال المسجل للوصول إلى حسابك بأمان.":<>أرسلنا رمز تحقق إلى <b dir="ltr">{normalized()}</b></>}</p></div>
    <form onSubmit={submit} className="space-y-5">{step==="phone"?<label className="block text-xs font-bold">رقم الجوال<div className="relative mt-2"><Phone className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input dir="ltr" inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} className="h-12 px-11 text-right text-base" placeholder="05X XXX XXXX" autoFocus/><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">SA +966</span></div></label>:<div><label className="block text-xs font-bold">رمز التحقق<div className="relative mt-2"><Input dir="ltr" inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} type={showCode?"text":"password"} className="h-14 px-12 text-center text-2xl font-black tracking-[.55em]" placeholder="••••••" autoFocus/><button type="button" onClick={()=>setShowCode(v=>!v)} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="إظهار الرمز">{showCode?<EyeOff className="size-4"/>:<Eye className="size-4"/>}</button></div></label><div className="mt-3 flex items-center justify-between text-xs"><button type="button" onClick={()=>setStep("phone")} className="font-bold text-amber-600">تغيير الرقم</button>{seconds>0?<span className="text-muted-foreground">إعادة الإرسال خلال 00:{String(seconds).padStart(2,"0")}</span>:<button type="button" onClick={()=>setSeconds(45)} className="font-bold text-amber-600">إعادة إرسال الرمز</button>}</div></div>}
    {error&&<p role="alert" className="rounded-xl bg-red-500/10 p-3 text-xs font-semibold text-red-600">{error}</p>}
    <Button type="submit" size="lg" className="h-12 w-full text-sm font-bold brand-shadow" disabled={loading}>{loading?<Loader2 className="animate-spin"/>:step==="phone"?<><span>إرسال رمز التحقق</span><ArrowLeft/></>:<><span>تسجيل الدخول</span><CheckCircle2/></>}</Button></form>
    {!hasRuntimeApi()&&<button onClick={()=>router.push("/")} className="mt-5 w-full text-center text-[11px] font-bold text-muted-foreground transition hover:text-foreground">الدخول إلى النسخة الاستعراضية</button>}
    <div className="mt-8 flex items-center justify-center gap-2 text-[10px] text-muted-foreground"><ShieldCheck className="size-3.5 text-emerald-500"/>دخول آمن ومحمي بالمصادقة متعددة العوامل</div>
    </div>
   </section>
  </div>
 </main>
}
