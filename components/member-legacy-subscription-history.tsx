"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type Row = Record<string, unknown>
const PAGE_SIZE = 12
function value(item: unknown) { return item === undefined || item === null || item === "" ? "—" : String(item) }
function date(item: unknown) {
  if (!item) return "—"
  const parsed = new Date(`${String(item).slice(0, 10)}T12:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? value(item) : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", calendar: "gregory" }).format(parsed)
}
function amount(item: unknown) {
  if (item === undefined || item === null || item === "") return "—"
  const number = Number(item) / 100
  return Number.isFinite(number) ? `${new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number)} ر.س` : "—"
}

export function MemberLegacySubscriptionHistory({ records, error }: { records: Row[]; error?: string }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages - 1)
  if (error) return <div role="alert" className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 text-sm">تعذر تحميل سجل اشتراكات النظام السابق. {error}</div>
  if (!records.length) return null
  return <section className="space-y-4" aria-label="سجل اشتراكات النظام السابق">
    <div className="rounded-2xl border bg-secondary/40 p-5">
      <div className="flex flex-wrap items-center gap-3"><h3 className="font-black">اشتراكات وباقات النظام السابق</h3><Badge variant="secondary">{records.length} سجل تاريخي</Badge></div>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">للاستدلال فقط حسب بيانات {date(records[0].sourceDate)}. هذه السجلات لا تمنح دخولًا أو حقوق تجميد أو تجديد، والمبالغ المعروضة لا تنشئ فاتورة أو مديونية.</p>
    </div>
    <div className="grid gap-3 lg:grid-cols-2">{records.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(record => <article key={String(record.id)} className="rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="font-black">{value(record.serviceName)}</p><p className="mt-1 text-xs text-muted-foreground">{value(record.subscriptionType)} · <span dir="ltr">{value(record.legacyServiceCode)}</span></p></div><Badge variant="secondary">تاريخي فقط</Badge></div>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-xs">
        <Field label="تاريخ الاشتراك" text={date(record.subscribedOn)}/>
        <Field label="الفترة المسجلة" text={`${date(record.startsOn)} — ${date(record.endsOn)}`}/>
        <Field label="الزيارات كما وردت في المصدر" text={value(record.visitsDisplay)}/>
        <Field label="القيمة المسجلة" text={amount(record.listedAmountMinor)}/>
        <Field label="المدفوع المسجل" text={amount(record.paidAmountMinor)}/>
      </dl>
    </article>)}</div>
    {pages > 1 && <nav className="flex items-center justify-between gap-3" aria-label="صفحات الاشتراكات التاريخية"><Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>السابق</Button><span className="text-xs text-muted-foreground">{currentPage + 1} / {pages}</span><Button variant="outline" size="sm" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>التالي</Button></nav>}
  </section>
}

function Field({ label, text }: { label: string; text: string }) { return <div><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-bold">{text}</dd></div> }
