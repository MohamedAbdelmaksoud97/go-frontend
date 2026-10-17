"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, Database, Download, LoaderCircle, ShieldCheck } from "lucide-react"
import { databaseBackupAccess, downloadDatabaseBackup } from "@/lib/database-backup"
import { humanError } from "@/lib/human-errors"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export function DatabaseBackupLink() {
  const [allowed, setAllowed] = useState(false)
  useEffect(() => { let active = true; void databaseBackupAccess().then(value => { if (active) setAllowed(value) }).catch(() => undefined); return () => { active = false } }, [])
  return allowed ? <Link href="/system-settings/backups" className="flex items-center gap-2 rounded-xl border p-3 text-sm font-bold hover:bg-secondary"><Database className="size-4" />نسخة قاعدة البيانات</Link> : null
}

export function DatabaseBackupPage() {
  const [allowed, setAllowed] = useState<boolean>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  useEffect(() => { let active = true; void databaseBackupAccess().then(value => { if (active) setAllowed(value) }).catch(reason => { if (active) { setAllowed(false); setError(humanError(reason, "تعذر التحقق من صلاحية تنزيل النسخة.")) } }); return () => { active = false } }, [])
  async function download() {
    setBusy(true); setError(""); setSuccess(false)
    try { await downloadDatabaseBackup(); setSuccess(true) }
    catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(humanError(reason, "تعذر تنزيل نسخة قاعدة البيانات. حاول مجددًا.")) }
    finally { setBusy(false) }
  }
  return <div dir="rtl" className="mx-auto max-w-4xl space-y-6">
    <Link href="/system-settings/branches" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowRight className="size-4" />إعداد النظام</Link>
    <div className="flex items-center gap-3"><Database className="size-8 text-primary" /><div><h1 className="text-2xl font-black">نسخة قاعدة البيانات</h1><p className="mt-1 text-sm text-muted-foreground">مرجع شامل لبيانات النظام، متاح لمدير النظام فقط.</p></div></div>
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error}</p>}
    {allowed === undefined ? <p role="status" className="text-sm">جارٍ التحقق من الصلاحية…</p> : !allowed ? <Card><CardContent className="p-6 text-sm leading-7">هذه الميزة متاحة لمدير النظام ذي الصلاحية الكاملة على جميع المؤسسات فقط. لا تمنح صلاحيات الموظفين أو الفروع حق تنزيل قاعدة البيانات.</CardContent></Card> : <>
      <Card><CardContent className="space-y-5 p-6">
        <div className="flex items-center gap-2 font-bold"><ShieldCheck className="size-5 text-primary" />كل الجداول في تنزيل واحد</div>
        <p className="text-sm leading-7 text-muted-foreground">ملف ZIP يحتوي على CSV مستقل لكل جدول في قاعدة البيانات، بما فيها جداول الحسابات والملفات والجداول الفارغة. تُضاف الجداول الجديدة تلقائيًا، دون حدود صفحات التقارير.</p>
        <ul className="list-inside list-disc space-y-2 text-sm leading-7 text-muted-foreground"><li>فهرس بأسماء الجداول وأعداد السجلات وبصمات الملفات للتحقق من اكتمال البيانات.</li><li>مرجع لبنية الجداول والعلاقات والفهارس والسياسات والدوال.</li><li>تُقرأ بيانات الجداول من لقطة واحدة؛ لا يتم تسليم أرشيف ناقص إذا فشلت قراءة أي جدول.</li></ul>
        <p className="rounded-xl bg-secondary p-4 text-sm leading-7">هذه نسخة لبيانات قاعدة البيانات ومرجع لاستعادتها بواسطة المختص. محتويات الصور والمرفقات في Storage وإعدادات الاستضافة خارج قاعدة البيانات؛ يلزم الاحتفاظ بنسخة مستقلة منها وبنسخة PostgreSQL أصلية للاستعادة الكاملة.</p>
        <p className="text-xs leading-6 text-muted-foreground">يحتوي الملف على بيانات شخصية ومالية وبيانات حسابات حساسة؛ احفظه في مكان خاص ومشفر. قد يستغرق التجهيز عدة دقائق. الحد الحالي 5 جيجابايت من البيانات و4 دقائق للتجهيز.</p>
        <Button size="lg" disabled={busy} onClick={() => void download()}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}{busy ? "جارٍ تجهيز وتنزيل النسخة…" : "تنزيل جميع الجداول بصيغة CSV"}</Button>
        {busy && <p role="status" className="text-sm text-muted-foreground">اترك الصفحة مفتوحة حتى يكتمل التنزيل.</p>}
        {success && <p role="status" className="text-sm text-emerald-700">اكتمل تسليم الملف للمتصفح. احتفظ بالأرشيف كاملًا مع ملف الفهرس.</p>}
      </CardContent></Card>
    </>}
  </div>
}
