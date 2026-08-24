"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDownLeft, ArrowUpRight, CalendarRange, CircleDot, History, Loader2, RefreshCw, Search, ShieldCheck, Store, X } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DateTimeInput } from "@/components/date-time-input"
import { apiRequest } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

type Movement = {
  id: string
  movementType: string
  amountMinor: string
  referenceType: string
  referenceId: string
  referenceLabel?: string | null
  details?: string | null
  actorName: string
  actorEmployeeNumber?: string | null
  occurredAt: string
}

type Shift = {
  id: string
  branchId: string
  branchName: string
  cashPointCode: string
  cashPointName: string
  status: "OPEN" | "CLOSED"
  openingBalanceMinor: string
  cashInMinor: string
  cashOutMinor: string
  netCashMovementMinor: string
  calculatedExpectedMinor: string
  expectedClosingMinor?: string | null
  actualClosingMinor?: string | null
  differenceMinor?: string | null
  movementCount: number
  openedByName: string
  openedByEmployeeNumber?: string | null
  openedAt: string
  closedByName?: string | null
  closedByEmployeeNumber?: string | null
  closedAt?: string | null
  closeReason?: string | null
  movements?: Movement[]
}

const movementLabels: Record<string, string> = {
  PAYMENT_IN: "تحصيل نقدي",
  REFUND_OUT: "استرداد نقدي",
  EXPENSE_OUT: "مصروف نقدي",
  ADJUSTMENT_IN: "إضافة أو إيراد نقدي",
  ADJUSTMENT_OUT: "خصم أو إلغاء نقدي",
}

export function CashShiftAudit() {
  const context = useAppContext()
  const [branchId, setBranchId] = useState(context.branchId)
  const [status, setStatus] = useState("")
  const [query, setQuery] = useState("")
  const [from, setFrom] = useState(() => dateInput(-30))
  const [to, setTo] = useState(() => dateInput(0))
  const [rows, setRows] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<Shift>()
  const [detailLoading, setDetailLoading] = useState(false)
  const effectiveBranchId = branchId || context.branchId

  async function load() {
    if (!context.organizationId || !effectiveBranchId) return
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ branchId: effectiveBranchId, limit: "250" })
      if (status) params.set("status", status)
      if (query.trim()) params.set("q", query.trim())
      if (from) params.set("from", new Date(`${from}T00:00:00+03:00`).toISOString())
      if (to) params.set("to", new Date(`${to}T23:59:59+03:00`).toISOString())
      const response = await apiRequest<Shift[]>(`/organizations/${context.organizationId}/cashier-shifts?${params}`)
      setRows(Array.isArray(response.data) ? response.data : [])
    } catch (reason) {
      setError(humanError(reason, "تعذر تحميل سجل ورديات الصندوق."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { const frame = requestAnimationFrame(() => void load()); return () => cancelAnimationFrame(frame) }, [effectiveBranchId, context.organizationId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function openLedger(shift: Shift) {
    setSelected({ ...shift, movements: undefined })
    setDetailLoading(true)
    try {
      const response = await apiRequest<Shift>(`/organizations/${context.organizationId}/cashier-shifts/${shift.id}/ledger?branchId=${shift.branchId}`)
      setSelected(response.data)
    } catch (reason) {
      setError(humanError(reason, "تعذر تحميل تفاصيل الوردية."))
      setSelected(undefined)
    } finally {
      setDetailLoading(false)
    }
  }

  const totals = useMemo(() => rows.reduce((value, row) => ({
    open: value.open + (row.status === "OPEN" ? 1 : 0),
    incoming: value.incoming + minor(row.cashInMinor),
    outgoing: value.outgoing + minor(row.cashOutMinor),
    difference: value.difference + minor(row.differenceMinor),
  }), { open: 0, incoming: 0, outgoing: 0, difference: 0 }), [rows])

  return <div className="fade-up space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
      <div>
        <Badge variant="outline"><ShieldCheck /> رقابة مالية</Badge>
        <h1 className="mt-3 text-3xl font-black">سجل ورديات الصندوق</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">متابعة كاملة لفتح وإغلاق كل وردية، والمسؤول عنها، وجميع حركات التحصيل والاسترداد والمصروفات والتسويات النقدية.</p>
      </div>
      <Button className="lg:mr-auto" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> تحديث السجل</Button>
    </div>

    <Card className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
      <label className="space-y-2 text-sm font-bold"><span>الفرع</span><select className="h-11 w-full rounded-xl border bg-background px-3" value={effectiveBranchId} onChange={event => setBranchId(event.target.value)}>{context.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.nameAr || branch.name || "فرع النادي"}</option>)}</select></label>
      <label className="space-y-2 text-sm font-bold"><span>حالة الوردية</span><select className="h-11 w-full rounded-xl border bg-background px-3" value={status} onChange={event => setStatus(event.target.value)}><option value="">كل الحالات</option><option value="OPEN">مفتوحة</option><option value="CLOSED">مغلقة</option></select></label>
      <label className="space-y-2 text-sm font-bold"><span>من تاريخ</span><DateTimeInput type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label className="space-y-2 text-sm font-bold"><span>إلى تاريخ</span><DateTimeInput type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
      <div className="space-y-2"><label className="text-sm font-bold" htmlFor="shift-search">بحث</label><div className="flex gap-2"><Input id="shift-search" placeholder="الموظف، الرقم الوظيفي أو نقطة التحصيل" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void load() }} /><Button aria-label="بحث" onClick={() => void load()}><Search /></Button></div></div>
    </Card>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Summary icon={History} label="الورديات المعروضة" value={String(rows.length)} hint={`${totals.open} وردية مفتوحة`} />
      <Summary icon={ArrowDownLeft} label="إجمالي الداخل النقدي" value={money(totals.incoming)} tone="positive" />
      <Summary icon={ArrowUpRight} label="إجمالي الخارج النقدي" value={money(totals.outgoing)} tone="negative" />
      <Summary icon={CircleDot} label="فروق الصندوق" value={money(totals.difference)} tone={totals.difference === 0 ? "neutral" : "negative"} />
    </div>

    {error && <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600">{error}</p>}
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-right">
          <thead className="bg-secondary/50 text-xs text-muted-foreground"><tr><th className="px-5 py-4">الوردية ونقطة التحصيل</th><th className="px-5 py-4">فتح الوردية</th><th className="px-5 py-4">المدة والحالة</th><th className="px-5 py-4">حركة النقد</th><th className="px-5 py-4">الإغلاق والمطابقة</th><th className="px-5 py-4">التفاصيل</th></tr></thead>
          <tbody className="divide-y">{rows.map(row => <tr key={row.id} className="align-top hover:bg-secondary/20">
            <td className="px-5 py-5"><p className="font-bold">{row.cashPointName}</p><p className="mt-1 text-xs text-muted-foreground">{row.cashPointCode} · {shortId(row.id)}</p></td>
            <td className="px-5 py-5"><p className="font-bold">{row.openedByName}</p><p className="mt-1 text-xs text-muted-foreground">{employeeNumber(row.openedByEmployeeNumber)} · {dateTime(row.openedAt)}</p><p className="mt-2 text-xs">رصيد البداية: {money(row.openingBalanceMinor)}</p></td>
            <td className="px-5 py-5"><Badge variant={row.status === "OPEN" ? "default" : "secondary"}>{row.status === "OPEN" ? "مفتوحة" : "مغلقة"}</Badge><p className="mt-2 text-xs text-muted-foreground">{duration(row.openedAt, row.closedAt)}</p></td>
            <td className="px-5 py-5 text-sm"><p className="text-emerald-600">داخل: {money(row.cashInMinor)}</p><p className="mt-1 text-red-600">خارج: {money(row.cashOutMinor)}</p><p className="mt-2 text-xs text-muted-foreground">{row.movementCount} حركة مسجلة</p></td>
            <td className="px-5 py-5 text-sm">{row.status === "CLOSED" ? <><p>فعلي: {money(row.actualClosingMinor)}</p><p className="mt-1">متوقع: {money(row.expectedClosingMinor)}</p><p className={`mt-2 font-bold ${minor(row.differenceMinor) === 0 ? "text-emerald-600" : "text-red-600"}`}>الفرق: {money(row.differenceMinor)}</p></> : <><p>المتوقع حاليًا: {money(row.calculatedExpectedMinor)}</p><p className="mt-2 text-xs text-muted-foreground">تتحدث القيمة مع كل حركة</p></>}</td>
            <td className="px-5 py-5"><Button size="sm" variant="outline" onClick={() => void openLedger(row)}><History /> عرض السجل</Button></td>
          </tr>)}</tbody>
        </table>
        {loading && <div className="grid min-h-52 place-items-center"><Loader2 className="animate-spin text-primary" /></div>}
        {!loading && !rows.length && !error && <div className="grid min-h-52 place-items-center px-6 text-center"><div><CalendarRange className="mx-auto mb-3 text-muted-foreground" /><p className="font-bold">لا توجد ورديات مطابقة</p><p className="mt-1 text-sm text-muted-foreground">غيّر الفترة أو حالة الوردية ثم أعد البحث.</p></div></div>}
      </div>
    </Card>
    {selected && <LedgerDialog shift={selected} loading={detailLoading} onClose={() => setSelected(undefined)} />}
  </div>
}

function Summary({ icon: Icon, label, value, hint, tone = "neutral" }: { icon: typeof History; label: string; value: string; hint?: string; tone?: "neutral" | "positive" | "negative" }) {
  return <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-3 text-2xl font-black ${tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-red-600" : ""}`}>{value}</p>{hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}</div><span className="rounded-2xl bg-primary/10 p-3 text-primary"><Icon /></span></div></Card>
}

function LedgerDialog({ shift, loading, onClose }: { shift: Shift; loading: boolean; onClose: () => void }) {
  const movements = shift.movements ?? []
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="تفاصيل سجل الوردية">
    <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-3xl border bg-background shadow-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-background/95 p-6 backdrop-blur">
        <div><Badge variant="outline"><Store /> {shift.cashPointName}</Badge><h2 className="mt-3 text-2xl font-black">التسلسل المالي للوردية</h2><p className="mt-1 text-sm text-muted-foreground">{shift.branchName} · {shortId(shift.id)}</p></div>
        <Button size="icon" variant="ghost" aria-label="إغلاق" onClick={onClose}><X /></Button>
      </div>
      {loading ? <div className="grid min-h-80 place-items-center"><Loader2 className="animate-spin text-primary" /></div> : <div className="space-y-6 p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="رصيد بداية الوردية" value={money(shift.openingBalanceMinor)} /><Metric label="إجمالي الداخل" value={money(shift.cashInMinor)} positive /><Metric label="إجمالي الخارج" value={money(shift.cashOutMinor)} /><Metric label={shift.status === "CLOSED" ? "الرصيد الفعلي عند الإغلاق" : "الرصيد المتوقع حاليًا"} value={money(shift.actualClosingMinor ?? shift.calculatedExpectedMinor)} /></div>
        <div className="rounded-2xl border p-5"><TimelineEvent title="فتح الوردية" actor={shift.openedByName} employee={shift.openedByEmployeeNumber} at={shift.openedAt} detail={`تم فتح الوردية برصيد بداية ${money(shift.openingBalanceMinor)}.`} />
          {movements.map(movement => <MovementEvent key={movement.id} movement={movement} />)}
          {shift.status === "CLOSED" && shift.closedAt && <TimelineEvent title="إغلاق الوردية ومطابقة الصندوق" actor={shift.closedByName || "موظف مخول"} employee={shift.closedByEmployeeNumber} at={shift.closedAt} detail={`الرصيد المتوقع ${money(shift.expectedClosingMinor)}، الرصيد الفعلي ${money(shift.actualClosingMinor)}، الفرق ${money(shift.differenceMinor)}.${shift.closeReason ? ` سبب الإغلاق: ${shift.closeReason}` : ""}`} last />}
        </div>
      </div>}
    </div>
  </div>
}

function MovementEvent({ movement }: { movement: Movement }) {
  const incoming = ["PAYMENT_IN", "ADJUSTMENT_IN"].includes(movement.movementType)
  return <div className="relative border-r-2 border-border pb-7 pr-8"><span className={`absolute -right-[9px] top-1 h-4 w-4 rounded-full border-4 border-background ${incoming ? "bg-emerald-500" : "bg-red-500"}`} /><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-bold">{movementLabels[movement.movementType] || "حركة نقدية"}</p><p className="mt-1 text-sm text-muted-foreground">{movement.referenceLabel || "مرجع مالي مسجل"}{movement.details ? ` · ${movement.details}` : ""}</p><p className="mt-2 text-xs text-muted-foreground">نفذها {movement.actorName} · {employeeNumber(movement.actorEmployeeNumber)} · {dateTime(movement.occurredAt)}</p></div><p className={`text-lg font-black ${incoming ? "text-emerald-600" : "text-red-600"}`}>{incoming ? "+" : "−"}{money(movement.amountMinor)}</p></div></div>
}

function TimelineEvent({ title, actor, employee, at, detail, last = false }: { title: string; actor: string; employee?: string | null; at: string; detail: string; last?: boolean }) {
  return <div className={`relative pr-8 ${last ? "" : "border-r-2 border-border pb-7"}`}><span className="absolute -right-[9px] top-1 h-4 w-4 rounded-full border-4 border-background bg-primary" /><p className="font-bold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p><p className="mt-2 text-xs text-muted-foreground">{actor} · {employeeNumber(employee)} · {dateTime(at)}</p></div>
}

function Metric({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) { return <div className="rounded-2xl bg-secondary/50 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-2 font-black ${positive ? "text-emerald-600" : ""}`}>{value}</p></div> }
function minor(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0 }
function money(value: unknown) { return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 2 }).format(minor(value) / 100) }
function dateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date) }
function shortId(value: string) { return `وردية ${value.replaceAll("-", "").slice(0, 8).toUpperCase()}` }
function employeeNumber(value?: string | null) { return value ? `الرقم الوظيفي ${value}` : "حساب إداري" }
function duration(openedAt: string, closedAt?: string | null) { const start = new Date(openedAt).getTime(); const end = closedAt ? new Date(closedAt).getTime() : Date.now(); if (!Number.isFinite(start) || !Number.isFinite(end)) return "—"; const minutes = Math.max(0, Math.floor((end - start) / 60000)); return minutes < 60 ? `${minutes} دقيقة` : `${Math.floor(minutes / 60)} س ${minutes % 60} د` }
function dateInput(offset: number) { const value = new Date(); value.setDate(value.getDate() + offset); return value.toISOString().slice(0, 10) }
