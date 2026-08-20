"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Dumbbell, Eye, EyeOff, Loader2, LockKeyhole, Mail, Moon, Phone, ShieldCheck, Sun, UsersRound } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ApiError, hasRuntimeApi, signInWithPassword } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { passwordLengthError } from "@/lib/password-policy"

type Audience = "staff" | "member" | "member-test"
const memberTestEmailEnabled = process.env.NEXT_PUBLIC_MEMBER_TEST_EMAIL_LOGIN === "true"

export default function LoginPage() {
  const router = useRouter()
  const [audience, setAudience] = useState<Audience>("staff")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDark(document.documentElement.classList.contains("dark")))
    return () => cancelAnimationFrame(frame)
  }, [])

  const staff = audience === "staff"
  const memberUsesEmail = audience === "member-test"

  function toggleTheme() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("go-theme", next ? "dark" : "light")
  }

  function normalizedPhone() {
    const cleaned = phone.replace(/[\s()-]/g, "")
    if (cleaned.startsWith("05")) return `+966${cleaned.slice(1)}`
    if (cleaned.startsWith("00")) return `+${cleaned.slice(2)}`
    return cleaned
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError("")
    setLoading(true)
    try {
      const passwordError = passwordLengthError(password)
      if (passwordError) throw new Error(passwordError)
      if (staff || memberUsesEmail) {
        if (!email.trim()) throw new Error(staff ? "أدخل الرقم الوظيفي أو البريد الإلكتروني." : "أدخل بريدًا إلكترونيًا صحيحًا.")
        if (memberUsesEmail && !/^\S+@\S+\.\S+$/u.test(email.trim())) throw new Error("أدخل بريدًا إلكترونيًا صحيحًا.")
        if (hasRuntimeApi()) {
          await signInWithPassword(staff ? "staff" : "member-test", staff
            ? { identifier: email.trim(), password }
            : { email: email.trim(), password })
        }
      } else {
        if (!/^\+[1-9]\d{7,14}$/u.test(normalizedPhone())) throw new Error("أدخل رقم الجوال بالصيغة الدولية، مثل +9665… أو +2010…")
        if (hasRuntimeApi()) await signInWithPassword("member", { phone: normalizedPhone(), password })
      }
      if (!hasRuntimeApi()) await new Promise(resolve => setTimeout(resolve, 450))
      router.push("/")
    } catch (reason) {
      if (!staff && reason instanceof ApiError && reason.problem.code === "invalid_credentials") {
        setError("رقم الجوال أو كلمة المرور غير صحيحة، أو لم يتم تفعيل حساب العضو بعد.")
      } else {
        setError(reason instanceof Error && reason.name !== "ApiError"
          ? reason.message
          : humanError(reason, "تعذر إكمال تسجيل الدخول. حاول مرة أخرى."))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main dir="rtl" className="relative min-h-screen overflow-hidden bg-[#0b0b0a] text-white">
      <div className="absolute inset-0 opacity-25 dot-grid" />
      <div className="absolute -right-40 -top-40 size-[520px] rounded-full bg-primary/20 blur-[120px]" />
      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
        <section className="hidden flex-col justify-between p-12 lg:flex xl:p-20">
          <BrandLogo className="text-white" />
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary"><Dumbbell className="size-4" />إدارة أذكى. أداء أقوى.</span>
            <h1 className="mt-7 text-5xl font-black leading-[1.3] xl:text-6xl">كل ما يحتاجه ناديك<br /><span className="text-primary">في مكان واحد.</span></h1>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center bg-background p-5 text-foreground lg:rounded-r-[48px]">
          <Button variant="outline" size="icon" onClick={toggleTheme} className="absolute left-5 top-5" aria-label="تغيير المظهر">{dark ? <Sun /> : <Moon />}</Button>
          <div className="w-full max-w-md fade-up">
            <BrandLogo className="mb-12 justify-center lg:hidden" />
            <div className="mb-8">
              <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-primary/15 text-amber-600"><LockKeyhole /></div>
              <h2 className="text-3xl font-black">تسجيل الدخول</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">اختر نوع الحساب ثم أدخل بيانات الدخول الخاصة به.</p>
            </div>

            <div className="mb-6 grid grid-cols-2 rounded-xl bg-muted p-1" role="tablist">
              <button type="button" role="tab" aria-selected={staff} onClick={() => { setAudience("staff"); setError("") }} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition ${staff ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}><UsersRound className="size-4" />موظف</button>
              <button type="button" role="tab" aria-selected={!staff} onClick={() => { setAudience("member"); setError("") }} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition ${!staff ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>{memberUsesEmail ? <Mail className="size-4" /> : <Phone className="size-4" />}عضو / ولي أمر</button>
            </div>

            {!staff && memberTestEmailEnabled && (
              <button type="button" onClick={() => { setAudience(current => current === "member-test" ? "member" : "member-test"); setError("") }} className="mb-4 w-full rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 text-xs font-bold leading-6 text-amber-700">
                {memberUsesEmail ? "العودة إلى الدخول الحقيقي برقم الجوال" : "للاختبار فقط: الدخول بحساب عضو تجريبي بالبريد"}
              </button>
            )}

            <form onSubmit={submit} className="space-y-5">
              {staff || memberUsesEmail ? (
                <label className="block text-xs font-bold">
                  {staff ? "الرقم الوظيفي أو البريد الإلكتروني" : "البريد الإلكتروني للحساب التجريبي"}
                  <div className="relative mt-2">
                    {staff ? <UsersRound className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /> : <Mail className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />}
                    <Input dir="ltr" type={staff ? "text" : "email"} autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} className="h-12 px-11 text-left text-base" placeholder={staff ? "EMP001" : "name@example.com"} autoFocus />
                  </div>
                </label>
              ) : (
                <label className="block text-xs font-bold">
                  رقم الجوال المسجل
                  <div className="relative mt-2">
                    <Phone className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input dir="ltr" inputMode="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} className="h-12 px-11 text-left text-base" placeholder="+9665… أو +2010…" autoFocus />
                  </div>
                  <span className="mt-2 block text-[10px] font-normal text-muted-foreground">اكتب مفتاح الدولة. الرقم السعودي المحلي الذي يبدأ بـ 05 يُحوّل تلقائيًا إلى +966.</span>
                </label>
              )}

              <label className="block text-xs font-bold">
                كلمة المرور
                <div className="relative mt-2">
                  <LockKeyhole className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input dir="ltr" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="h-12 px-11 text-left text-base" placeholder="••••••••••••" />
                  <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                </div>
              </label>

              {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-xs font-semibold leading-6 text-red-600">{error}</p>}
              <Button type="submit" size="lg" className="h-12 w-full text-sm font-bold brand-shadow" disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <><span>تسجيل الدخول</span><ArrowLeft /></>}</Button>
            </form>

            {!staff && <Link href="/join" className="mt-4 block text-center text-xs font-bold text-amber-600 transition hover:text-primary">عضو مسجل لأول مرة؟ فعّل حساب الدخول</Link>}
            {!hasRuntimeApi() && <button onClick={() => router.push("/")} className="mt-5 w-full text-center text-[11px] font-bold text-muted-foreground transition hover:text-foreground">الدخول إلى النسخة الاستعراضية</button>}
            <div className="mt-8 flex items-center justify-center gap-2 text-[10px] text-muted-foreground"><ShieldCheck className="size-3.5 text-emerald-500" />اتصال آمن وجلسة عمل ممتدة لمدة أسبوع.</div>
          </div>
        </section>
      </div>
    </main>
  )
}
