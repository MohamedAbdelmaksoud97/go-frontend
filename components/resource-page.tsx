"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { BarChart3, ChevronLeft, ChevronRight, Download, Eye, MoreHorizontal, Plus, Search, ShieldAlert, SlidersHorizontal, Sparkles, X } from "lucide-react"
import type { SectionConfig } from "@/lib/sections"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAppContext } from "@/components/app-context"
import { endpoints } from "@/lib/endpoint-catalog"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { ActionDialog } from "@/components/action-dialog"
import { operationPermissions } from "@/lib/permissions"

type BranchLookup = { id: string; nameAr?: string; name?: string }
type ApiRecord = Record<string, unknown>

export function ResourcePage({ config }: { config: SectionConfig }) {
  const context = useAppContext()
  const [query, setQuery] = useState("")
  const [databaseQuery, setDatabaseQuery] = useState("")
  const [status, setStatus] = useState("")
  const [showAction, setShowAction] = useState(false)
  const [selectedRow, setSelectedRow] = useState<{ row: string[]; record: ApiRecord }>()
  const [serverRows, setServerRows] = useState<string[][]>(config.rows)
  const [serverRecords, setServerRecords] = useState<ApiRecord[]>([])
  const [loading, setLoading] = useState(hasRuntimeApi())
  const [error, setError] = useState("")
  const [page, setPage] = useState(0)
  const [knownPages, setKnownPages] = useState(0)
  const pageCache = useRef<Array<{ rows: string[][]; records: ApiRecord[]; nextCursor?: string }>>([])
  const listOperation = endpoints.find(item => item.operationId === config.listOperationId)
  const listPermission = operationPermissions[config.listOperationId]
  const createPermission = config.createOperationId === undefined ? undefined : operationPermissions[config.createOperationId]
  const canRead = listPermission === undefined || context.canAccess([listPermission])
  const canCreate = createPermission !== undefined && context.canAccess([createPermission])
  const statuses = useMemo(() => config.statusIndex === undefined ? [] : [...new Set(serverRows.map(row => row[config.statusIndex!]).filter(Boolean))], [config.statusIndex, serverRows])
  const rows = useMemo(() => serverRows.filter(row => (config.listOperationId === "listMembers" || row.some(cell => cell.toLowerCase().includes(query.toLowerCase()))) && (!status || config.statusIndex === undefined || row[config.statusIndex] === status)), [config.listOperationId, config.statusIndex, query, serverRows, status])

  useEffect(() => {
    const timer = window.setTimeout(() => setDatabaseQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let cancelled = false
    const frame = requestAnimationFrame(() => { pageCache.current = []; setPage(0); setKnownPages(0); void loadPage(0, cancelled) })
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  // The page cache must reset whenever the selected resource/context changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.fields, context.branchId, context.branches, context.organizationId, databaseQuery, listOperation])

  async function loadPage(targetPage: number, cancelled = false) {
    if (!hasRuntimeApi() || !listOperation || !context.organizationId) { setLoading(false); return }
    const cached = pageCache.current[targetPage]
    if (cached) { setServerRows(cached.rows); setServerRecords(cached.records); setPage(targetPage); return }
    const previous = targetPage > 0 ? pageCache.current[targetPage - 1] : undefined
    if (targetPage > 0 && !previous?.nextCursor) return
    setLoading(true); setError("")
    try {
      const url = new URL(listPath(listOperation.path, context.organizationId, context.branchId, config.listOperationId === "listMembers" ? databaseQuery : undefined), "http://local")
      url.searchParams.set("limit", "25")
      if (config.listOperationId === "getBranchDailyReport") {
        const reportRange = lastThirtyBusinessDays()
        url.searchParams.set("from", reportRange.from)
        url.searchParams.set("to", reportRange.to)
      }
      if (previous?.nextCursor) url.searchParams.set("cursor", previous.nextCursor)
      const response = await apiRequest<unknown>(`${url.pathname}${url.search}`)
      const records = toList(response.data)
      const rows = records.map(item => config.fields.map(field => displayValue(item, field, context.branches)))
      if (cancelled) return
      pageCache.current[targetPage] = { rows, records, nextCursor: response.meta?.nextCursor }
      setServerRows(rows); setServerRecords(records); setPage(targetPage); setKnownPages(current => Math.max(current, targetPage + 1))
    } catch (reason) { if (!cancelled) setError(humanError(reason, "تعذر تحميل البيانات. حاول مرة أخرى.")) }
    finally { if (!cancelled) setLoading(false) }
  }

  function exportCsv() {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
    const csv = [config.columns, ...rows].map(row => row.map(escape).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a"); link.href = url; link.download = `go-${config.listOperationId}.csv`; link.click(); URL.revokeObjectURL(url)
  }

  if (!canRead) return <div className="fade-up"><Card><CardContent className="grid min-h-72 place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-700"><ShieldAlert /></span><h1 className="mt-4 text-xl font-black">لا تملك صلاحية هذه المساحة</h1><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">صلاحية العرض مطلوبة قبل تحميل البيانات. اطلب من المدير تعيينها لك على الفرع المناسب.</p></div></CardContent></Card></div>

  return <div className="fade-up">
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Badge variant="outline" className="mb-3 border-primary/30 bg-primary/8 text-amber-700 dark:text-primary">{config.eyebrow}</Badge><h1 className="text-2xl font-black tracking-tight sm:text-3xl">{config.title}</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{config.description}</p></div><div className="flex gap-2"><Button size="lg" variant="outline" onClick={exportCsv} disabled={!rows.length}><Download />تصدير</Button>{canCreate && <Button size="lg" className="brand-shadow" onClick={() => setShowAction(true)}><Plus />{config.action}</Button>}</div></div>
    <section className="grid gap-4 md:grid-cols-3">{config.metrics.map((metric, index) => <Card key={metric.label}><CardContent className="flex items-center gap-4 p-5"><span className={`grid size-11 shrink-0 place-items-center rounded-xl ${index === 0 ? "bg-primary/15 text-amber-600" : index === 1 ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600"}`}>{index === 0 ? <BarChart3 /> : index === 1 ? <Sparkles /> : <SlidersHorizontal />}</span><div><p className="text-[11px] font-semibold text-muted-foreground">{metricLabel(config.listOperationId, index, metric.label)}</p><p className="mt-1 text-xl font-black">{metricValue(config.listOperationId, index, serverRecords)}</p><p className="mt-1 text-[9px] text-muted-foreground">{metricNote(serverRecords.length, metric.note)}</p></div></CardContent></Card>)}</section>
    <Card className="mt-5 overflow-hidden"><div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center"><div className="relative w-full sm:max-w-md"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} className="pr-10" placeholder={config.search} /></div>{statuses.length > 0 && <select aria-label="تصفية حسب الحالة" value={status} onChange={event => setStatus(event.target.value)} className="h-10 rounded-xl border bg-background px-3 text-xs outline-none focus:border-primary"><option value="">كل الحالات</option>{statuses.map(item => <option key={item} value={item}>{statusLabel(item)}</option>)}</select>}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] border-collapse text-right"><thead><tr className="bg-secondary/45">{config.columns.map(heading => <th key={heading} className="whitespace-nowrap px-5 py-3 text-[10px] font-bold text-muted-foreground">{heading}</th>)}<th className="w-10 px-4"><span className="sr-only">عرض التفاصيل</span></th></tr></thead><tbody className="divide-y">{rows.map((row, rowIndex) => <tr key={rowIndex} className="group transition hover:bg-secondary/30">{row.map((cell, columnIndex) => <td key={columnIndex} className="whitespace-nowrap px-5 py-4 text-xs first:font-bold">{columnIndex === config.statusIndex ? <StatusBadge status={cell} /> : cell}</td>)}<td className="px-4"><Button variant="ghost" size="icon-sm" aria-label="عرض التفاصيل" onClick={() => { const sourceIndex = serverRows.indexOf(row); setSelectedRow({ row, record: serverRecords[sourceIndex] ?? {} }) }}><MoreHorizontal /></Button></td></tr>)}</tbody></table>{loading ? <div className="grid place-items-center px-6 py-16"><span className="size-9 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div> : error ? <div className="grid place-items-center px-6 py-16 text-center"><p className="text-sm font-bold text-red-600">تعذر عرض البيانات</p><p className="mt-1 text-xs text-muted-foreground">{error}</p></div> : rows.length === 0 && <div className="grid place-items-center px-6 py-16 text-center"><span className="grid size-12 place-items-center rounded-2xl bg-secondary"><Search className="text-muted-foreground" /></span><p className="mt-4 text-sm font-bold">لا توجد نتائج</p><p className="mt-1 text-xs text-muted-foreground">جرّب تغيير البحث أو إزالة التصفية.</p></div>}</div>
      <div className="flex items-center justify-between border-t p-4"><p className="text-[10px] text-muted-foreground">عرض {rows.length} سجلًا · الصفحة {page + 1}</p><div className="flex items-center gap-1"><Button variant="outline" size="icon-sm" disabled={page === 0 || loading} aria-label="الصفحة السابقة" onClick={() => void loadPage(page - 1)}><ChevronRight /></Button>{Array.from({ length: knownPages }, (_, index) => <Button key={index} variant={index === page ? "default" : "outline"} size="icon-sm" disabled={loading} aria-label={`الصفحة ${index + 1}`} onClick={() => void loadPage(index)}>{index + 1}</Button>)}<Button variant="outline" size="icon-sm" disabled={loading || !pageCache.current[page]?.nextCursor} aria-label="الصفحة التالية" onClick={() => void loadPage(page + 1)}><ChevronLeft /></Button></div></div>
    </Card>
    {showAction && config.createOperationId && canCreate && <ActionDialog operationId={config.createOperationId} organizationId={context.organizationId} branchId={context.branchId} onClose={() => setShowAction(false)} />}
    {selectedRow && <RecordPreview columns={config.columns} row={selectedRow.row} record={selectedRow.record} operationId={config.listOperationId} organizationId={context.organizationId} statusIndex={config.statusIndex} onClose={() => setSelectedRow(undefined)} onChanged={() => { setSelectedRow(undefined); pageCache.current=[]; void loadPage(0) }} />}
  </div>
}

function RecordPreview({ columns, row, record, operationId, organizationId, statusIndex, onClose, onChanged }: { columns: string[]; row: string[]; record: ApiRecord; operationId: string; organizationId: string; statusIndex?: number; onClose: () => void; onChanged: () => void }) {
  const context=useAppContext(); const[busy,setBusy]=useState(false);const[error,setError]=useState("");const status=String(record.status??"");const id=String(record.id??record.subscriptionId??record.reservationId??"");
  const actions:Array<{label:string;permission:string;path:string;body:()=>Record<string,unknown>;danger?:boolean}>=[];
  if(operationId==="listSubscriptions"&&id){if(status==="PENDING_ACTIVATION")actions.push({label:"تفعيل الاشتراك",permission:"subscriptions.activate",path:`/organizations/${organizationId}/subscriptions/${id}/activations`,body:()=>({expectedVersion:Number(record.version??1)})});if(status==="ACTIVE")actions.push({label:"تجميد",permission:"subscriptions.freeze",path:`/organizations/${organizationId}/subscriptions/${id}/freezes`,body:()=>({expectedVersion:Number(record.version??1),requestedDays:Number(window.prompt("عدد أيام التجميد","7")||0),reason:window.prompt("سبب التجميد","طلب العضو")||""})});if(status==="FROZEN")actions.push({label:"استئناف",permission:"subscriptions.freeze",path:`/organizations/${organizationId}/subscriptions/${id}/resumptions`,body:()=>({expectedVersion:Number(record.version??1)})});if(["ACTIVE","FROZEN"].includes(status)){actions.push({label:"تجديد",permission:"subscriptions.renew",path:`/organizations/${organizationId}/subscriptions/${id}/renewals`,body:()=>({expectedVersion:Number(record.version??1)})});actions.push({label:"إلغاء الاشتراك",permission:"subscriptions.cancel",danger:true,path:`/organizations/${organizationId}/subscriptions/${id}/cancellations`,body:()=>({expectedVersion:Number(record.version??1),reason:window.prompt("سبب الإلغاء","طلب العضو")||""})})}}
  if(operationId==="listReservations"&&id&&["PENDING_PAYMENT","CONFIRMED"].includes(status))actions.push({label:"إلغاء الحجز",permission:"bookings.manage",danger:true,path:`/organizations/${organizationId}/reservations/${id}/cancellations`,body:()=>({expectedVersion:Number(record.version??1),reason:window.prompt("سبب إلغاء الحجز","طلب العضو")||""})});
  if(operationId==="listReservations"&&id&&status==="CONFIRMED"){actions.push({label:"إكمال الحجز",permission:"bookings.manage",path:`/organizations/${organizationId}/reservations/${id}/transitions`,body:()=>({expectedVersion:Number(record.version??1),action:"COMPLETE"})});actions.push({label:"عدم حضور",permission:"bookings.manage",danger:true,path:`/organizations/${organizationId}/reservations/${id}/transitions`,body:()=>({expectedVersion:Number(record.version??1),action:"NO_SHOW"})})}
  async function run(action:(typeof actions)[number]){if(action.danger&&!window.confirm(`تأكيد: ${action.label}؟`))return;const body=action.body();if(("reason" in body&&String(body.reason).trim().length<3)||("requestedDays" in body&&Number(body.requestedDays)<1)){setError("أدخل سببًا واضحًا وقيمة صحيحة.");return}setBusy(true);setError("");try{await apiRequest(action.path,{method:"POST",body:JSON.stringify(body)});onChanged()}catch(reason){setError(humanError(reason,"تعذر تنفيذ الإجراء."))}finally{setBusy(false)}}
  const visibleActions=actions.filter(action=>context.canAccess([action.permission]));
  return <div className="fixed inset-0 z-[75] grid place-items-end bg-black/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" aria-labelledby="record-title" className="max-h-[90vh] w-full overflow-y-auto rounded-t-[28px] border bg-card p-5 shadow-2xl sm:max-w-xl sm:rounded-[28px] sm:p-6"><div className="flex items-center"><span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-amber-600"><Eye /></span><div className="mr-3"><p className="text-[10px] text-muted-foreground">ملخص السجل</p><h2 id="record-title" className="font-black">{row[0]}</h2></div><Button className="mr-auto" variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق"><X /></Button></div><dl className="mt-6 grid gap-3 sm:grid-cols-2">{columns.map((label, index) => <div key={label} className="rounded-xl bg-secondary/55 p-4"><dt className="text-[10px] font-bold text-muted-foreground">{label}</dt><dd className="mt-2 text-sm font-bold">{index === statusIndex ? <StatusBadge status={row[index]} /> : row[index]}</dd></div>)}</dl>{error&&<p className="mt-4 rounded-xl bg-destructive/10 p-3 text-xs font-bold text-destructive">{error}</p>}{visibleActions.length>0&&<div className="mt-5 flex flex-wrap gap-2 border-t pt-4">{visibleActions.map(action=><Button key={action.label} variant={action.danger?"destructive":"outline"} disabled={busy} onClick={()=>void run(action)}>{action.label}</Button>)}</div>}<Button className="mt-6 w-full" size="lg" onClick={onClose}>إغلاق</Button></section></div>
}

function listPath(path: string, organizationId: string, branchId: string, search?: string) {
  let resolved = path.replace("{organizationId}", organizationId).replace("{branchId}", branchId).replace(/^\/api\/v1/, "")
  if (branchId && !path.includes("{branchId}")) resolved += `${resolved.includes("?") ? "&" : "?"}branchId=${encodeURIComponent(branchId)}`
  if (search) resolved += `${resolved.includes("?") ? "&" : "?"}search=${encodeURIComponent(search)}`
  return resolved
}

function toList(data: unknown): ApiRecord[] {
  if (Array.isArray(data)) return data.filter((item): item is ApiRecord => Boolean(item) && typeof item === "object")
  if (data && typeof data === "object" && "items" in data && Array.isArray((data as { items?: unknown }).items)) return (data as { items: ApiRecord[] }).items
  if (data && typeof data === "object" && "rows" in data && Array.isArray((data as { rows?: unknown }).rows)) return (data as { rows: ApiRecord[] }).rows
  return []
}

const aliases: Record<string, string[]> = { fullNameAr: ["name", "fullName", "displayName"], memberName: ["name"], packageName: ["commercialSnapshot.packageName"], startsOn: ["termStart", "startsAt"], endsOn: ["termEnd", "endsAt"], occurredAt: ["attemptedAt"], method: ["accessMethod"], buyerName: ["memberName", "name"], itemSummary: ["lines"], orderNumber: ["orderNumber"], reservationNumber: ["reservationNumber"], positionName: ["assignments.0.positionName"], shiftSummary: ["assignments.0.status"], attendanceAt: ["hireDate"], sourceName: ["sourceNameAr", "sourceCode"], interest: ["interestType"], assigneeName: ["assignedToName", "assigneeName"], scope: ["scopeType"] }

function readPath(record: ApiRecord, path: string): unknown { return path.split(".").reduce<unknown>((current, key) => { if (Array.isArray(current)) { const index = Number(key); return Number.isInteger(index) ? current[index] : undefined } return current && typeof current === "object" ? (current as ApiRecord)[key] : undefined }, record) }
function phoneFromContacts(record: ApiRecord): unknown { if (!Array.isArray(record.contacts)) return undefined; const contact = record.contacts.find(item => item && typeof item === "object" && (item as ApiRecord).type === "PHONE") as ApiRecord | undefined; return contact?.value }

function displayValue(record: ApiRecord, field: string, branches: BranchLookup[]) {
  let value = readPath(record, field)
  if ((value === undefined || value === null || value === "") && field === "outstandingMinor" && record.grossMinor !== undefined && record.paidMinor !== undefined) value = String(Number(record.grossMinor) - Number(record.paidMinor))
  if ((value === undefined || value === null || value === "") && field === "phoneE164") value = phoneFromContacts(record)
  if ((value === undefined || value === null || value === "") && field === "branchName") { const branchId = record.branchId ?? record.registrationBranchId ?? record.sellingBranchId ?? record.collectionBranchId ?? readPath(record, "assignments.0.branchId"); const branch = branches.find(candidate => candidate.id === branchId); value = branch?.nameAr ?? branch?.name }
  if (value === undefined || value === null || value === "") for (const alias of aliases[field] ?? []) { const candidate = readPath(record, alias); if (candidate !== undefined && candidate !== null && candidate !== "") { value = candidate; break } }
  if (value === undefined || value === null || value === "") return "—"
  if (field === "requiresMfa" && typeof value === "boolean") return value ? "مفعّلة" : "غير مستخدمة"
  if (typeof value === "boolean") return value ? "نعم" : "لا"
  if (field.endsWith("Minor") && (typeof value === "string" || typeof value === "number")) return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(Number(value) / 100)
  if (/At$|On$/.test(field) && typeof value === "string") { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: field.endsWith("At") ? "short" : undefined, timeZone: "Asia/Riyadh" }).format(date) }
  if (Array.isArray(value)) { if (field === "itemSummary") return value.map(entry => { if (!entry || typeof entry !== "object") return "صنف"; const quote = (entry as ApiRecord).quote; return quote && typeof quote === "object" ? String((quote as ApiRecord).targetName ?? "صنف") : String((entry as ApiRecord).name ?? "صنف") }).join("، "); return `${value.length} عناصر` }
  if (typeof value === "object") return "بيانات مرتبطة"
  if (isUuid(String(value))) return "بيانات مرتبطة"
  return statusLabel(String(value))
}

function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value) }

function recordStatus(record: ApiRecord) {
  return String(record.status ?? record.decision ?? "").toUpperCase()
}

function amountMinor(record: ApiRecord, field: "grossMinor" | "paidMinor") {
  const value = Number(record[field])
  return Number.isFinite(value) ? value : 0
}

function money(value: number) {
  return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(value / 100)
}

function metricValue(operationId: string, index: number, records: ApiRecord[]) {
  const count = records.length
  const withStatus = (...statuses: string[]) => records.filter(record => statuses.includes(recordStatus(record))).length

  if (operationId === "listMembers") return String(index === 0 ? count : index === 1 ? withStatus("ACTIVE") : withStatus("INACTIVE", "SUSPENDED", "EXPIRED"))
  if (operationId === "listSubscriptions") return String(index === 0 ? withStatus("ACTIVE") : index === 1 ? withStatus("FROZEN") : records.filter(record => {
    const end = new Date(String(record.termEnd ?? record.endsAt ?? ""))
    const days = (end.getTime() - Date.now()) / 86_400_000
    return Number.isFinite(days) && days >= 0 && days <= 30
  }).length)
  if (operationId === "listAttendanceAttempts") return String(index === 0 ? count : index === 1 ? withStatus("ACCEPTED") : withStatus("REJECTED"))
  if (operationId === "listInvoices") return index === 0
    ? money(records.reduce((total, record) => total + amountMinor(record, "grossMinor"), 0))
    : index === 1
      ? money(records.reduce((total, record) => total + Math.max(0, amountMinor(record, "grossMinor") - amountMinor(record, "paidMinor")), 0))
      : String(count)
  if (operationId === "listCrmLeads") return index === 0
    ? String(records.filter(record => !["CONVERTED", "LOST", "CLOSED"].includes(recordStatus(record))).length)
    : index === 1
      ? String(records.filter(record => { const due = new Date(String(record.nextFollowUpAt ?? "")); return due.toDateString() === new Date().toDateString() }).length)
      : `${count ? Math.round((withStatus("CONVERTED") / count) * 100) : 0}%`
  if (operationId === "listRestaurantOrders") return index === 0 ? String(count) : index === 1 ? String(withStatus("PREPARING")) : money(records.reduce((total, record) => total + amountMinor(record, "grossMinor"), 0))
  if (operationId === "listEmployees") return String(index === 0 ? count : index === 1 ? withStatus("ACTIVE") : records.filter(record => record.hireDate).length)
  if (operationId === "getBranchDailyReport") return index === 0
    ? String(count)
    : money(records.reduce((total, record) => total + Number(record[index === 1 ? "invoicedGrossMinor" : "collectedMinor"] ?? 0), 0))
  return String(index === 0 ? count : index === 1 ? withStatus("ACTIVE", "ACCEPTED", "PAID") : withStatus("INACTIVE", "REJECTED", "CANCELLED"))
}

function metricLabel(operationId: string, index: number, fallback: string) {
  const labels: Record<string, string[]> = {
    listMembers: ["أعضاء الصفحة", "أعضاء نشطون", "أعضاء غير نشطين"],
    listAttendanceAttempts: ["محاولات الصفحة", "دخول مسموح", "محاولات مرفوضة"],
    listInvoices: ["قيمة الفواتير", "الرصيد المستحق", "فواتير الصفحة"],
    listEmployees: ["فريق الصفحة", "حسابات نشطة", "موظفون بتاريخ توظيف"],
  }
  return labels[operationId]?.[index] ?? fallback
}

function lastThirtyBusinessDays() {
  const today = new Date()
  const to = businessDate(today)
  const fromDate = new Date(today.getTime() - 29 * 86_400_000)
  return { from: businessDate(fromDate), to }
}

function businessDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value)
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

function metricNote(recordCount: number, fallback: string) {
  return recordCount ? "محسوب من سجلات الصفحة الحالية" : fallback
}

function statusLabel(value: string) { return ({ ACTIVE: "نشط", INACTIVE: "غير نشط", PENDING: "قيد المراجعة", PENDING_ACTIVATION: "بانتظار التفعيل", FROZEN: "مجمّد", EXPIRED: "منتهي", CANCELLED: "ملغي", ACCEPTED: "مسموح", REJECTED: "مرفوض", PAID: "مدفوع", PARTIALLY_PAID: "مدفوع جزئيًا", DRAFT: "مسودة", SCHEDULED: "مجدول", COMPLETED: "مكتمل", NEW: "جديد", CONTACTED: "تم التواصل", QUALIFIED: "مؤهل", PREPARING: "قيد التحضير", READY: "جاهز" } as Record<string, string>)[value] ?? value }
