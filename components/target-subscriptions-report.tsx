"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, CreditCard, Download, FileSpreadsheet, Gift, Search, Users } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DateTimeInput } from "@/components/date-time-input"
import { Input } from "@/components/ui/input"
import { useReportPage, reportExportRows, REPORT_PAGE_SIZE } from "@/lib/use-report-page"
import { useCoachingSearch } from "@/lib/use-coaching-page"
import { humanError } from "@/lib/human-errors"
import { canViewReport, reportPermissions } from "@/lib/permissions"

type TargetType = "package" | "promotion"
type DetailRecord = Record<string, string | number | boolean | null>
type Props = { targetType: TargetType; targetId: string; initialFrom?: string; initialTo?: string; initialBranchId?: string; targetName: string; targetCode: string }

export function TargetSubscriptionsReport({ targetType, targetId, initialFrom, initialTo, initialBranchId, targetName, targetCode }: Props) {
  const context = useAppContext()
  const defaultRange = currentMonthRange()
  const [draftFrom, setDraftFrom] = useState(initialFrom ?? defaultRange.from)
  const [draftTo, setDraftTo] = useState(initialTo ?? defaultRange.to)
  const [range, setRange] = useState({ from: initialFrom ?? defaultRange.from, to: initialTo ?? defaultRange.to })
  const [selectedBranchId, setSelectedBranchId] = useState<string | undefined>(initialBranchId)
  const branchId = selectedBranchId ?? context.branchId
  const allowed = !context.loading && canViewReport(context.grants, reportPermissions.members, context.organizationId, branchId)
  const authorizationKey = JSON.stringify(context.grants)
  const [status, setStatus] = useState<"ALL" | "VALID" | "INVALID">("ALL")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const deferredSearch = useCoachingSearch(search)
  const query = new URLSearchParams({ from: range.from, to: range.to, reportType: "MEMBERS", validity: status, sortBy: "NEWEST", [targetType === "package" ? "packageId" : "promotionId"]: targetId })
  if (branchId) query.set("branchId", branchId)
  if (deferredSearch) query.set("search", deferredSearch)
  const path = allowed && context.organizationId ? `/organizations/${context.organizationId}/reports/details?${query}` : null
  const report = useReportPage(path, `${context.userAccountId}:${authorizationKey}`, page)
  const rows = report.rows
  const loading = report.loading
  const [validationError, setValidationError] = useState("")
  const [exportError, setExportError] = useState("")
  const [exporting, setExporting] = useState(false)
  const [printRows, setPrintRows] = useState<DetailRecord[]>()
  const exportRequest = useRef<AbortController | null>(null)
  useEffect(() => { setExporting(false); setExportError(""); return () => exportRequest.current?.abort() }, [path, authorizationKey]) // eslint-disable-line react-hooks/set-state-in-effect
  const error = exportError || report.error
  const totalRows = report.summary?.totalRows ?? 0
  const pageCount = Math.max(1, Math.ceil(totalRows / REPORT_PAGE_SIZE))
  const branchNames = useMemo(() => new Map(context.branches.map(branch => [branch.id, branch.nameAr ?? branch.name ?? "فرع"])), [context.branches])
  const visibleRows = printRows ?? rows
  const memberCount = report.summary?.counts.members ?? 0
  const title = `${targetType === "package" ? "تقرير الباقة" : "تقرير العرض"}: ${targetName || targetCode || "التفاصيل"}`

  function applyRange() {
    const days = rangeDays(draftFrom, draftTo)
    if (days < 1) { setValidationError("تاريخ البداية يجب أن يسبق تاريخ النهاية أو يساويه."); return }
    if (days > 366) { setValidationError("الحد الأقصى للفترة هو 366 يومًا."); return }
    setValidationError(""); setPage(1); setRange({ from: draftFrom, to: draftTo }); report.reload()
  }

  async function prepareOutput(print: boolean) {
    if (!path || exporting) return
    const controller = new AbortController(); exportRequest.current = controller
    setExporting(true); setExportError("")
    try {
    const exportedRows = await reportExportRows(path, controller.signal)
    controller.signal.throwIfAborted()
    if (print) {
      setPrintRows(exportedRows)
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      controller.signal.throwIfAborted(); window.print(); return
    }
    const columns = reportColumns(targetType, branchNames)
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
    const csv = [columns.map(column => column.label), ...exportedRows.map(row => columns.map(column => column.value(row)))].map(row => row.map(escape).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a"); link.href = url; link.download = `go-${targetType}-subscriptions-${range.from}-${range.to}.csv`; link.click(); URL.revokeObjectURL(url)
    } catch (reason) { if (!controller.signal.aborted) setExportError(humanError(reason, "تعذر تجهيز التقرير كاملًا. حاول مجددًا.")) }
    finally { if (exportRequest.current === controller) { setExporting(false); setPrintRows(undefined) } }
  }

  const columns = reportColumns(targetType, branchNames)
  const metrics = [
    { label: "عدد الأعضاء", value: memberCount, icon: Users },
    { label: "إجمالي الاشتراكات", value: report.summary?.counts.subscriptions ?? 0, icon: CreditCard },
    { label: "الاشتراكات السارية", value: report.summary?.counts.valid ?? 0, icon: CreditCard },
    { label: "إجمالي الخصومات", value: formatMoney(report.summary?.sums.discountMinor ?? "0"), icon: Gift },
  ]

  if (!allowed) return <p role="alert">تحتاج صلاحية تقرير الأعضاء والاشتراكات لفتح هذه التفاصيل.</p>
  return <main className="reports-print-root space-y-5" dir="rtl">
    <header className="reports-print-hidden flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><Link href="/reports" className="mb-3 inline-flex items-center gap-2 text-xs font-black text-primary hover:underline"><ArrowRight className="size-4"/>العودة إلى مركز التقارير</Link><p className="text-xs font-bold text-primary">التقرير التفصيلي</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{targetCode ? `الكود: ${targetCode} · ` : ""}يعرض أصحاب الاشتراكات المتقاطعة مع الفترة المحددة.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void prepareOutput(false)} disabled={loading || exporting || !totalRows}><Download/>تصدير CSV</Button><Button onClick={() => void prepareOutput(true)} disabled={loading || exporting}><FileSpreadsheet/>طباعة التقرير</Button></div></header>
    <section className="reports-print-header hidden print:block"><div className="reports-print-heading"><h1>{title}</h1><p>{formatDate(range.from)} — {formatDate(range.to)} · {branchId ? branchNames.get(branchId) ?? "الفرع المحدد" : "كل الفروع المسموح بها"}</p></div></section>
    <Card className="reports-print-hidden"><CardContent className="space-y-4 p-4"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto] xl:items-end"><label className="text-xs font-bold">من تاريخ<DateTimeInput aria-label="بداية فترة التقرير" type="date" value={draftFrom} onChange={event => setDraftFrom(event.target.value)} className="mt-2 h-11"/></label><label className="text-xs font-bold">إلى تاريخ<DateTimeInput aria-label="نهاية فترة التقرير" type="date" value={draftTo} onChange={event => setDraftTo(event.target.value)} className="mt-2 h-11"/></label><label className="text-xs font-bold">الفرع<select aria-label="فرع التقرير" value={branchId} onChange={event => { setSelectedBranchId(event.target.value); setPage(1) }} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm">{context.branches.length > 1 && <option value="">كل الفروع المسموح بها</option>}{context.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.nameAr ?? branch.name ?? "فرع"}</option>)}</select></label><label className="text-xs font-bold">حالة الاشتراك<select aria-label="حالة الاشتراك" value={status} onChange={event => { setStatus(event.target.value as typeof status); setPage(1) }} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm"><option value="ALL">كل الاشتراكات</option><option value="VALID">السارية فقط</option><option value="INVALID">غير السارية فقط</option></select></label><Button className="h-11" onClick={applyRange}>تطبيق الفترة</Button></div>{validationError && <p role="alert" className="text-xs font-bold text-red-600">{validationError}</p>}</CardContent></Card>
    {exporting && <p role="status" className="reports-print-hidden">جارٍ تجهيز التقرير الكامل…</p>}{error ? <Card><CardContent className="p-10 text-center"><p className="font-bold text-red-600">تعذر عرض التقرير</p><p className="mt-2 text-xs text-muted-foreground">{error}</p><Button className="mt-4" variant="outline" onClick={() => { setExportError(""); report.reload() }}>إعادة المحاولة</Button></CardContent></Card> : <><section className="reports-metrics-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, icon: Icon }) => <Card key={label} className="reports-metric-card"><CardContent className="reports-metric-content p-5"><span className="reports-metric-icon mb-4 grid size-10 place-items-center rounded-xl bg-primary/12 text-amber-600"><Icon className="size-5"/></span><p className="text-xs font-bold text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-black tabular-nums">{loading ? "…" : value}</p></CardContent></Card>)}</section><div className="reports-print-hidden relative max-w-md"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input value={search} maxLength={160} aria-label="البحث في التقرير المستهدف" onChange={event => { setSearch(event.target.value); setPage(1) }} className="pr-10" placeholder="ابحث باسم العضو أو رقم الاشتراك..."/></div><Card className="reports-details-card overflow-hidden"><div className="reports-details-heading border-b px-5 py-4"><h2 className="font-black">الاشتراكات وأصحابها</h2><p className="mt-1 text-xs text-muted-foreground">{totalRows} اشتراكًا مطابقًا · {memberCount} عضوًا</p></div><div className="reports-table-wrap overflow-x-auto"><table className="reports-table w-full min-w-[1050px] text-right"><thead className="bg-secondary/45"><tr>{columns.map(column => <th key={column.key} className="px-4 py-3 text-[10px] font-bold text-muted-foreground">{column.label}</th>)}</tr></thead><tbody className="divide-y">{visibleRows.map(row => <tr key={String(row.subscriptionId)} className="hover:bg-secondary/25">{columns.map(column => <td key={column.key} className="whitespace-nowrap px-4 py-4 text-xs font-semibold">{column.key === "member" ? <Link href={`/members/${row.memberId}`} className="font-black text-primary hover:underline">{column.value(row)}</Link> : column.value(row)}</td>)}</tr>)}{loading && <tr><td colSpan={columns.length} className="p-10 text-center" role="status">جارٍ تحميل التقرير…</td></tr>}{!loading && !visibleRows.length && <tr><td colSpan={columns.length} className="px-5 py-16 text-center text-sm text-muted-foreground">لا توجد اشتراكات مطابقة للفترة والفلاتر المحددة.</td></tr>}</tbody></table></div>{pageCount > 1 && <div className="reports-print-hidden flex items-center justify-between border-t p-4"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>السابق</Button><span className="text-xs">الصفحة {page} من {pageCount}</span><Button variant="outline" size="sm" disabled={!report.hasMore || loading} onClick={() => setPage(value => value + 1)}>التالي</Button></div>}</Card></>}
  </main>
}

type Column = { key: string; label: string; value: (row: DetailRecord) => string }
function reportColumns(targetType: TargetType, branches: Map<string, string>): Column[] { const columns: Column[] = [{ key: "member", label: "العضو", value: row => `${row.memberName ?? "—"} · ${row.memberNumber ?? "—"}${row.memberIsBlocked ? " · محظور" : ""}` }, { key: "subscription", label: "رقم الاشتراك", value: row => String(row.subscriptionNumber ?? "—") }]; if (targetType === "promotion") columns.push({ key: "package", label: "الباقة", value: row => String(row.packageName ?? "—") }); columns.push({ key: "status", label: "الحالة", value: row => statusLabel(row.subscriptionStatus) }, { key: "validity", label: "السريان", value: row => row.isValid ? "ساري" : "غير ساري" }, { key: "start", label: "البداية", value: row => formatDate(row.termStart) }, { key: "end", label: "النهاية", value: row => formatDate(row.termEnd) }, { key: "branch", label: "فرع البيع", value: row => branches.get(String(row.sellingBranchId)) ?? "—" }, { key: "promotion", label: "العرض المطبق", value: row => row.promotionApplied ? `${row.promotionName ?? "عرض"}${row.promotionCode ? ` · ${row.promotionCode}` : ""}` : "بدون عرض" }, { key: "discount", label: "الخصم", value: row => formatMoney(row.discountMinor) }, { key: "gross", label: "قيمة الاشتراك", value: row => formatMoney(row.grossMinor) }); return columns }
function statusLabel(value: unknown) { const labels: Record<string, string> = { ACTIVE: "نشط", ACTIVE_PROVISIONAL: "نشط مؤقتًا", FROZEN: "مجمّد", SCHEDULED: "مجدول", EXPIRED: "منتهي", CANCELLED: "ملغى", PENDING_ACTIVATION: "بانتظار التفعيل" }; return labels[String(value ?? "")] ?? String(value ?? "—") }
function formatMoney(value: unknown) { return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(Number(value ?? 0) / 100) }
function formatDate(value: unknown) { const date = new Date(String(value ?? "")); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(date) }
function rangeDays(from: string, to: string) { const start = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`); if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0; return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1 }
function today() { const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 10) }
function currentMonthRange() { const to = today(); return { from: `${to.slice(0, 7)}-01`, to } }
