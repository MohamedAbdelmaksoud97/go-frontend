"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Activity, CalendarDays, CalendarRange, ClipboardList, CreditCard, Download, Dumbbell, RefreshCw, ShoppingBag, Users, UtensilsCrossed, WalletCards } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DateTimeInput } from "@/components/date-time-input"
import { apiRequest } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

type DailyReport = {
  businessDate: string
  branchId: string
  currency: string
  invoicedGrossMinor: string
  collectedMinor: string
  refundedMinor: string
  netCollectedMinor: string
  paidExpensesMinor: string
  newMembers: number
  newSubscriptions: number
  renewedSubscriptions: number
  attendanceAccepted: number
  attendanceRejected: number
  reservationsTotal: number
  reservationsConfirmed: number
  reservationsCompleted: number
  reservationsCancelled: number
  reservationsNoShow: number
  restaurantOrders: number
  restaurantOrdersCompleted: number
  restaurantOrdersCancelled: number
  restaurantGrossMinor: string
  cashShiftsClosed: number
  cashDifferenceMinor: string
  asOf: string
}

type ReportSection = "overview" | "finance" | "subscriptions" | "attendance" | "bookings" | "restaurant" | "cash"
type Metric = { label: string; value: string; note?: string }

const sections: Array<{ id: ReportSection; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "الملخص اليومي", icon: ClipboardList },
  { id: "finance", label: "الإيرادات", icon: WalletCards },
  { id: "subscriptions", label: "الأعضاء والاشتراكات", icon: Users },
  { id: "attendance", label: "الحضور", icon: Activity },
  { id: "bookings", label: "الحجوزات", icon: CalendarRange },
  { id: "restaurant", label: "المطبخ", icon: UtensilsCrossed },
  { id: "cash", label: "ورديات الصندوق", icon: CreditCard },
]

export function ReportsWorkspace() {
  const context = useAppContext()
  const [date, setDate] = useState(today())
  const [branchSelection, setBranchSelection] = useState(() => ({ contextBranchId: context.branchId, value: context.branchId }))
  const branchId = branchSelection.contextBranchId === context.branchId ? branchSelection.value : context.branchId
  const [section, setSection] = useState<ReportSection>("overview")
  const [rows, setRows] = useState<DailyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!context.organizationId || !date) return
    let cancelled = false
    const frame = requestAnimationFrame(() => {
      setLoading(true); setError("")
      const query = new URLSearchParams({ from: date, to: date })
      if (branchId) query.set("branchId", branchId)
      void apiRequest<DailyReport[]>(`/organizations/${context.organizationId}/reports/branch-daily?${query}`).then(response => {
        if (!cancelled) setRows(Array.isArray(response.data) ? response.data : [])
      }).catch(reason => { if (!cancelled) { setRows([]); setError(humanError(reason, "تعذر تحميل تقرير هذا اليوم.")) } }).finally(() => { if (!cancelled) setLoading(false) })
    })
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [branchId, context.organizationId, date])

  const totals = useMemo(() => aggregate(rows), [rows])
  const metrics = useMemo(() => reportMetrics(section, totals), [section, totals])
  const branchNames = useMemo(() => new Map(context.branches.map(branch => [branch.id, branch.nameAr ?? branch.name ?? "فرع"])), [context.branches])

  return <main className="reports-print-root space-y-5" dir="rtl">
    <header className="reports-print-hidden flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-xs font-bold text-primary">مركز التقارير</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">التقرير التشغيلي اليومي</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">راجع أداء النادي حسب اليوم والفرع، وانتقل بين الجوانب المالية والتشغيلية من تقرير واحد واضح.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => window.print()}><Download />طباعة التقرير</Button><Button variant="outline" onClick={() => setDate(today())}><RefreshCw />اليوم</Button></div>
    </header>

    <Card className="reports-print-hidden"><CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <label className="text-xs font-bold"><span>يوم التقرير</span><DateTimeInput aria-label="يوم التقرير" type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-2 h-11" /></label>
      <label className="text-xs font-bold">نطاق التقرير<select aria-label="نطاق التقرير" value={branchId} onChange={event => setBranchSelection({ contextBranchId: context.branchId, value: event.target.value })} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary">{context.branches.length > 1 && <option value="">كل الفروع المسموح بها</option>}{context.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.nameAr ?? branch.name ?? "فرع"}</option>)}</select></label>
      <div className="rounded-xl bg-primary/10 px-4 py-3 text-xs font-bold text-amber-700 dark:text-primary"><CalendarDays className="ml-2 inline size-4" />{formatDate(date)}</div>
    </CardContent></Card>

    <nav className="reports-print-hidden flex gap-2 overflow-x-auto pb-1" aria-label="أنواع التقارير">{sections.map(item => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition ${section === item.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50"}`}><Icon className="size-4" />{item.label}</button> })}</nav>

    <section className="reports-print-header hidden print:block"><div className="reports-print-brand"><div className="print-logo-plate"><Image src="/go-fitness-logo.png" alt="شعار GO Fitness" width={104} height={58}/></div><div><strong>GO Fitness</strong><span>التقارير التشغيلية</span></div></div><div className="reports-print-heading"><h1 className="text-2xl font-black">{sections.find(item => item.id === section)?.label}</h1><p className="mt-1 text-sm">{formatDate(date)} · {branchId ? branchNames.get(branchId) ?? "الفرع المحدد" : "كل الفروع"}</p></div></section>

    {error ? <Card><CardContent className="p-10 text-center"><p className="font-bold text-red-600">تعذر عرض التقرير</p><p className="mt-2 text-xs text-muted-foreground">{error}</p></CardContent></Card> : loading ? <div className="grid min-h-64 place-items-center"><span className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div> : <>
      <section className="reports-metrics-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric, index) => <Card key={metric.label} className="reports-metric-card"><CardContent className="reports-metric-content p-5"><span className={`reports-metric-icon mb-4 grid size-10 place-items-center rounded-xl ${index % 3 === 0 ? "bg-primary/12 text-amber-600" : index % 3 === 1 ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600"}`}>{metricIcon(section, index)}</span><p className="text-xs font-bold text-muted-foreground">{metric.label}</p><p className="mt-2 text-2xl font-black tabular-nums">{metric.value}</p>{metric.note && <p className="mt-1 text-[10px] text-muted-foreground">{metric.note}</p>}</CardContent></Card>)}</section>
      <Card className="reports-details-card overflow-hidden"><div className="reports-details-heading border-b px-5 py-4"><h2 className="font-black">تفاصيل التقرير حسب الفرع</h2><p className="mt-1 text-xs text-muted-foreground">{rows.length ? `${rows.length} فرع في النطاق المحدد` : "لا توجد حركة مسجلة في هذا اليوم"}</p></div><div className="reports-table-wrap overflow-x-auto"><table className="reports-table w-full min-w-[920px] text-right"><thead className="bg-secondary/45"><tr>{tableColumns(section).map(column => <th key={column.key} className="px-4 py-3 text-[10px] font-bold text-muted-foreground">{column.label}</th>)}</tr></thead><tbody className="divide-y">{rows.map(row => <tr key={`${row.branchId}-${row.businessDate}`} className="hover:bg-secondary/25">{tableColumns(section).map(column => <td key={column.key} className="whitespace-nowrap px-4 py-4 text-xs font-semibold">{column.key === "branch" ? branchNames.get(row.branchId) ?? "فرع" : column.render(row)}</td>)}</tr>)}{!rows.length && <tr><td colSpan={tableColumns(section).length} className="px-5 py-16 text-center text-sm text-muted-foreground">لا توجد بيانات مسجلة لهذا اليوم والنطاق.</td></tr>}</tbody></table></div></Card>
    </>}
  </main>
}

type Totals = ReturnType<typeof aggregate>
function aggregate(rows: DailyReport[]) {
  const numberKeys = ["newMembers", "newSubscriptions", "renewedSubscriptions", "attendanceAccepted", "attendanceRejected", "reservationsTotal", "reservationsConfirmed", "reservationsCompleted", "reservationsCancelled", "reservationsNoShow", "restaurantOrders", "restaurantOrdersCompleted", "restaurantOrdersCancelled", "cashShiftsClosed"] as const
  const moneyKeys = ["invoicedGrossMinor", "collectedMinor", "refundedMinor", "netCollectedMinor", "paidExpensesMinor", "restaurantGrossMinor", "cashDifferenceMinor"] as const
  const result: Record<string, number> = { branches: rows.length }
  numberKeys.forEach(key => { result[key] = rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0) })
  moneyKeys.forEach(key => { result[key] = rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0) })
  return result as Record<(typeof numberKeys)[number] | (typeof moneyKeys)[number] | "branches", number>
}

function reportMetrics(section: ReportSection, totals: Totals): Metric[] {
  const money = (value: number) => formatMoney(value)
  if (section === "finance") return [{ label: "إجمالي الفواتير", value: money(totals.invoicedGrossMinor) }, { label: "المبالغ المحصلة", value: money(totals.collectedMinor) }, { label: "صافي التحصيل", value: money(totals.netCollectedMinor) }, { label: "المبالغ المستردة", value: money(totals.refundedMinor) }, { label: "المصروفات المدفوعة", value: money(totals.paidExpensesMinor) }]
  if (section === "subscriptions") return [{ label: "أعضاء جدد", value: String(totals.newMembers) }, { label: "اشتراكات جديدة", value: String(totals.newSubscriptions) }, { label: "تجديدات", value: String(totals.renewedSubscriptions) }]
  if (section === "attendance") return [{ label: "زيارات مقبولة", value: String(totals.attendanceAccepted) }, { label: "محاولات مرفوضة", value: String(totals.attendanceRejected) }, { label: "إجمالي المحاولات", value: String(totals.attendanceAccepted + totals.attendanceRejected) }]
  if (section === "bookings") return [{ label: "إجمالي الحجوزات", value: String(totals.reservationsTotal) }, { label: "حجوزات مؤكدة", value: String(totals.reservationsConfirmed) }, { label: "حجوزات مكتملة", value: String(totals.reservationsCompleted) }, { label: "حجوزات ملغاة", value: String(totals.reservationsCancelled) }, { label: "عدم حضور", value: String(totals.reservationsNoShow) }]
  if (section === "restaurant") return [{ label: "طلبات المطبخ", value: String(totals.restaurantOrders) }, { label: "طلبات مكتملة", value: String(totals.restaurantOrdersCompleted) }, { label: "طلبات ملغاة", value: String(totals.restaurantOrdersCancelled) }, { label: "مبيعات المطعم", value: money(totals.restaurantGrossMinor) }]
  if (section === "cash") return [{ label: "ورديات مغلقة", value: String(totals.cashShiftsClosed) }, { label: "فرق الصندوق", value: money(totals.cashDifferenceMinor) }, { label: "صافي التحصيل", value: money(totals.netCollectedMinor) }]
  return [{ label: "إجمالي الفواتير", value: money(totals.invoicedGrossMinor) }, { label: "صافي التحصيل", value: money(totals.netCollectedMinor) }, { label: "اشتراكات جديدة", value: String(totals.newSubscriptions) }, { label: "زيارات مقبولة", value: String(totals.attendanceAccepted) }, { label: "حجوزات", value: String(totals.reservationsTotal) }, { label: "طلبات المطبخ", value: String(totals.restaurantOrders) }]
}

function metricIcon(section: ReportSection, index: number) { const icons = section === "restaurant" ? [UtensilsCrossed, ShoppingBag, ClipboardList, WalletCards] : section === "subscriptions" ? [Users, CreditCard, RefreshCw] : section === "attendance" ? [Activity, Dumbbell, Users] : [WalletCards, CreditCard, CalendarDays, Activity, ClipboardList, ShoppingBag]; const Icon = icons[index % icons.length]; return <Icon className="size-5" /> }

type Column = { key: string; label: string; render: (row: DailyReport) => string }
function tableColumns(section: ReportSection): Column[] {
  const branch: Column = { key: "branch", label: "الفرع", render: () => "" }
  const money = (key: keyof DailyReport) => (row: DailyReport) => formatMoney(Number(row[key] ?? 0), row.currency)
  const number = (key: keyof DailyReport) => (row: DailyReport) => String(row[key] ?? 0)
  if (section === "finance") return [branch, { key: "invoices", label: "الفواتير", render: money("invoicedGrossMinor") }, { key: "collected", label: "المحصل", render: money("collectedMinor") }, { key: "net", label: "الصافي", render: money("netCollectedMinor") }, { key: "refunds", label: "المسترد", render: money("refundedMinor") }, { key: "expenses", label: "المصروفات", render: money("paidExpensesMinor") }]
  if (section === "subscriptions") return [branch, { key: "members", label: "أعضاء جدد", render: number("newMembers") }, { key: "subscriptions", label: "اشتراكات جديدة", render: number("newSubscriptions") }, { key: "renewals", label: "تجديدات", render: number("renewedSubscriptions") }]
  if (section === "attendance") return [branch, { key: "accepted", label: "دخول مقبول", render: number("attendanceAccepted") }, { key: "rejected", label: "دخول مرفوض", render: number("attendanceRejected") }]
  if (section === "bookings") return [branch, { key: "total", label: "الإجمالي", render: number("reservationsTotal") }, { key: "confirmed", label: "مؤكد", render: number("reservationsConfirmed") }, { key: "completed", label: "مكتمل", render: number("reservationsCompleted") }, { key: "cancelled", label: "ملغى", render: number("reservationsCancelled") }, { key: "noShow", label: "عدم حضور", render: number("reservationsNoShow") }]
  if (section === "restaurant") return [branch, { key: "orders", label: "الطلبات", render: number("restaurantOrders") }, { key: "completed", label: "مكتملة", render: number("restaurantOrdersCompleted") }, { key: "cancelled", label: "ملغاة", render: number("restaurantOrdersCancelled") }, { key: "gross", label: "المبيعات", render: money("restaurantGrossMinor") }]
  if (section === "cash") return [branch, { key: "shifts", label: "ورديات مغلقة", render: number("cashShiftsClosed") }, { key: "difference", label: "فرق الصندوق", render: money("cashDifferenceMinor") }, { key: "net", label: "صافي التحصيل", render: money("netCollectedMinor") }]
  return [branch, { key: "invoices", label: "الفواتير", render: money("invoicedGrossMinor") }, { key: "collected", label: "التحصيل", render: money("netCollectedMinor") }, { key: "subscriptions", label: "اشتراكات", render: number("newSubscriptions") }, { key: "attendance", label: "الحضور", render: number("attendanceAccepted") }, { key: "bookings", label: "الحجوزات", render: number("reservationsTotal") }, { key: "restaurant", label: "المطبخ", render: number("restaurantOrders") }]
}

function formatMoney(minor: number, currency = "SAR") { return new Intl.NumberFormat("ar-SA", { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100) }
function formatDate(value: string) { if (!value) return ""; return new Intl.DateTimeFormat("ar-SA", { dateStyle: "full" }).format(new Date(`${value}T12:00:00`)) }
function today() { const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 10) }
