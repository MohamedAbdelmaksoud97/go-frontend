"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Activity, BadgeDollarSign, CalendarClock, CalendarDays, CalendarRange, CircleDollarSign, ClipboardList, CreditCard, Download, FileSpreadsheet, ReceiptText, Search, WalletCards } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DateTimeInput } from "@/components/date-time-input"
import { Input } from "@/components/ui/input"
import { apiRequest } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

type DailyReport = {
  businessDate: string; branchId: string; currency: string; invoicedGrossMinor: string; collectedMinor: string; refundedMinor: string; netCollectedMinor: string; paidExpensesMinor: string
  newMembers: number; newSubscriptions: number; renewedSubscriptions: number; attendanceAccepted: number; attendanceRejected: number; reservationsTotal: number
  reservationsConfirmed: number; reservationsCompleted: number; reservationsCancelled: number; reservationsNoShow: number; restaurantOrders: number
  restaurantCompletedOrders: number; restaurantCancelledOrders: number; restaurantGrossMinor: string; cashShiftsClosed: number; cashDifferenceMinor: string; asOf: string
}
type DetailRecord = Record<string, string | number | boolean | null>
type DetailType = "SUBSCRIPTIONS" | "SERVICES" | "ATTENDANCE" | "DEBTS" | "EXPENSES" | "TREASURY"
type ReportSection = "overview" | "subscriptions" | "expiry" | "services" | "attendance" | "debts" | "expenses" | "treasury" | "net"
type TreasuryView = "DETAIL" | "DAY" | "MONTH"
type Metric = { label: string; value: string; note?: string }
type Column = { key: string; label: string; value: (row: DetailRecord) => string; className?: string }

const reports: Array<{ id: ReportSection; label: string; description: string; icon: typeof Activity }> = [
  { id: "overview", label: "الملخص", description: "ملخص مالي وتشغيلي للفترة المحددة.", icon: ClipboardList },
  { id: "subscriptions", label: "الاشتراكات", description: "الاشتراكات السارية وغير السارية التي تتقاطع مع الفترة.", icon: CreditCard },
  { id: "expiry", label: "انتهاء الاشتراكات", description: "تاريخ نهاية كل اشتراك وعدد الأيام المتبقية لكل مشترك.", icon: CalendarClock },
  { id: "services", label: "الخدمات", description: "أداء كل خدمة منفصلة من حيث الكمية والإيراد والخصومات.", icon: FileSpreadsheet },
  { id: "attendance", label: "الحضور", description: "تفاصيل محاولات الدخول المقبولة والمرفوضة.", icon: Activity },
  { id: "debts", label: "المديونيات", description: "الفواتير غير المسددة وأعمارها والمبالغ المتبقية.", icon: BadgeDollarSign },
  { id: "expenses", label: "المصروفات", description: "تفاصيل المصروفات وحالاتها وطريقة دفعها.", icon: ReceiptText },
  { id: "treasury", label: "الخزنة", description: "الفواتير والعروض والمدفوع والمتبقي، تفصيليًا أو مجمعًا.", icon: WalletCards },
  { id: "net", label: "صافي الخزنة", description: "التحصيل ناقص المستردات والمصروفات المدفوعة.", icon: CircleDollarSign },
]
const detailTypes: Partial<Record<ReportSection, DetailType>> = { subscriptions: "SUBSCRIPTIONS", expiry: "SUBSCRIPTIONS", services: "SERVICES", attendance: "ATTENDANCE", debts: "DEBTS", expenses: "EXPENSES", treasury: "TREASURY" }

export function ReportsWorkspace() {
  const context = useAppContext()
  const initialRange = currentMonthRange()
  const [draftFrom, setDraftFrom] = useState(initialRange.from)
  const [draftTo, setDraftTo] = useState(initialRange.to)
  const [range, setRange] = useState(initialRange)
  const [branchSelection, setBranchSelection] = useState(() => ({ contextBranchId: context.branchId, value: context.branchId }))
  const branchId = branchSelection.contextBranchId === context.branchId ? branchSelection.value : context.branchId
  const [section, setSection] = useState<ReportSection>("overview")
  const [treasuryView, setTreasuryView] = useState<TreasuryView>("DETAIL")
  const [validity, setValidity] = useState<"ALL" | "VALID" | "INVALID">("ALL")
  const [search, setSearch] = useState("")
  const [dailyRows, setDailyRows] = useState<DailyReport[]>([])
  const [detailRows, setDetailRows] = useState<DetailRecord[]>([])
  const [asOf, setAsOf] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [validationError, setValidationError] = useState("")
  const detailType = detailTypes[section]

  useEffect(() => {
    if (!context.organizationId) return
    let cancelled = false
    const frame = requestAnimationFrame(() => {
      setLoading(true); setError("")
      const params = new URLSearchParams({ from: range.from, to: range.to })
      if (branchId) params.set("branchId", branchId)
      const dailyRequest = apiRequest<DailyReport[]>(`/organizations/${context.organizationId}/reports/branch-daily?${params}`)
      const detailParams = new URLSearchParams(params); if (detailType) { detailParams.set("reportType", detailType); detailParams.set("limit", "1000") }
      const detailRequest = detailType ? apiRequest<DetailRecord[]>(`/organizations/${context.organizationId}/reports/details?${detailParams}`) : Promise.resolve(undefined)
      void Promise.all([dailyRequest, detailRequest]).then(([dailyResponse, detailResponse]) => {
        if (cancelled) return
        setDailyRows(Array.isArray(dailyResponse.data) ? dailyResponse.data : [])
        setDetailRows(detailResponse && Array.isArray(detailResponse.data) ? detailResponse.data : [])
        setAsOf(String(detailResponse?.meta?.asOf ?? dailyResponse.meta?.asOf ?? "") || null)
      }).catch(reason => { if (!cancelled) { setDailyRows([]); setDetailRows([]); setError(humanError(reason, "تعذر إعداد التقرير للفترة المحددة.")) } }).finally(() => { if (!cancelled) setLoading(false) })
    })
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [branchId, context.organizationId, detailType, range])

  const branchNames = useMemo(() => new Map(context.branches.map(branch => [branch.id, branch.nameAr ?? branch.name ?? "فرع"])), [context.branches])
  const visibleDetails = useMemo(() => detailRows.filter(row => {
    if ((section === "subscriptions" || section === "expiry") && validity !== "ALL" && Boolean(row.isValid) !== (validity === "VALID")) return false
    if (!search.trim()) return true
    const needle = search.trim().toLocaleLowerCase("ar")
    return Object.values(row).some(value => String(value ?? "").toLocaleLowerCase("ar").includes(needle))
  }), [detailRows, search, section, validity])
  const dailyMode = (section === "net" || (section === "treasury" && treasuryView !== "DETAIL")) && treasuryView === "MONTH" ? "MONTH" : "DAY"
  const dailyDisplay = useMemo(() => groupDailyRows(dailyRows, dailyMode), [dailyMode, dailyRows])
  const activeReport = reports.find(item => item.id === section) ?? reports[0]
  const columns = detailColumns(section, branchNames)
  const showDailyTable = section === "overview" || section === "net" || (section === "treasury" && treasuryView !== "DETAIL")
  const metrics = reportMetrics(section, dailyRows, visibleDetails, showDailyTable)

  function applyRange() {
    const days = rangeDays(draftFrom, draftTo)
    if (days < 1) { setValidationError("تاريخ البداية يجب أن يسبق تاريخ النهاية أو يساويه."); return }
    if (days > 366) { setValidationError("الحد الأقصى للفترة هو 366 يومًا."); return }
    setValidationError(""); setRange({ from: draftFrom, to: draftTo })
  }
  function selectPreset(preset: "TODAY" | "WEEK" | "MONTH") {
    const to = today(); const from = preset === "TODAY" ? to : preset === "WEEK" ? addDays(to, -6) : `${to.slice(0, 7)}-01`
    setDraftFrom(from); setDraftTo(to); setValidationError(""); setRange({ from, to })
  }
  function exportCsv() {
    const table = showDailyTable ? dailyColumns(section).map(column => ({ label: column.label, values: dailyDisplay.map(row => column.value(row, branchNames)) })) : columns.map(column => ({ label: column.label, values: visibleDetails.map(row => column.value(row)) }))
    const count = table[0]?.values.length ?? 0
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
    const csv = [table.map(column => column.label), ...Array.from({ length: count }, (_, index) => table.map(column => column.values[index] ?? ""))].map(row => row.map(escape).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a"); link.href = url; link.download = `go-report-${section}-${range.from}-${range.to}.csv`; link.click(); URL.revokeObjectURL(url)
  }

  return <main className="reports-print-root space-y-5" dir="rtl">
    <header className="reports-print-hidden flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-xs font-bold text-primary">مركز التقارير</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">التقارير الإدارية والمالية</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">أنشئ تقريرًا دقيقًا لأي فترة، راجع التفاصيل، ثم اطبعه أو صدّره إلى CSV.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportCsv} disabled={loading || (!dailyRows.length && !visibleDetails.length)}><Download />تصدير CSV</Button><Button onClick={() => window.print()} disabled={loading}><FileSpreadsheet />طباعة التقرير</Button></div></header>
    <Card className="reports-print-hidden"><CardContent className="space-y-4 p-4"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end"><label className="text-xs font-bold">من تاريخ<DateTimeInput aria-label="بداية فترة التقرير" type="date" value={draftFrom} onChange={event => setDraftFrom(event.target.value)} className="mt-2 h-11" /></label><label className="text-xs font-bold">إلى تاريخ<DateTimeInput aria-label="نهاية فترة التقرير" type="date" value={draftTo} onChange={event => setDraftTo(event.target.value)} className="mt-2 h-11" /></label><label className="text-xs font-bold">الفرع<select aria-label="فرع التقرير" value={branchId} onChange={event => setBranchSelection({ contextBranchId: context.branchId, value: event.target.value })} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary">{context.branches.length > 1 && <option value="">كل الفروع المسموح بها</option>}{context.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.nameAr ?? branch.name ?? "فرع"}</option>)}</select></label><Button className="h-11" onClick={applyRange}><CalendarRange />تطبيق الفترة</Button></div><div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-bold text-muted-foreground">فترات سريعة:</span><Button size="sm" variant="outline" onClick={() => selectPreset("TODAY")}>اليوم</Button><Button size="sm" variant="outline" onClick={() => selectPreset("WEEK")}>آخر 7 أيام</Button><Button size="sm" variant="outline" onClick={() => selectPreset("MONTH")}>الشهر الحالي</Button><span className="mr-auto rounded-lg bg-primary/10 px-3 py-2 text-[11px] font-bold text-amber-800 dark:text-primary"><CalendarDays className="ml-1 inline size-4" />{formatRange(range.from, range.to)}</span></div>{validationError && <p role="alert" className="text-xs font-bold text-red-600">{validationError}</p>}</CardContent></Card>
    <nav className="reports-print-hidden flex gap-2 overflow-x-auto pb-1" aria-label="أنواع التقارير" role="tablist">{reports.map(item => { const Icon = item.icon; return <button key={item.id} type="button" role="tab" aria-selected={section === item.id} onClick={() => { setSection(item.id); setSearch("") }} className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition ${section === item.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50"}`}><Icon className="size-4" aria-hidden="true" />{item.label}</button> })}</nav>
    <section className="reports-print-header hidden print:block"><div className="reports-print-brand"><div className="print-logo-plate"><Image src="/go-fitness-logo.png" alt="شعار GO Fitness" width={104} height={58}/></div><div><strong>GO Fitness</strong><span>التقارير الإدارية والمالية</span></div></div><div className="reports-print-heading"><h1>{activeReport.label}</h1><p>{formatRange(range.from, range.to)} · {branchId ? branchNames.get(branchId) ?? "الفرع المحدد" : "كل الفروع المسموح بها"}</p></div></section>
    <Card className="reports-print-hidden border-primary/20 bg-primary/5"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black">{activeReport.label}</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">{activeReport.description}</p></div><div className="flex flex-wrap gap-2">{(section === "subscriptions" || section === "expiry") && <select aria-label="حالة سريان الاشتراك" value={validity} onChange={event => setValidity(event.target.value as typeof validity)} className="h-10 rounded-xl border bg-background px-3 text-xs font-bold"><option value="ALL">كل الاشتراكات</option><option value="VALID">سارية فقط</option><option value="INVALID">غير سارية فقط</option></select>}{(section === "treasury" || section === "net") && <div className="flex rounded-xl border bg-background p-1" aria-label="تجميع تقرير الخزنة">{(section === "treasury" ? [["DETAIL", "تفصيلي"], ["DAY", "يومي"], ["MONTH", "شهري"]] : [["DAY", "يومي"], ["MONTH", "شهري"]]).map(([value, label]) => <button key={value} type="button" onClick={() => setTreasuryView(value as TreasuryView)} className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${treasuryView === value ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{label}</button>)}</div>}</div></CardContent></Card>
    {error ? <Card><CardContent className="p-10 text-center"><p className="font-bold text-red-600">تعذر عرض التقرير</p><p className="mt-2 text-xs text-muted-foreground">{error}</p></CardContent></Card> : loading ? <div className="grid min-h-64 place-items-center" aria-label="جارٍ إعداد التقرير"><span className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div> : <><section className="reports-metrics-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric, index) => <Card key={metric.label} className="reports-metric-card"><CardContent className="reports-metric-content p-5"><span className={`reports-metric-icon mb-4 grid size-10 place-items-center rounded-xl ${index % 3 === 0 ? "bg-primary/12 text-amber-600" : index % 3 === 1 ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600"}`}>{metricIcon(section)}</span><p className="text-xs font-bold text-muted-foreground">{metric.label}</p><p className="mt-2 text-2xl font-black tabular-nums">{metric.value}</p>{metric.note && <p className="mt-1 text-[10px] text-muted-foreground">{metric.note}</p>}</CardContent></Card>)}</section>{!showDailyTable && <div className="reports-print-hidden relative max-w-md"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} className="pr-10" placeholder="ابحث داخل نتائج التقرير..." /></div>}<Card className="reports-details-card overflow-hidden"><div className="reports-details-heading border-b px-5 py-4"><h2 className="font-black">تفاصيل {activeReport.label}</h2><p className="mt-1 text-xs text-muted-foreground">{showDailyTable ? dailyDisplay.length : visibleDetails.length} سجلًا ظاهرًا{asOf ? ` · آخر تحديث ${formatDateTime(asOf)}` : ""}</p></div><div className="reports-table-wrap overflow-x-auto">{showDailyTable ? <DailyTable section={section} rows={dailyDisplay} branchNames={branchNames} /> : <DetailsTable columns={columns} rows={visibleDetails} />}</div></Card></>}
  </main>
}

function DetailsTable({ columns, rows }: { columns: Column[]; rows: DetailRecord[] }) { return <table className="reports-table w-full min-w-[980px] text-right"><thead className="bg-secondary/45"><tr>{columns.map(column => <th key={column.key} className="px-4 py-3 text-[10px] font-bold text-muted-foreground">{column.label}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row, index) => <tr key={String(row.subscriptionId ?? row.invoiceId ?? row.expenseId ?? row.attemptId ?? row.serviceId ?? index)} className="hover:bg-secondary/25">{columns.map(column => <td key={column.key} className={`whitespace-nowrap px-4 py-4 text-xs font-semibold ${column.className ?? ""}`}>{column.value(row)}</td>)}</tr>)}{!rows.length && <tr><td colSpan={columns.length} className="px-5 py-16 text-center text-sm text-muted-foreground">لا توجد بيانات مطابقة للفترة والفلاتر المحددة.</td></tr>}</tbody></table> }
function DailyTable({ section, rows, branchNames }: { section: ReportSection; rows: DailyReport[]; branchNames: Map<string, string> }) { const columns = dailyColumns(section); return <table className="reports-table w-full min-w-[980px] text-right"><thead className="bg-secondary/45"><tr>{columns.map(column => <th key={column.key} className="px-4 py-3 text-[10px] font-bold text-muted-foreground">{column.label}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row, index) => <tr key={`${row.branchId}-${row.businessDate}-${index}`} className="hover:bg-secondary/25">{columns.map(column => <td key={column.key} className="whitespace-nowrap px-4 py-4 text-xs font-semibold">{column.value(row, branchNames)}</td>)}</tr>)}{!rows.length && <tr><td colSpan={columns.length} className="px-5 py-16 text-center text-sm text-muted-foreground">لا توجد حركة مسجلة في الفترة المحددة.</td></tr>}</tbody></table> }

function detailColumns(section: ReportSection, branches: Map<string, string>): Column[] {
  const branch: Column = { key: "branch", label: "الفرع", value: row => branches.get(String(row.branchId)) ?? "فرع" }; const money = (key: string) => (row: DetailRecord) => formatMoney(row[key])
  if (section === "subscriptions") return [{ key: "number", label: "الاشتراك", value: row => String(row.subscriptionNumber ?? "—") }, { key: "member", label: "العضو", value: memberLabel }, { key: "package", label: "الباقة", value: row => String(row.packageName ?? "—") }, branch, { key: "start", label: "البداية", value: row => formatDateValue(row.termStart) }, { key: "end", label: "النهاية", value: row => formatDateValue(row.termEnd) }, { key: "valid", label: "السريان", value: row => Boolean(row.isValid) ? "ساري" : "غير ساري", className: "font-black" }, { key: "status", label: "الحالة", value: row => statusLabel(row.status) }]
  if (section === "expiry") return [{ key: "member", label: "العضو", value: memberLabel }, { key: "number", label: "الاشتراك", value: row => String(row.subscriptionNumber ?? "—") }, { key: "package", label: "الباقة", value: row => String(row.packageName ?? "—") }, branch, { key: "end", label: "تاريخ الانتهاء", value: row => formatDateValue(row.termEnd) }, { key: "days", label: "الأيام المتبقية", value: remainingDays }, { key: "visits", label: "الزيارات", value: row => `${row.visitsUsed ?? 0} / ${row.visitAllowance ?? "غير محدود"}` }, { key: "valid", label: "السريان", value: row => Boolean(row.isValid) ? "ساري" : "غير ساري" }]
  if (section === "services") return [{ key: "service", label: "الخدمة", value: row => `${row.serviceName ?? "—"} · ${row.serviceCode ?? ""}` }, branch, { key: "orders", label: "عدد الطلبات", value: row => String(row.ordersCount ?? 0) }, { key: "quantity", label: "الكمية", value: row => String(row.quantity ?? 0) }, { key: "before", label: "قبل الخصم", value: money("priceBeforeDiscountMinor") }, { key: "promotion", label: "العروض", value: row => String(row.promotionNames || "لا يوجد") }, { key: "discount", label: "الخصم", value: money("discountMinor") }, { key: "gross", label: "الإجمالي", value: money("grossMinor") }]
  if (section === "attendance") return [{ key: "member", label: "العضو", value: memberLabel }, branch, { key: "service", label: "الخدمة", value: row => String(row.serviceName ?? "—") }, { key: "time", label: "وقت الدخول", value: row => formatDateTime(row.attemptedAt) }, { key: "method", label: "الطريقة", value: row => accessMethodLabel(row.accessMethod) }, { key: "decision", label: "النتيجة", value: row => row.decision === "ACCEPTED" ? "مقبول" : "مرفوض" }, { key: "reason", label: "سبب الرفض", value: row => String(row.rejectionReason ?? "—") }]
  if (section === "debts") return [{ key: "invoice", label: "الفاتورة", value: row => String(row.invoiceNumber ?? "—") }, { key: "member", label: "العضو", value: memberLabel }, branch, { key: "issued", label: "تاريخ الإصدار", value: row => formatDateTime(row.issuedAt) }, { key: "gross", label: "الإجمالي", value: money("grossMinor") }, { key: "paid", label: "المدفوع", value: money("paidMinor") }, { key: "remaining", label: "المديونية", value: money("outstandingMinor"), className: "text-red-700 dark:text-red-400" }, { key: "age", label: "عمر المديونية", value: row => `${row.ageDays ?? 0} يوم` }]
  if (section === "expenses") return [{ key: "category", label: "التصنيف", value: row => String(row.categoryName ?? "—") }, { key: "description", label: "البيان", value: row => String(row.description ?? "—") }, branch, { key: "created", label: "تاريخ التسجيل", value: row => formatDateTime(row.createdAt) }, { key: "amount", label: "المبلغ", value: money("amountMinor") }, { key: "status", label: "الحالة", value: row => statusLabel(row.status) }, { key: "method", label: "طريقة الدفع", value: row => paymentMethodLabel(row.paymentMethod) }, { key: "employee", label: "الموظف", value: row => String(row.createdByName ?? "—") }]
  return [{ key: "invoice", label: "الفاتورة", value: row => String(row.invoiceNumber ?? "—") }, { key: "member", label: "المشترك", value: memberLabel }, branch, { key: "date", label: "التاريخ", value: row => formatDateTime(row.issuedAt) }, { key: "before", label: "السعر قبل العرض", value: money("priceBeforeDiscountMinor") }, { key: "promotion", label: "العرض", value: row => String(row.promotionNames || "لا يوجد") }, { key: "discount", label: "الخصم", value: money("discountMinor") }, { key: "gross", label: "الإجمالي", value: money("grossMinor") }, { key: "paid", label: "المدفوع", value: money("paidMinor") }, { key: "remaining", label: "الباقي", value: money("outstandingMinor") }, { key: "method", label: "طريقة الدفع", value: row => paymentMethodLabel(row.paymentMethods) }]
}

type DailyColumn = { key: string; label: string; value: (row: DailyReport, branches: Map<string, string>) => string }
function dailyColumns(section: ReportSection): DailyColumn[] {
  const base: DailyColumn[] = [{ key: "date", label: "الفترة", value: row => formatPeriod(row.businessDate) }, { key: "branch", label: "الفرع", value: (row, branches) => branches.get(row.branchId) ?? "كل الفروع" }]
  if (section === "net" || section === "treasury") return [...base, { key: "collected", label: "المحصل", value: row => formatMoney(row.collectedMinor) }, { key: "refunded", label: "المسترد", value: row => formatMoney(row.refundedMinor) }, { key: "netCollection", label: "صافي التحصيل", value: row => formatMoney(row.netCollectedMinor) }, { key: "expenses", label: "المصروفات المدفوعة", value: row => formatMoney(row.paidExpensesMinor) }, { key: "net", label: "صافي الخزنة", value: row => formatMoney(Number(row.netCollectedMinor) - Number(row.paidExpensesMinor)) }, { key: "difference", label: "فرق الجرد", value: row => formatMoney(row.cashDifferenceMinor) }]
  return [...base, { key: "invoices", label: "الفواتير", value: row => formatMoney(row.invoicedGrossMinor) }, { key: "collected", label: "التحصيل", value: row => formatMoney(row.collectedMinor) }, { key: "expenses", label: "المصروفات", value: row => formatMoney(row.paidExpensesMinor) }, { key: "net", label: "صافي الخزنة", value: row => formatMoney(Number(row.netCollectedMinor) - Number(row.paidExpensesMinor)) }, { key: "subscriptions", label: "اشتراكات جديدة", value: row => String(row.newSubscriptions) }, { key: "attendance", label: "حضور مقبول", value: row => String(row.attendanceAccepted) }]
}

function reportMetrics(section: ReportSection, daily: DailyReport[], details: DetailRecord[], showDailyTable: boolean): Metric[] {
  const sumDaily = (key: keyof DailyReport) => daily.reduce((sum, row) => sum + Number(row[key] ?? 0), 0); const sumDetails = (key: string) => details.reduce((sum, row) => sum + Number(row[key] ?? 0), 0)
  if (section === "subscriptions" || section === "expiry") return [{ label: "إجمالي الاشتراكات", value: String(details.length) }, { label: "اشتراكات سارية", value: String(details.filter(row => row.isValid).length) }, { label: "غير سارية", value: String(details.filter(row => !row.isValid).length) }, { label: "تنتهي خلال 7 أيام", value: String(details.filter(row => row.isValid && Number(row.remainingDays) <= 7).length) }]
  if (section === "services") return [{ label: "عدد الخدمات", value: String(details.length) }, { label: "الوحدات المباعة", value: String(sumDetails("quantity")) }, { label: "إجمالي الخصومات", value: formatMoney(sumDetails("discountMinor")) }, { label: "إجمالي المبيعات", value: formatMoney(sumDetails("grossMinor")) }]
  if (section === "attendance") return [{ label: "إجمالي المحاولات", value: String(details.length) }, { label: "دخول مقبول", value: String(details.filter(row => row.decision === "ACCEPTED").length) }, { label: "دخول مرفوض", value: String(details.filter(row => row.decision === "REJECTED").length) }, { label: "نسبة القبول", value: details.length ? `${Math.round(details.filter(row => row.decision === "ACCEPTED").length / details.length * 100)}%` : "0%" }]
  if (section === "debts") return [{ label: "إجمالي المديونية", value: formatMoney(sumDetails("outstandingMinor")) }, { label: "عدد الفواتير", value: String(details.length) }, { label: "إجمالي الفواتير", value: formatMoney(sumDetails("grossMinor")) }, { label: "المبالغ المسددة", value: formatMoney(sumDetails("paidMinor")) }]
  if (section === "expenses") return [{ label: "إجمالي المصروفات", value: formatMoney(sumDetails("amountMinor")) }, { label: "مصروفات مدفوعة", value: formatMoney(details.filter(row => row.status === "PAID").reduce((sum, row) => sum + Number(row.amountMinor ?? 0), 0)) }, { label: "عدد السجلات", value: String(details.length) }, { label: "بانتظار الإجراء", value: String(details.filter(row => !["PAID", "VOIDED"].includes(String(row.status))).length) }]
  if (section === "treasury") return showDailyTable
    ? [{ label: "المحصل", value: formatMoney(sumDaily("collectedMinor")) }, { label: "المسترد", value: formatMoney(sumDaily("refundedMinor")) }, { label: "المصروفات المدفوعة", value: formatMoney(sumDaily("paidExpensesMinor")) }, { label: "صافي الخزنة", value: formatMoney(sumDaily("netCollectedMinor") - sumDaily("paidExpensesMinor")) }]
    : [{ label: "إجمالي الفواتير", value: formatMoney(sumDetails("grossMinor")) }, { label: "المدفوع", value: formatMoney(sumDetails("paidMinor")) }, { label: "الباقي", value: formatMoney(sumDetails("outstandingMinor")) }, { label: "الخصومات", value: formatMoney(sumDetails("discountMinor")) }]
  const collected = sumDaily("collectedMinor"), refunds = sumDaily("refundedMinor"), expenses = sumDaily("paidExpensesMinor")
  if (section === "net") return [{ label: "التحصيل", value: formatMoney(collected) }, { label: "المستردات", value: formatMoney(refunds) }, { label: "المصروفات المدفوعة", value: formatMoney(expenses) }, { label: "صافي الخزنة", value: formatMoney(collected - refunds - expenses), note: "التحصيل − المستردات − المصروفات المدفوعة" }]
  return [{ label: "إجمالي الفواتير", value: formatMoney(sumDaily("invoicedGrossMinor")) }, { label: "صافي الخزنة", value: formatMoney(collected - refunds - expenses) }, { label: "اشتراكات جديدة", value: String(sumDaily("newSubscriptions")) }, { label: "زيارات مقبولة", value: String(sumDaily("attendanceAccepted")) }]
}

function groupDailyRows(rows: DailyReport[], mode: "DAY" | "MONTH"): DailyReport[] {
  if (mode === "DAY") return rows
  const grouped = new Map<string, DailyReport>(); const moneyKeys = ["invoicedGrossMinor", "collectedMinor", "refundedMinor", "netCollectedMinor", "paidExpensesMinor", "restaurantGrossMinor", "cashDifferenceMinor"] as const; const countKeys = ["newMembers", "newSubscriptions", "renewedSubscriptions", "attendanceAccepted", "attendanceRejected", "reservationsTotal", "reservationsConfirmed", "reservationsCompleted", "reservationsCancelled", "reservationsNoShow", "restaurantOrders", "restaurantCompletedOrders", "restaurantCancelledOrders", "cashShiftsClosed"] as const
  for (const row of rows) { const period = row.businessDate.slice(0, 7); const key = `${row.branchId}-${period}`; const current = grouped.get(key); if (!current) { grouped.set(key, { ...row, businessDate: period }); continue }; const next = { ...current }; moneyKeys.forEach(name => { next[name] = String(Number(current[name]) + Number(row[name])) }); countKeys.forEach(name => { next[name] = Number(current[name]) + Number(row[name]) }); grouped.set(key, next) }
  return [...grouped.values()].sort((a, b) => a.businessDate.localeCompare(b.businessDate) || a.branchId.localeCompare(b.branchId))
}

function memberLabel(row: DetailRecord) { return `${row.memberName ?? "زائر"} · ${row.memberNumber ?? "—"}${row.memberIsBlocked ? " · محظور" : ""}` }
function remainingDays(row: DetailRecord) { return Boolean(row.isValid) ? `${Number(row.remainingDays ?? 0)} يوم` : "منتهي" }
function metricIcon(section: ReportSection) { const Icon = reports.find(item => item.id === section)?.icon ?? ClipboardList; return <Icon className="size-5" aria-hidden="true" /> }
function formatMoney(value: unknown, currency = "SAR") { return new Intl.NumberFormat("ar-SA", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value ?? 0) / 100) }
function formatDateValue(value: unknown) { const date = new Date(String(value ?? "")); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(date) }
function formatDateTime(value: unknown) { const date = new Date(String(value ?? "")); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(date) }
function formatPeriod(value: string) { return /^\d{4}-\d{2}$/.test(value) ? new Intl.DateTimeFormat("ar-SA", { month: "long", year: "numeric" }).format(new Date(`${value}-01T12:00:00`)) : formatDateValue(value) }
function formatRange(from: string, to: string) { return `${formatDateValue(from)} — ${formatDateValue(to)}` }
function statusLabel(value: unknown) { const labels: Record<string, string> = { ACTIVE: "نشط", ACTIVE_PROVISIONAL: "نشط مؤقتًا", FROZEN: "مجمّد", SCHEDULED: "مجدول", EXPIRED: "منتهي", CANCELLED: "ملغى", PENDING_ACTIVATION: "بانتظار التفعيل", ISSUED: "صادرة", PARTIALLY_PAID: "مدفوعة جزئيًا", PAID: "مدفوع", DRAFT: "مسودة", SUBMITTED: "مقدم", APPROVED: "معتمد", VOIDED: "ملغى" }; return labels[String(value ?? "")] ?? String(value ?? "—") }
function accessMethodLabel(value: unknown) { const labels: Record<string, string> = { MANUAL: "يدوي", BARCODE: "باركود", BIOMETRIC: "بصمة", QR: "رمز QR" }; return labels[String(value ?? "")] ?? String(value ?? "—") }
function paymentMethodLabel(value: unknown) { const values = String(value ?? "").split("،").map(item => item.trim()).filter(Boolean); if (!values.length) return "غير مسدد"; const labels: Record<string, string> = { CASH: "نقدي", CARD: "بطاقة", BANK_TRANSFER: "تحويل بنكي", ONLINE: "إلكتروني" }; return values.map(item => labels[item] ?? item).join("، ") }
function rangeDays(from: string, to: string) { const start = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`); if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0; return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1 }
function addDays(value: string, days: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }
function today() { const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 10) }
function currentMonthRange() { const to = today(); return { from: `${to.slice(0, 7)}-01`, to } }
