"use client"

import { useEffect, useState } from "react"
import { Loader2, Save, UserCircle2 } from "lucide-react"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

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

const demo: Profile = {
  displayName: "محمد العتيبي",
  email: "staff@example.com",
  preferredLocale: "ar",
  preferredTimezone: "Asia/Riyadh",
  smsNotificationsEnabled: true,
  whatsappNotificationsEnabled: false,
  version: 1,
}

export default function AccountPage() {
  const [profile, setProfile] = useState<Profile>(demo)
  const [loading, setLoading] = useState(hasRuntimeApi())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!hasRuntimeApi()) return
    const frame = requestAnimationFrame(() => apiRequest<Profile>("/self/account").then((response) => setProfile(response.data)).finally(() => setLoading(false)))
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
      setMessage("تم حفظ التغييرات بنجاح")
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
    <p className="mt-2 text-sm text-muted-foreground">عدّل اسم العرض واللغة والتوقيت وطريقة استلام الإشعارات.</p>
    {loading ? <div className="grid place-items-center py-24"><Loader2 className="animate-spin text-primary" /></div> : <form onSubmit={save}>
      <Card className="mt-7">
        <CardHeader>
          <CardTitle>الملف الشخصي</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <label className="text-xs font-bold">الاسم المعروض<Input className="mt-2" value={profile.displayName} onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))} /></label>
          <label className="text-xs font-bold">{loginLabel}<Input dir="ltr" className="mt-2 bg-secondary" disabled value={loginIdentifier} /><span className="mt-2 block text-[10px] font-normal text-muted-foreground">لتغيير بيانات الدخول تواصل مع مسؤول النظام.</span></label>
          <label className="text-xs font-bold">اللغة<select className="mt-2 h-10 w-full rounded-xl border bg-background px-3" value={profile.preferredLocale} onChange={(event) => setProfile((current) => ({ ...current, preferredLocale: event.target.value }))}><option value="ar">العربية</option><option value="en">English</option></select></label>
          <label className="text-xs font-bold">التوقيت المحلي<select className="mt-2 h-10 w-full rounded-xl border bg-background px-3" value={profile.preferredTimezone} onChange={(event) => setProfile((current) => ({ ...current, preferredTimezone: event.target.value }))}><option value="Asia/Riyadh">الرياض</option><option value="Africa/Cairo">القاهرة</option></select></label>
          <Toggle label="الرسائل النصية" checked={profile.smsNotificationsEnabled} onChange={(value) => setProfile((current) => ({ ...current, smsNotificationsEnabled: value }))} />
          <Toggle label="رسائل واتساب" checked={profile.whatsappNotificationsEnabled} onChange={(value) => setProfile((current) => ({ ...current, whatsappNotificationsEnabled: value }))} />
        </CardContent>
      </Card>
      <div className="mt-5 flex items-center"><p className="text-xs text-emerald-600">{message}</p><Button type="submit" size="lg" className="mr-auto" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}حفظ التغييرات</Button></div>
    </form>}
  </div>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between rounded-xl border p-4 text-xs font-bold">{label}<button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-primary" : "bg-secondary"}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow transition ${checked ? "right-6" : "right-1"}`} /></button></label>
}
