"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, CreditCard, Download, FileSpreadsheet, Gift, Search, Users } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DateTimeInput } from "@/components/date-time-input"
import { Input } from "@/components/ui/input"
import { apiRequest } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

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
  const [status, setStatus] = useState<"ALL" | "VALID" | "INVALID">("ALL")
  const [search, setSearch] = useState("")
  const [rows, setRows] = useState<DetailRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [validationError, setValidationError] = useState("")

  useEffect(() => {
    if (!context.organizationId) return
    let cancelled = false
    const frame = requestAnimationFrame(() => {
      setLoading(true); setError("")
      void (async () => {
        const collected: DetailRecord[] = []; const pageSize = 1000
        for (let offset = 0; !cancelled; offset += pageSize) {
          const query = new URLSearchParams({ from: range.from, to: range.to, reportType: "MEMBERS", limit: String(pageSize), offset: String(offset), [targetType === "package" ? "packageId" : "promotionId"]: targetId })
          if (branchId) query.set("branchId", branchId)
          const response = await apiRequest<DetailRecord[]>(`/organizations/${context.organizationId}/reports/details?${query}`)
          const page = Array.isArray(response.data) ? response.data : []
          collected.push(...page)
          if (page.length < pageSize) break
        }
        if (!cancelled) setRows(collected)
      })().catch(reason => {
        if (!cancelled) { setRows([]); setError(humanError(reason, "تعذر تحميل اشتراكات التقرير المستهدف.")) }
      }).finally(() => { if (!cancelled) setLoading(false) })
    })
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [branchId, context.organizationId, range, targetId, targetType])

  const branchNames = useMemo(() => new Map(context.branches.map(branch => [branch.id, branch.nameAr ?? branch.name ?? "فرع"])), [context.branches])
  const visibleRows = useMemo(() => rows.filter(row => {
    if (status !== "ALL" && Boolean(row.isValid) !== (status === "VALID")) return false
    if (!search.trim()) return true
    const needle = search.trim().toLocaleLowerCase("ar")
    return Object.values(row).some(value => String(value ?? "").toLocaleLowerCase("ar").includes(needle))
  }), [rows, search, status])
  const memberCount = new Set(visibleRows.map(row => String(row.memberId))).size
  const title = `${targetType === "package" ? "تقرير الباقة" : "تقرير العرض"}: ${targetName || targetCode || "التفاصيل"}`

  function applyRange() {
    const days = rangeDays(draftFrom, draftTo)
    if (days < 1) { setValidationError("تاريخ البداية يجب أن يسبق تاريخ النهاية أو يساويه."); return }
    if (days > 366) { setValidationError("الحد الأقصى للفترة هو 366 يومًا."); return }
    setValidationError(""); setRange({ from: draftFrom, to: draftTo })
  }

  function exportCsv() {
    const columns = reportColumns(targetType, branchNames)
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
    const csv = [columns.map(column => column.label), ...visibleRows.map(row => columns.map(column => column.value(row)))].map(row => row.map(escape).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a"); link.href = url; link.download = `go-${targetType}-subscriptions-${range.from}-${range.to}.csv`; link.click(); URL.revokeObjectURL(url)
  }

  const columns = reportColumns(targetType, branchNames)
  const metrics = [
    { label: "عدد الأعضاء", value: memberCount, icon: Users },
    { label: "إجمالي الاشتراكات", value: visibleRows.length, icon: CreditCard },
    { label: "الاشتراكات السارية", value: visibleRows.filter(row => row.isValid).length, icon: CreditCard },
    { label: "إجمالي الخصومات", value: formatMoney(visibleRows.reduce((sum, row) => sum + Number(row.discountMinor ?? 0), 0)), icon: Gift },
  ]

  return <main className="reports-print-root space-y-5" dir="rtl">
    <header className="reports-print-hidden flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><Link href="/reports" className="mb-3 inline-flex items-center gap-2 text-xs font-black text-primary hover:underline"><ArrowRight className="size-4"/>العودة إلى مركز التقارير</Link><p className="text-xs font-bold text-primary">التقرير التفصيلي</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{targetCode ? `الكود: ${targetCode} · ` : ""}يعرض أصحاب الاشتراكات المتقاطعة مع الفترة المحددة.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportCsv} disabled={loading || !visibleRows.length}><Download/>تصدير CSV</Button><Button onClick={() => window.print()} disabled={loading}><FileSpreadsheet/>طباعة التقرير</Button></div></header>
    <section className="reports-print-header hidden print:block"><div className="reports-print-heading"><h1>{title}</h1><p>{formatDate(range.from)} — {formatDate(range.to)} · {branchId ? branchNames.get(branchId) ?? "الفرع المحدد" : "كل الفروع المسموح بها"}</p></div></section>
    <Card className="reports-print-hidden"><CardContent className="space-y-4 p-4"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto] xl:items-end"><label className="text-xs font-bold">من تاريخ<DateTimeInput aria-label="بداية فترة التقرير" type="date" value={draftFrom} onChange={event => setDraftFrom(event.target.value)} className="mt-2 h-11"/></label><label className="text-xs font-bold">إلى تاريخ<DateTimeInput aria-label="نهاية فترة التقرير" type="date" value={draftTo} onChange={event => setDraftTo(event.target.value)} className="mt-2 h-11"/></label><label className="text-xs font-bold">الفرع<select aria-label="فرع التقرير" value={branchId} onChange={event => setSelectedBranchId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm">{context.branches.length > 1 && <option value="">كل الفروع المسموح بها</option>}{context.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.nameAr ?? branch.name ?? "فرع"}</option>)}</select></label><label className="text-xs font-bold">حالة الاشتراك<select aria-label="حالة الاشتراك" value={status} onChange={event => setStatus(event.target.value as typeof status)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm"><option value="ALL">كل الاشتراكات</option><option value="VALID">السارية فقط</option><option value="INVALID">غير السارية فقط</option></select></label><Button className="h-11" onClick={applyRange}>تطبيق الفترة</Button></div>{validationError && <p role="alert" className="text-xs font-bold text-red-600">{validationError}</p>}</CardContent></Card>
    {error ? <Card><CardContent className="p-10 text-center"><p className="font-bold text-red-600">تعذر عرض التقرير</p><p className="mt-2 text-xs text-muted-foreground">{error}</p></CardContent></Card> : loading ? <div className="grid min-h-64 place-items-center" aria-label="جارٍ تحميل التقرير"><span className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent"/></div> : <><section className="reports-metrics-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, icon: Icon }) => <Card key={label} className="reports-metric-card"><CardContent className="reports-metric-content p-5"><span className="reports-metric-icon mb-4 grid size-10 place-items-center rounded-xl bg-primary/12 text-amber-600"><Icon className="size-5"/></span><p className="text-xs font-bold text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-black tabular-nums">{value}</p></CardContent></Card>)}</section><div className="reports-print-hidden relative max-w-md"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input value={search} onChange={event => setSearch(event.target.value)} className="pr-10" placeholder="ابحث باسم العضو أو رقم الاشتراك..."/></div><Card className="reports-details-card overflow-hidden"><div className="reports-details-heading border-b px-5 py-4"><h2 className="font-black">الاشتراكات وأصحابها</h2><p className="mt-1 text-xs text-muted-foreground">{visibleRows.length} اشتراكًا ظاهرًا · {memberCount} عضوًا</p></div><div className="reports-table-wrap overflow-x-auto"><table className="reports-table w-full min-w-[1050px] text-right"><thead className="bg-secondary/45"><tr>{columns.map(column => <th key={column.key} className="px-4 py-3 text-[10px] font-bold text-muted-foreground">{column.label}</th>)}</tr></thead><tbody className="divide-y">{visibleRows.map(row => <tr key={String(row.subscriptionId)} className="hover:bg-secondary/25">{columns.map(column => <td key={column.key} className="whitespace-nowrap px-4 py-4 text-xs font-semibold">{column.key === "member" ? <Link href={`/members/${row.memberId}`} className="font-black text-primary hover:underline">{column.value(row)}</Link> : column.value(row)}</td>)}</tr>)}{!visibleRows.length && <tr><td colSpan={columns.length} className="px-5 py-16 text-center text-sm text-muted-foreground">لا توجد اشتراكات مطابقة للفترة والفلاتر المحددة.</td></tr>}</tbody></table></div></Card></>}
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
