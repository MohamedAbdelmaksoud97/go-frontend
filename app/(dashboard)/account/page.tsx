"use client"

import { useEffect, useState } from "react"
import { Eye, EyeOff, KeyRound, Loader2, Save, ShieldCheck, UserCircle2 } from "lucide-react"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/toast-provider"
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordLengthError } from "@/lib/password-policy"

type Profile = {
  displayName: string
  phoneE164?: string | null
  email?: string | null
  preferredLocale: string
  preferredTimezone: string
  smsNotificationsEnabled: boolean
  whatsappNotificationsEnabled: boolean
  version: number
}

const emptyProfile: Profile = {
  displayName: "",
  preferredLocale: "ar",
  preferredTimezone: "Asia/Riyadh",
  smsNotificationsEnabled: true,
  whatsappNotificationsEnabled: false,
  version: 1,
}

export default function AccountPage() {
  const toast = useToast()
  const [profile, setProfile] = useState<Profile>(emptyProfile)
  const [loading, setLoading] = useState(hasRuntimeApi())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!hasRuntimeApi()) return
    const frame = requestAnimationFrame(() => apiRequest<Profile>("/self/account").then((response) => setProfile(response.data)).catch((error) => setMessage(humanError(error, "تعذر تحميل بيانات الحساب."))).finally(() => setLoading(false)))
    return () => cancelAnimationFrame(frame)
  }, [])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage("")
    try {
      if (hasRuntimeApi()) {
        const { phoneE164, email, version, ...body } = profile
        void phoneE164
        void email
        const response = await apiRequest<Profile>("/self/account", { method: "PATCH", body: JSON.stringify({ ...body, expectedVersion: version }) })
        setProfile(response.data)
      }
      setMessage("")
      toast.success("تم حفظ التغييرات بنجاح")
    } catch (error) {
      setMessage(humanError(error, "تعذر حفظ التغييرات. حاول مرة أخرى."))
    } finally {
      setSaving(false)
    }
  }

  const loginLabel = profile.email ? "البريد الإلكتروني" : "رقم الجوال"
  const loginIdentifier = profile.email ?? profile.phoneE164 ?? ""

  return <div className="mx-auto max-w-4xl fade-up">
    <Badge variant="outline"><UserCircle2 />حسابي</Badge>
    <h1 className="mt-4 text-3xl font-black">إعدادات الحساب</h1>
    <p className="mt-2 text-sm text-muted-foreground">عدّل اسم العرض واللغة والتوقيت وإعدادات الرسائل النصية.</p>
    {loading ? <div className="grid place-items-center py-24"><Loader2 className="animate-spin text-primary" /></div> : <>
      <form onSubmit={save}>
        <Card className="mt-7">
          <CardHeader>
            <CardTitle>الملف الشخصي</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <label className="text-xs font-bold">الاسم المعروض<Input className="mt-2" value={profile.displayName} onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))} /></label>
            <label className="text-xs font-bold">{loginLabel}<Input dir="ltr" className="mt-2 bg-secondary" disabled value={loginIdentifier} /><span className="mt-2 block text-[10px] font-normal text-muted-foreground">معرّف الدخول ثابت، ويمكنك تغيير كلمة المرور بنفسك من قسم الأمان أدناه.</span></label>
            <label className="text-xs font-bold">اللغة<select className="mt-2 h-10 w-full rounded-xl border bg-background px-3" value={profile.preferredLocale} onChange={(event) => setProfile((current) => ({ ...current, preferredLocale: event.target.value }))}><option value="ar">العربية</option><option value="en">English</option></select></label>
            <label className="text-xs font-bold">التوقيت المحلي<select className="mt-2 h-10 w-full rounded-xl border bg-background px-3" value={profile.preferredTimezone} onChange={(event) => setProfile((current) => ({ ...current, preferredTimezone: event.target.value }))}><option value="Asia/Riyadh">الرياض</option><option value="Africa/Cairo">القاهرة</option></select></label>
            <Toggle label="الرسائل النصية" checked={profile.smsNotificationsEnabled} onChange={(value) => setProfile((current) => ({ ...current, smsNotificationsEnabled: value }))} />
            <p className="rounded-xl border border-dashed p-4 text-xs leading-6 text-muted-foreground">تكامل واتساب غير مفعّل حاليًا، ولن يرسل النظام رسائل واتساب قبل ربط المزود لاحقًا.</p>
          </CardContent>
        </Card>
        <div className="mt-5 flex items-center">{message && <p role="alert" className="text-xs text-red-600">{message}</p>}<Button type="submit" size="lg" className="mr-auto" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}حفظ التغييرات</Button></div>
      </form>
      <PasswordChangeForm />
    </>}
  </div>
}

function PasswordChangeForm() {
  const toast = useToast()
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" })
  const [showPasswords, setShowPasswords] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const lengthError = passwordLengthError(values.newPassword)
    const validationError = lengthError
      ?? (values.newPassword !== values.confirmPassword ? "تأكيد كلمة المرور غير مطابق لكلمة المرور الجديدة." : undefined)
      ?? (values.currentPassword === values.newPassword ? "اختر كلمة مرور جديدة مختلفة عن كلمة المرور الحالية." : undefined)
    if (validationError) { setError(validationError); return }

    setSaving(true)
    setError("")
    try {
      await apiRequest<{ updated: true; otherSessionsRevoked: true }>("/self/account/password-changes", {
        method: "POST",
        body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
      })
      setValues({ currentPassword: "", newPassword: "", confirmPassword: "" })
      toast.success("تم تغيير كلمة المرور وتأمين الحساب بنجاح")
    } catch (reason) {
      setError(humanError(reason, "تعذر تغيير كلمة المرور. حاول مرة أخرى."))
    } finally {
      setSaving(false)
    }
  }

  return <form onSubmit={submit} className="mt-8">
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className="bg-primary/[.04]">
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" />أمان الحساب</CardTitle>
        <p className="text-xs leading-6 text-muted-foreground">غيّر كلمة المرور بعد تأكيد الحالية. حفاظًا على أمان حسابك، ستُنهى جميع الجلسات الأخرى وتظل جلستك الحالية فعالة.</p>
      </CardHeader>
      <CardContent className="grid gap-5 pt-6 sm:grid-cols-2">
        <PasswordField label="كلمة المرور الحالية" value={values.currentPassword} autoComplete="current-password" show={showPasswords} onChange={(value) => setValues(current => ({ ...current, currentPassword: value }))} />
        <div className="hidden sm:block" />
        <PasswordField label="كلمة المرور الجديدة" value={values.newPassword} autoComplete="new-password" show={showPasswords} onChange={(value) => setValues(current => ({ ...current, newPassword: value }))} hint={`${MIN_PASSWORD_LENGTH} محارف على الأقل؛ ويمكن استخدام الحروف أو الأرقام أو الرموز.`} />
        <PasswordField label="تأكيد كلمة المرور الجديدة" value={values.confirmPassword} autoComplete="new-password" show={showPasswords} onChange={(value) => setValues(current => ({ ...current, confirmPassword: value }))} />
        <label className="flex items-center gap-2 text-xs font-bold sm:col-span-2"><input type="checkbox" checked={showPasswords} onChange={event => setShowPasswords(event.target.checked)} className="size-4 accent-primary" />إظهار كلمات المرور أثناء الكتابة</label>
        {error && <p role="alert" aria-live="polite" className="rounded-xl bg-red-500/10 p-3 text-xs font-bold text-red-600 sm:col-span-2">{error}</p>}
        <div className="flex justify-end border-t pt-5 sm:col-span-2"><Button type="submit" size="lg" disabled={saving || !values.currentPassword || !values.newPassword || !values.confirmPassword}>{saving ? <Loader2 className="animate-spin" /> : <KeyRound />}تغيير كلمة المرور</Button></div>
      </CardContent>
    </Card>
  </form>
}

function PasswordField({ label, value, autoComplete, show, hint, onChange }: { label: string; value: string; autoComplete: "current-password" | "new-password"; show: boolean; hint?: string; onChange: (value: string) => void }) {
  return <label className="text-xs font-bold">{label}<span className="relative mt-2 block"><Input dir="ltr" type={show ? "text" : "password"} autoComplete={autoComplete} minLength={MIN_PASSWORD_LENGTH} maxLength={MAX_PASSWORD_LENGTH} required value={value} onChange={event => onChange(event.target.value)} className="h-11 pl-11" /><span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</span></span>{hint && <span className="mt-2 block text-[10px] font-normal leading-5 text-muted-foreground">{hint}</span>}</label>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between rounded-xl border p-4 text-xs font-bold">{label}<button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-primary" : "bg-secondary"}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow transition ${checked ? "right-6" : "right-1"}`} /></button></label>
}
