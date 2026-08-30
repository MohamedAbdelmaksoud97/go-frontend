"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AlertTriangle, BadgeDollarSign, BarChart3, CalendarPlus, ChevronLeft, ChevronRight, CircleX, ClipboardCheck, Download, Eye, EyeOff, LockKeyhole, MoreHorizontal, Play, Plus, RefreshCw, Search, ShieldAlert, SlidersHorizontal, Snowflake, Sparkles, UserRoundCheck, UserRoundX, X } from "lucide-react"
import type { SectionConfig } from "@/lib/sections"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DateTimeInput } from "@/components/date-time-input"
import { useAppContext } from "@/components/app-context"
import { endpoints } from "@/lib/endpoint-catalog"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { ActionDialog } from "@/components/action-dialog"
import { operationPermissions } from "@/lib/permissions"
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy"
import { useToast } from "@/components/toast-provider"
import { pendingFreezeSchedule, subscriptionFreezePolicy } from "@/lib/subscription-freeze-policy"

type BranchLookup = { id: string; nameAr?: string; name?: string }
type ApiRecord = Record<string, unknown>
type RecordActionField = {
  name: string
  label: string
  type: "text" | "tel" | "email" | "number" | "textarea" | "password" | "date" | "datetime-local" | "time" | "select"
  options?: Array<{ value: string; label: string }>
  initial?: string
  placeholder?: string
  hint?: string
  required?: boolean
  min?: number
  max?: number
}
type RecordAction = {
  label: string
  permission: string
  path: string
  body: (values: Record<string, string>) => Record<string, unknown>
  description?: string
  confirmLabel?: string
  danger?: boolean
  method?: "POST" | "PATCH"
  fields?: RecordActionField[]
  requiresConfirmation?: boolean
  responseMessage?: (data: ApiRecord) => string
  disabled?: boolean
  disabledReason?: string
}

export function ResourcePage({ config, openCreate = false, initialSearch = "" }: { config: SectionConfig; openCreate?: boolean; initialSearch?: string }) {
  const context = useAppContext()
  const [query, setQuery] = useState(initialSearch)
  const [databaseQuery, setDatabaseQuery] = useState(initialSearch.trim())
  const [status, setStatus] = useState("")
  const filterBranchId = context.branchId
  const [showAction, setShowAction] = useState(openCreate)
  const [selectedRow, setSelectedRow] = useState<{ row: string[]; record: ApiRecord }>()
  const [quickAction, setQuickAction] = useState<{ operationId: string; branchId: string; initialValues: Record<string, string>; lockedReferenceLabels?: Record<string, string> }>()
  const [disciplinaryMember, setDisciplinaryMember] = useState<ApiRecord>()
  const [subscriptionFreezeRecord, setSubscriptionFreezeRecord] = useState<ApiRecord>()
  const [subscriptionPolicyAction, setSubscriptionPolicyAction] = useState<{ record: ApiRecord; action: "RENEW" | "CANCEL" }>()
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
    && (config.createOperationId !== "createEmployee" || context.canAccess(["workforce.accounts.manage"]))
  const serverFiltered = config.listOperationId === "listMembers" || config.listOperationId === "listSubscriptions" || config.listOperationId === "listEmployees"
  const statuses = useMemo(() => statusOptions(config.listOperationId, serverRows, config.statusIndex), [config.listOperationId, config.statusIndex, serverRows])
  const rows = useMemo(() => serverRows.filter(row => (serverFiltered || row.some(cell => cell.toLowerCase().includes(query.toLowerCase()))) && (serverFiltered || !status || config.statusIndex === undefined || row[config.statusIndex] === status)), [config.statusIndex, query, serverFiltered, serverRows, status])

  useEffect(() => {
    const timer = window.setTimeout(() => setDatabaseQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let cancelled = false
    const frame = requestAnimationFrame(() => { pageCache.current = []; setServerRows([]); setServerRecords([]); setSelectedRow(undefined); setQuickAction(undefined); setPage(0); setKnownPages(0); void loadPage(0, cancelled) })
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  // The page cache must reset whenever the selected resource/context changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.fields, context.branchId, context.branches, context.organizationId, databaseQuery, filterBranchId, listOperation, status])

  async function loadPage(targetPage: number, cancelled = false) {
    if (!hasRuntimeApi() || !listOperation || !context.organizationId) { setLoading(false); return }
    if (serverFiltered && !filterBranchId) {
      setServerRows([]); setServerRecords([]); setError("اختر فرع العمل أولًا لعرض بياناته."); setLoading(false); return
    }
    const cached = pageCache.current[targetPage]
    if (cached) { setServerRows(cached.rows); setServerRecords(cached.records); setPage(targetPage); return }
    const previous = targetPage > 0 ? pageCache.current[targetPage - 1] : undefined
    if (targetPage > 0 && !previous?.nextCursor) return
    setLoading(true); setError("")
    try {
      const url = new URL(listPath(listOperation.path, context.organizationId, context.branchId, !serverFiltered), "http://local")
      url.searchParams.set("limit", "25")
      if (serverFiltered) {
        if (databaseQuery) url.searchParams.set("search", databaseQuery)
        if (status) url.searchParams.set("status", status)
        if (filterBranchId) url.searchParams.set("branchId", filterBranchId)
      }
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
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] border-collapse text-right"><thead><tr className="bg-secondary/45">{config.columns.map(heading => <th key={heading} className="whitespace-nowrap px-5 py-3 text-[10px] font-bold text-muted-foreground">{heading}</th>)}<th className="sticky left-0 z-20 min-w-[160px] border-r bg-secondary px-3 py-3 text-[10px] font-bold text-muted-foreground shadow-[10px_0_18px_-18px_rgba(0,0,0,0.8)]">الإجراءات السريعة</th></tr></thead><tbody className="divide-y">{rows.map((row, rowIndex) => { const sourceIndex = serverRows.indexOf(row); const record = serverRecords[sourceIndex] ?? {}; const memberId = String(record.id ?? ""); const recordBranchId = String(record.registrationBranchId ?? record.branchId ?? ""); const filteredBranchId = context.branches.some(branch => branch.id === filterBranchId) ? filterBranchId : ""; const actionBranchId = context.branchId || filteredBranchId || (context.branches.length === 1 ? context.branches[0]?.id ?? "" : "") || recordBranchId; return <tr key={rowIndex} className="group transition hover:bg-secondary/30">{row.map((cell, columnIndex) => <td key={columnIndex} className="whitespace-nowrap px-5 py-4 text-xs first:font-bold">{columnIndex === config.statusIndex ? <StatusBadge status={cell} /> : config.listOperationId === "listMembers" && columnIndex === 0 && memberId ? <Link href={`/members/${memberId}`} className="text-foreground underline-offset-4 transition hover:text-primary hover:underline" aria-label={`فتح ملف العضو ${cell}`}>{cell}</Link> : config.listOperationId === "listEmployees" && columnIndex === 0 && memberId ? <Link href={`/employees/${memberId}`} className="text-foreground underline-offset-4 transition hover:text-primary hover:underline" aria-label={`فتح ملف الموظف ${cell}`}>{cell}</Link> : cell}</td>)}<td className="sticky left-0 z-10 min-w-[160px] border-r bg-card px-3 py-4 shadow-[10px_0_18px_-18px_rgba(0,0,0,0.8)] transition-colors group-hover:bg-secondary">{config.listOperationId === "listMembers" && memberId ? <MemberQuickActions record={record} canAccess={context.canAccess} onWorkflow={(operationId, initialValues, lockedReferenceLabels) => { if (!context.branchId && actionBranchId) context.setBranchId(actionBranchId); setQuickAction({ operationId, branchId: actionBranchId, initialValues, lockedReferenceLabels }) }} onDiscipline={() => setDisciplinaryMember(record)} onDetails={() => setSelectedRow({ row, record })} /> : config.listOperationId === "listSubscriptions" ? <SubscriptionQuickActions record={record} canAccess={context.canAccess} onFreeze={() => setSubscriptionFreezeRecord(record)} onRenew={() => setSubscriptionPolicyAction({ record, action: "RENEW" })} onCancel={() => setSubscriptionPolicyAction({ record, action: "CANCEL" })} onDetails={() => setSelectedRow({ row, record })} /> : <Button variant="ghost" size="icon-sm" aria-label="عرض التفاصيل" onClick={() => setSelectedRow({ row, record })}><MoreHorizontal /></Button>}</td></tr> })}</tbody></table>{loading ? <div className="grid place-items-center px-6 py-16"><span className="size-9 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div> : error ? <div className="grid place-items-center px-6 py-16 text-center"><p className="text-sm font-bold text-red-600">تعذر عرض البيانات</p><p className="mt-1 text-xs text-muted-foreground">{error}</p></div> : rows.length === 0 && <div className="grid place-items-center px-6 py-16 text-center"><span className="grid size-12 place-items-center rounded-2xl bg-secondary"><Search className="text-muted-foreground" /></span><p className="mt-4 text-sm font-bold">لا توجد نتائج</p><p className="mt-1 text-xs text-muted-foreground">جرّب تغيير البحث أو إزالة التصفية.</p></div>}</div>
      <div className="flex items-center justify-between border-t p-4"><p className="text-[10px] text-muted-foreground">عرض {rows.length} سجلًا · الصفحة {page + 1}</p><div className="flex items-center gap-1"><Button variant="outline" size="icon-sm" disabled={page === 0 || loading} aria-label="الصفحة السابقة" onClick={() => void loadPage(page - 1)}><ChevronRight /></Button>{Array.from({ length: knownPages }, (_, index) => <Button key={index} variant={index === page ? "default" : "outline"} size="icon-sm" disabled={loading} aria-label={`الصفحة ${index + 1}`} onClick={() => void loadPage(index)}>{index + 1}</Button>)}<Button variant="outline" size="icon-sm" disabled={loading || !pageCache.current[page]?.nextCursor} aria-label="الصفحة التالية" onClick={() => void loadPage(page + 1)}><ChevronLeft /></Button></div></div>
    </Card>
    {showAction && config.createOperationId && canCreate && <ActionDialog operationId={config.createOperationId} organizationId={context.organizationId} branchId={context.branchId} onClose={() => setShowAction(false)} onSaved={() => { pageCache.current = []; void loadPage(0) }} />}
    {quickAction && <ActionDialog operationId={quickAction.operationId} organizationId={context.organizationId} branchId={quickAction.branchId} initialValues={quickAction.initialValues} lockedReferenceLabels={quickAction.lockedReferenceLabels} onClose={() => setQuickAction(undefined)} onSaved={() => { setQuickAction(undefined); pageCache.current = []; void loadPage(0) }} />}
    {disciplinaryMember && <MemberDisciplinaryDialog organizationId={context.organizationId} record={disciplinaryMember} onClose={() => setDisciplinaryMember(undefined)} onSaved={() => { setDisciplinaryMember(undefined); pageCache.current = []; void loadPage(0) }} />}
    {subscriptionFreezeRecord && <SubscriptionFreezeDialog organizationId={context.organizationId} record={subscriptionFreezeRecord} onClose={() => setSubscriptionFreezeRecord(undefined)} onSaved={() => { setSubscriptionFreezeRecord(undefined); pageCache.current = []; void loadPage(0) }} />}
    {subscriptionPolicyAction && <SubscriptionPolicyActionDialog organizationId={context.organizationId} record={subscriptionPolicyAction.record} action={subscriptionPolicyAction.action} onClose={() => setSubscriptionPolicyAction(undefined)} onSaved={() => { setSubscriptionPolicyAction(undefined); pageCache.current = []; void loadPage(0) }} />}
    {selectedRow && <RecordPreview columns={config.columns} row={selectedRow.row} record={selectedRow.record} operationId={config.listOperationId} organizationId={context.organizationId} statusIndex={config.statusIndex} onClose={() => setSelectedRow(undefined)} onChanged={() => { setSelectedRow(undefined); pageCache.current=[]; void loadPage(0) }} />}
  </div>
}

function MemberQuickActions({ record, canAccess, onWorkflow, onDiscipline, onDetails }: { record: ApiRecord; canAccess: (permissions: string[]) => boolean; onWorkflow: (operationId: string, initialValues: Record<string, string>, lockedReferenceLabels?: Record<string, string>) => void; onDiscipline: () => void; onDetails: () => void }) {
  const memberId = String(record.id ?? "")
  const memberName = String(record.name ?? record.fullNameAr ?? record.memberName ?? "العضو")
  const memberNumber = String(record.memberNumber ?? record.legacyMemberNumber ?? "")
  const memberLabel = [memberName, memberNumber].filter(Boolean).join(" — ")
  const blocked = Boolean(record.isBlocked)
  return <div className="flex items-center justify-center gap-1" aria-label="الإجراءات السريعة للعضو">
    {canAccess(["sales.checkout"]) && <Button variant="ghost" size="icon-sm" title="شراء باقة وإصدار فاتورة" aria-label={`شراء باقة وإصدار فاتورة للعضو ${memberName}`} onClick={() => onWorkflow("createSubscription", { memberId }, { memberId: memberLabel })}><BadgeDollarSign /></Button>}
    {canAccess(["bookings.create"]) && <Button variant="ghost" size="icon-sm" title="إنشاء حجز" aria-label="إنشاء حجز" onClick={() => onWorkflow("createManualReservation", { customerType: "MEMBER", memberId })}><CalendarPlus /></Button>}
    {canAccess(["attendance.check-in"]) && <Button variant="ghost" size="icon-sm" title="تسجيل دخول العضو" aria-label="تسجيل دخول العضو" onClick={() => onWorkflow("recordManualAttendance", { memberId })}><ClipboardCheck /></Button>}
    {canAccess(["members.block"]) && <Button variant="ghost" size="icon-sm" className={blocked ? "text-emerald-600" : "text-red-600"} title={blocked ? "رفع الحظر" : "حظر العضو"} aria-label={blocked ? "رفع الحظر عن العضو" : "حظر العضو"} onClick={onDiscipline}>{blocked ? <UserRoundCheck /> : <UserRoundX />}</Button>}
    <Link href={`/members/${memberId}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} title="فتح ملف العضو الكامل" aria-label="فتح ملف العضو الكامل"><Eye /></Link>
    <Button variant="ghost" size="icon-sm" title="خيارات العضو" aria-label="خيارات العضو" onClick={onDetails}><MoreHorizontal /></Button>
  </div>
}

function SubscriptionQuickActions({
  record,
  canAccess,
  onFreeze,
  onRenew,
  onCancel,
  onDetails,
}: {
  record: ApiRecord
  canAccess: (permissions: string[]) => boolean
  onFreeze: () => void
  onRenew: () => void
  onCancel: () => void
  onDetails: () => void
}) {
  const status = String(record.status ?? "").toUpperCase()
  const canFreeze = canAccess(["subscriptions.freeze"])
  const freezeWindow = subscriptionFreezePolicy(record)
  const renewal = capturedPolicyConfiguration(record, "RENEWAL")
  const cancellation = capturedPolicyConfiguration(record, "CANCELLATION")
  const renewalWindow = renewalEligibility(record, renewal)
  const canRenew = canAccess(["subscriptions.renew"]) && canAccess(["sales.checkout"]) && ["ACTIVE", "EXPIRED"].includes(status)
  const canCancel = canAccess(["subscriptions.cancel"]) && !["EXPIRED", "CANCELLED"].includes(status) && !record.cancellationRequest

  return <div className="flex items-center justify-center gap-1" aria-label="الإجراءات السريعة للاشتراك">
    {canFreeze && ["ACTIVE", "ACTIVE_PROVISIONAL"].includes(status) && <Button variant="ghost" size="icon-sm" className="text-blue-600" disabled={!freezeWindow.allowed && !freezeWindow.pendingSchedule} title={freezeWindow.message} aria-label={freezeWindow.pendingSchedule ? "إدارة التجميد المجدول" : "تجميد هذا الاشتراك"} onClick={onFreeze}><Snowflake /></Button>}
    {canFreeze && status === "FROZEN" && <Button variant="ghost" size="icon-sm" className="text-emerald-600" title="استئناف هذا الاشتراك" aria-label="استئناف هذا الاشتراك" onClick={onFreeze}><Play /></Button>}
    {canRenew && <Button variant="ghost" size="icon-sm" className="text-emerald-600" disabled={!renewalWindow.allowed} title={renewalWindow.message} aria-label="تجديد هذا الاشتراك وفق سياسة الباقة" onClick={onRenew}><RefreshCw /></Button>}
    {canCancel && <Button variant="ghost" size="icon-sm" className="text-red-600" disabled={!cancellation} title={cancellation ? "إلغاء هذا الاشتراك وفق سياسة الباقة" : "لا توجد سياسة إلغاء محفوظة مع الاشتراك"} aria-label="إلغاء هذا الاشتراك وفق سياسة الباقة" onClick={onCancel}><CircleX /></Button>}
    <Button variant="ghost" size="icon-sm" title="عرض تفاصيل الاشتراك" aria-label="عرض تفاصيل الاشتراك" onClick={onDetails}><MoreHorizontal /></Button>
  </div>
}

function capturedPolicyConfiguration(record: ApiRecord, policyType: "FREEZE" | "CANCELLATION" | "RENEWAL") {
  const snapshot = record.policySnapshot
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return undefined
  const policies = (snapshot as ApiRecord).policies
  if (!Array.isArray(policies)) return undefined
  const policy = policies.find(item => item && typeof item === "object" && !Array.isArray(item) && String((item as ApiRecord).policyType ?? "").toUpperCase() === policyType)
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return undefined
  const configuration = (policy as ApiRecord).configuration
  return configuration && typeof configuration === "object" && !Array.isArray(configuration) ? configuration as ApiRecord : undefined
}

function renewalEligibility(record: ApiRecord, policy?: ApiRecord) {
  if (record.cancellationRequest) return { allowed: false, message: "لا يمكن التجديد مع وجود طلب إلغاء قائم." }
  if (pendingFreezeSchedule(record)) return { allowed: false, message: "ألغِ التجميد المجدول أو انتظر تنفيذه قبل التجديد حتى يُحسب موعد البداية بدقة." }
  if (!policy) return { allowed: false, message: "لا توجد سياسة تجديد محفوظة مع هذا الاشتراك." }
  const termEnd = new Date(String(record.termEnd ?? ""))
  if (Number.isNaN(termEnd.getTime())) return { allowed: false, message: "تعذر قراءة تاريخ نهاية الاشتراك." }
  const graceDays = Number(policy.graceDays)
  if (!Number.isInteger(graceDays) || graceDays < 0) return { allowed: false, message: "إعدادات سياسة التجديد المحفوظة غير صالحة." }
  const latest = new Date(termEnd.getTime() + graceDays * 86_400_000)
  const now = new Date()
  if (now > latest) return { allowed: false, message: `انتهت مهلة التجديد في ${latest.toLocaleDateString("ar-SA")} وفق سياسة الباقة.` }
  return { allowed: true, message: now < termEnd
    ? "تجديد مبكر مع ترحيل كامل المدة المتبقية تلقائيًا."
    : `تجديد الاشتراك وفق سياسة الباقة (مهلة ما بعد الانتهاء: ${graceDays} يوم).` }
}

function SubscriptionFreezeDialog({
  organizationId,
  record,
  onClose,
  onSaved,
}: {
  organizationId: string
  record: ApiRecord
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const frozen = String(record.status ?? "").toUpperCase() === "FROZEN"
  const pendingSchedule = pendingFreezeSchedule(record)
  const subscriptionId = String(record.id ?? record.subscriptionId ?? "")
  const subscriptionName = String(record.packageNameAr ?? record.packageName ?? record.subscriptionNumber ?? "الاشتراك")
  const subscriptionNumber = String(record.subscriptionNumber ?? "")
  const [scheduleMode, setScheduleMode] = useState<"NOW" | "LATER">("NOW")
  const [scheduledStartAt, setScheduledStartAt] = useState(localDateTime(new Date(new Date().getTime() + 7 * 86_400_000)))
  const policyAt = scheduleMode === "LATER" ? new Date(scheduledStartAt) : new Date()
  const freezePolicy = subscriptionFreezePolicy({ ...record, freezeSchedules: pendingSchedule ? [] : record.freezeSchedules }, policyAt)
  const [requestedDays, setRequestedDays] = useState(String(freezePolicy.recommendedDays))
  const [reason, setReason] = useState(pendingSchedule ? "طلب العضو إلغاء الجدولة" : "طلب العضو")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const days = Number(requestedDays)
    if (!subscriptionId) {
      setError("تعذر تحديد الاشتراك. حدّث الصفحة وحاول مجددًا.")
      return
    }
    if (pendingSchedule && reason.trim().length < 3) {
      setError("اكتب سببًا واضحًا لإلغاء الجدولة.")
      return
    }
    if (!frozen && !pendingSchedule && !freezePolicy.allowed) {
      setError(freezePolicy.message)
      return
    }
    if (!frozen && !pendingSchedule && scheduleMode === "LATER" && (!Number.isFinite(policyAt.getTime()) || policyAt <= new Date())) {
      setError("اختر موعدًا صحيحًا في المستقبل لبدء التجميد.")
      return
    }
    if (!frozen && !pendingSchedule && scheduleMode === "LATER" && policyAt >= new Date(String(record.termEnd ?? ""))) {
      setError("يجب أن يبدأ التجميد قبل نهاية مدة الاشتراك.")
      return
    }
    if (!frozen && !pendingSchedule && (!Number.isInteger(days) || days < 1)) {
      setError("أدخل عدد أيام صحيحًا يبدأ من يوم واحد.")
      return
    }
    if (!frozen && !pendingSchedule && days > freezePolicy.maxDaysPerFreeze) {
      setError(`الحد الأقصى المسموح في هذه السياسة هو ${freezePolicy.maxDaysPerFreeze} يوم.`)
      return
    }
    if (!frozen && !pendingSchedule && reason.trim().length < 3) {
      setError("اكتب سببًا واضحًا لطلب التجميد.")
      return
    }
    setSaving(true)
    setError("")
    try {
      if (pendingSchedule) {
        await apiRequest(`/organizations/${organizationId}/subscriptions/${subscriptionId}/freeze-schedules/${String(pendingSchedule.id)}/cancellations`, {
          method: "POST",
          body: JSON.stringify({ expectedVersion: Number(record.version ?? 1), reason: reason.trim() }),
        })
        toast.success("تم إلغاء موعد التجميد، ولن يتغير وضع الاشتراك في الموعد السابق.")
        onSaved()
        return
      }
      const suffix = frozen ? "resumptions" : "freezes"
      await apiRequest(`/organizations/${organizationId}/subscriptions/${subscriptionId}/${suffix}`, {
        method: "POST",
        body: JSON.stringify(frozen
          ? { expectedVersion: Number(record.version ?? 1) }
          : { expectedVersion: Number(record.version ?? 1), requestedDays: days, reason: reason.trim(), ...(scheduleMode === "LATER" ? { scheduledStartAt: policyAt.toISOString() } : {}) }),
      })
      toast.success(frozen ? "تم استئناف هذا الاشتراك." : scheduleMode === "LATER" ? "تمت جدولة التجميد وسيبدأ تلقائيًا في الموعد المحدد." : "تم تجميد هذا الاشتراك وفق سياسة الباقة.")
      onSaved()
    } catch (cause) {
      setError(humanError(cause, pendingSchedule ? "تعذر إلغاء موعد التجميد." : frozen ? "تعذر استئناف هذا الاشتراك." : "تعذر حفظ طلب التجميد وفق سياسة الباقة."))
    } finally {
      setSaving(false)
    }
  }

  return <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="subscription-freeze-title" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <form onSubmit={submit} className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-[28px] border bg-card shadow-2xl" dir="rtl">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
      <div className="flex items-start gap-4">
        <span className={`grid size-12 place-items-center rounded-2xl ${frozen ? "bg-emerald-500/10 text-emerald-600" : "bg-blue-500/10 text-blue-600"}`}>{frozen ? <Play /> : <Snowflake />}</span>
        <div>
          <h2 id="subscription-freeze-title" className="text-xl font-black">{pendingSchedule ? "إدارة التجميد المجدول" : frozen ? "استئناف الاشتراك" : "تجميد اشتراك محدد"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subscriptionName}{subscriptionNumber ? ` · ${subscriptionNumber}` : ""}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="mr-auto" disabled={saving} onClick={onClose} aria-label="إغلاق"><X /></Button>
      </div>

      <p className="mt-5 rounded-2xl bg-secondary/60 p-4 text-xs leading-6">{pendingSchedule
        ? "هذا الاشتراك لديه تجميد مجدول. يمكنك مراجعة الموعد وإلغاء الجدولة قبل حلول وقت البدء."
        : frozen
        ? "سيتم استئناف هذا الاشتراك فقط، دون التأثير على أي اشتراكات أخرى يملكها العضو."
        : "اختر بدء التجميد الآن أو جدولته لموعد لاحق. سيطبق النظام سياسة الباقة تلقائيًا عند الحفظ وعند حلول الموعد."}</p>

      {pendingSchedule ? <>
        <div className="mt-5 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 text-sm">
          <p className="font-black">موعد بدء التجميد</p>
          <p className="mt-2 text-muted-foreground">{new Date(String(pendingSchedule.scheduledStartAt)).toLocaleString("ar-SA")} · لمدة {String(pendingSchedule.requestedDays)} يوم</p>
          <p className="mt-1 text-muted-foreground">السبب: {String(pendingSchedule.reason ?? "غير مسجل")}</p>
        </div>
        <label className="mt-4 block text-xs font-bold">سبب إلغاء الجدولة<span className="mr-1 text-red-500">*</span><textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} className="mt-2 w-full resize-none rounded-xl border bg-background p-3 text-sm outline-none focus:border-primary" /></label>
      </> : !frozen && <>
        <fieldset className="mt-5"><legend className="text-xs font-bold">موعد بدء التجميد</legend><div className="mt-2 grid grid-cols-2 gap-2">
          <Button type="button" variant={scheduleMode === "NOW" ? "default" : "outline"} onClick={() => setScheduleMode("NOW")}>ابدأ الآن</Button>
          <Button type="button" variant={scheduleMode === "LATER" ? "default" : "outline"} onClick={() => setScheduleMode("LATER")}>جدولة لموعد لاحق</Button>
        </div></fieldset>
        {scheduleMode === "LATER" && <label className="mt-4 block text-xs font-bold">تاريخ ووقت البدء<span className="mr-1 text-red-500">*</span><DateTimeInput type="datetime-local" min={localDateTime(new Date(new Date().getTime() + 60_000))} max={localDateTime(new Date(String(record.termEnd ?? "")))} value={scheduledStartAt} onChange={event => setScheduledStartAt(event.target.value)} className="mt-2" /></label>}
        <div className={`mt-5 rounded-2xl border p-4 text-xs ${freezePolicy.allowed ? "border-blue-500/25 bg-blue-500/5" : "border-amber-500/30 bg-amber-500/8"}`}>
          <p className="font-black">حدود سياسة التجميد المحفوظة مع الاشتراك</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <PolicyMetric label="أقصى مدة" value={`${freezePolicy.maxDaysPerFreeze} يوم`} />
            <PolicyMetric label="المرات المتبقية" value={`${freezePolicy.remainingFreezes} من ${freezePolicy.maxFreezesPerTerm}`} />
            <PolicyMetric label="الحد الأدنى للنشاط" value={`${freezePolicy.minimumActiveDaysBeforeFreeze} يوم`} />
            <PolicyMetric label="أيام النشاط المحسوبة" value={`${freezePolicy.activeDays} يوم`} />
          </div>
          <p className="mt-3 leading-6 text-muted-foreground">{freezePolicy.message}</p>
        </div>
        <label className="mt-5 block text-xs font-bold">عدد أيام التجميد<span className="mr-1 text-red-500">*</span><Input type="number" min={1} max={freezePolicy.maxDaysPerFreeze || 1} value={requestedDays} onChange={event => setRequestedDays(event.target.value)} className="mt-2" inputMode="numeric" /></label>
        <label className="mt-4 block text-xs font-bold">سبب التجميد<span className="mr-1 text-red-500">*</span><textarea value={reason} onChange={event => setReason(event.target.value)} rows={4} placeholder="مثال: طلب العضو بسبب السفر" className="mt-2 w-full resize-none rounded-xl border bg-background p-3 text-sm outline-none focus:border-primary" /></label>
      </>}

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs font-semibold text-red-600">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-2 border-t bg-card px-6 py-4 shadow-[0_-12px_24px_-24px_rgba(0,0,0,0.8)]">
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>رجوع</Button>
        <Button type="submit" className="mr-auto" variant={pendingSchedule ? "destructive" : "default"} disabled={saving || Boolean(pendingSchedule && reason.trim().length < 3) || (!pendingSchedule && !frozen && (!freezePolicy.allowed || Number(requestedDays) > freezePolicy.maxDaysPerFreeze))}>{saving ? "جارٍ الحفظ..." : pendingSchedule ? "إلغاء موعد التجميد" : frozen ? "استئناف الاشتراك" : scheduleMode === "LATER" ? "حفظ الجدولة" : "تأكيد التجميد الآن"}</Button>
      </div>
    </form>
  </div>
}

function PolicyMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-background/70 p-2"><span className="block text-[10px] text-muted-foreground">{label}</span><strong className="mt-1 block">{value}</strong></div>
}

function SubscriptionPolicyActionDialog({
  organizationId,
  record,
  action,
  onClose,
  onSaved,
}: {
  organizationId: string
  record: ApiRecord
  action: "RENEW" | "CANCEL"
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const subscriptionId = String(record.id ?? record.subscriptionId ?? "")
  const memberId = String(record.memberId ?? "")
  const packageId = String(record.packageId ?? "")
  const sellingBranchId = String(record.sellingBranchId ?? "")
  const subscriptionName = String(record.packageNameAr ?? record.packageName ?? record.subscriptionNumber ?? "الاشتراك")
  const subscriptionNumber = String(record.subscriptionNumber ?? "")
  const renewal = capturedPolicyConfiguration(record, "RENEWAL")
  const cancellation = capturedPolicyConfiguration(record, "CANCELLATION")
  const rollover = (() => {
    const now = new Date()
    const termEnd = new Date(String(record.termEnd ?? ""))
    const startAt = !Number.isNaN(termEnd.getTime()) && termEnd > now ? termEnd : now
    return {
      startAt,
      remainingDays: Number.isNaN(termEnd.getTime()) ? 0 : Math.max(0, Math.ceil((termEnd.getTime() - now.getTime()) / 86_400_000)),
    }
  })()
  const [promoCode, setPromoCode] = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const renewing = action === "RENEW"

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!subscriptionId) { setError("تعذر تحديد الاشتراك. حدّث الصفحة وحاول مجددًا."); return }
    if (renewing && (!memberId || !packageId || !sellingBranchId)) { setError("بيانات العضو أو الباقة أو فرع البيع غير مكتملة. حدّث الصفحة وحاول مجددًا."); return }
    if (renewing && !renewal) { setError("لا توجد سياسة تجديد محفوظة مع هذا الاشتراك."); return }
    if (!renewing && !cancellation) { setError("لا توجد سياسة إلغاء محفوظة مع هذا الاشتراك."); return }
    if (!renewing && reason.trim().length < 3) { setError("اكتب سببًا واضحًا للإلغاء من 3 أحرف على الأقل."); return }
    setSaving(true)
    setError("")
    try {
      const response = await apiRequest<ApiRecord>(renewing
        ? `/organizations/${organizationId}/orders`
        : `/organizations/${organizationId}/subscriptions/${subscriptionId}/cancellations`, {
        method: "POST",
        body: JSON.stringify(renewing ? {
          sellingBranchId,
          memberId,
          memberSegment: "OTHER",
          lines: [{ type: "MEMBERSHIP", targetId: packageId, quantity: 1, ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {}), renewal: { subscriptionId, expectedVersion: Number(record.version ?? 1) } }],
        } : { expectedVersion: Number(record.version ?? 1), reason: reason.trim() }),
      })
      toast.success(renewing
        ? `تم إنشاء طلب التجديد والفاتورة ${String(response.data.invoiceNumber ?? "الجديدة")}. يبدأ الاشتراك المجدّد بعد السداد وانتهاء الفترة الحالية.`
        : "تم تسجيل طلب الإلغاء وتطبيق سياسة الباقة المحفوظة مع الاشتراك.")
      onSaved()
    } catch (cause) {
      setError(humanError(cause, renewing ? "تعذر تجديد هذا الاشتراك وفق سياسة الباقة." : "تعذر إلغاء هذا الاشتراك وفق سياسة الباقة."))
    } finally {
      setSaving(false)
    }
  }

  const cancellationMode = String(cancellation?.cancellationMode ?? "END_OF_TERM")
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <form onSubmit={submit} className="w-full max-w-lg rounded-[28px] border bg-card p-6 shadow-2xl" dir="rtl">
      <div className="flex items-start gap-4">
        <span className={`grid size-12 place-items-center rounded-2xl ${renewing ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>{renewing ? <RefreshCw /> : <CircleX />}</span>
        <div><h2 className="text-xl font-black">{renewing ? "تجديد الاشتراك" : "إلغاء الاشتراك"}</h2><p className="mt-1 text-sm text-muted-foreground">{subscriptionName}{subscriptionNumber ? ` · ${subscriptionNumber}` : ""}</p></div>
        <Button type="button" variant="ghost" size="icon" className="mr-auto" disabled={saving} onClick={onClose} aria-label="إغلاق"><X /></Button>
      </div>

      {renewing ? <>
        <div className="mt-5 rounded-2xl bg-emerald-500/8 p-4 text-xs leading-6"><p className="font-black">تجديد مالي كامل دون فقد المدة المتبقية</p><p className="mt-1 text-muted-foreground">{rollover.remainingDays > 0 ? `سيحتفظ العضو بنحو ${rollover.remainingDays} يوم متبقٍ،` : "انتهت المدة الحالية،"} وتبدأ فترة التجديد تلقائيًا في <strong>{rollover.startAt.toLocaleString("ar-SA")}</strong>. سيصدر طلب بيع وفاتورة بالأسعار والسياسات الحالية، ولن يصبح التجديد نافذًا قبل سداد الفاتورة.</p><p className="mt-1 text-muted-foreground">مهلة التجديد بعد الانتهاء وفق السياسة: <strong>{Number(renewal?.graceDays ?? 0)} يوم</strong>.</p></div>
        <label className="mt-4 block text-xs font-bold">رمز الخصم (اختياري)<Input value={promoCode} onChange={event => setPromoCode(event.target.value)} className="mt-2" /></label>
      </> : <>
        <div className="mt-5 rounded-2xl bg-red-500/8 p-4 text-xs leading-6"><p className="font-black">السياسة المطبقة: {cancellationMode === "IMMEDIATE_PRORATED" ? "إلغاء فوري مع احتساب الاسترداد" : "إلغاء في نهاية مدة الاشتراك"}</p><p className="mt-1 text-muted-foreground">مهلة الإشعار: {Number(cancellation?.noticeDays ?? 0)} يوم · رسم الإلغاء: {moneyMinor(cancellation?.feeMinor)} · الاسترداد {cancellation?.refundable ? "مسموح" : "غير مسموح"}.</p></div>
        <label className="mt-5 block text-xs font-bold">سبب الإلغاء<span className="mr-1 text-red-500">*</span><textarea value={reason} onChange={event => setReason(event.target.value)} rows={4} placeholder="اكتب سبب طلب الإلغاء" className="mt-2 w-full resize-none rounded-xl border bg-background p-3 text-sm outline-none focus:border-primary" /></label>
      </>}

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs font-semibold text-red-600">{error}</p>}
      <div className="mt-6 flex gap-2 border-t pt-5"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>رجوع</Button><Button type="submit" className="mr-auto" variant={renewing ? "default" : "destructive"} disabled={saving}>{saving ? "جارٍ التنفيذ..." : renewing ? "تأكيد التجديد" : "تأكيد الإلغاء"}</Button></div>
    </form>
  </div>
}

function moneyMinor(value: unknown) {
  const parsed = Number(value ?? 0)
  return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 2 }).format((Number.isFinite(parsed) ? parsed : 0) / 100)
}

function MemberDisciplinaryDialog({ organizationId, record, onClose, onSaved }: { organizationId: string; record: ApiRecord; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const blocked = Boolean(record.isBlocked)
  const memberId = String(record.id ?? "")
  const memberName = String(record.fullNameAr ?? record.fullName ?? record.memberNumber ?? "العضو")
  const [reason, setReason] = useState(String(record.blockedReason ?? ""))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!blocked && reason.trim().length < 3) { setError("اكتب سببًا واضحًا للحظر ليظهر في سجل العضو."); return }
    setSaving(true); setError("")
    try {
      const suffix = blocked ? "block-lifts" : "blocks"
      await apiRequest(`/organizations/${organizationId}/members/${memberId}/${suffix}`, { method: "POST", body: JSON.stringify(blocked ? { expectedVersion: Number(record.version ?? 1) } : { expectedVersion: Number(record.version ?? 1), reason: reason.trim() }) })
      toast.success(blocked ? "تم رفع الحظر وإعادة إتاحة الخدمات للعضو." : "تم حظر العضو وإيقاف استخدام اشتراكاته وخدماته مؤقتًا.")
      onSaved()
    } catch (reason) { setError(humanError(reason, blocked ? "تعذر رفع الحظر." : "تعذر حظر العضو.")) }
    finally { setSaving(false) }
  }

  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <form onSubmit={submit} className="w-full max-w-lg rounded-[28px] border bg-card p-6 shadow-2xl" dir="rtl">
      <div className="flex items-start gap-4"><span className={`grid size-12 place-items-center rounded-2xl ${blocked ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>{blocked ? <UserRoundCheck /> : <UserRoundX />}</span><div><h2 className="text-xl font-black">{blocked ? "رفع حظر العضو" : "حظر العضو مؤقتًا"}</h2><p className="mt-1 text-sm text-muted-foreground">{memberName}</p></div><Button type="button" variant="ghost" size="icon" className="mr-auto" onClick={onClose} aria-label="إغلاق"><X /></Button></div>
      <p className="mt-5 rounded-2xl bg-secondary/60 p-4 text-xs leading-6">{blocked ? "سيعود العضو إلى الحالة النشطة ويمكنه استخدام اشتراكاته السارية وحجز الخدمات من جديد." : "يمنع الحظر دخول العضو وحجز الخدمات واستخدام اشتراكاته دون إلغاء الاشتراك أو تغيير سجله المالي. يمكن رفعه لاحقًا من نفس المكان."}</p>
      {!blocked && <label className="mt-5 block text-xs font-bold">سبب الحظر<span className="mr-1 text-red-500">*</span><textarea value={reason} onChange={event => setReason(event.target.value)} rows={4} placeholder="مثال: مخالفة موثقة لسياسات النادي" className="mt-2 w-full resize-none rounded-xl border bg-background p-3 text-sm outline-none focus:border-primary" /></label>}
      {blocked && Boolean(record.blockedReason) && <p className="mt-4 text-xs text-muted-foreground">سبب الحظر المسجل: <strong className="text-foreground">{String(record.blockedReason)}</strong></p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs font-semibold text-red-600">{error}</p>}
      <div className="mt-6 flex gap-2 border-t pt-5"><Button type="button" variant="outline" onClick={onClose}>إلغاء</Button><Button type="submit" className={`mr-auto ${blocked ? "" : "bg-red-600 text-white hover:bg-red-700"}`} disabled={saving}>{saving ? "جارٍ الحفظ..." : blocked ? "رفع الحظر" : "تأكيد الحظر"}</Button></div>
    </form>
  </div>
}

function RecordPreview({ columns, row, record, operationId, organizationId, statusIndex, onClose, onChanged }: { columns: string[]; row: string[]; record: ApiRecord; operationId: string; organizationId: string; statusIndex?: number; onClose: () => void; onChanged: () => void }) {
  const context = useAppContext()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [actionResult, setActionResult] = useState("")
  const [pendingAction, setPendingAction] = useState<RecordAction>()
  const [positionOptions, setPositionOptions] = useState<Array<{ value: string; label: string }>>([])
  const status = String(record.status ?? "")
  const id = String(record.id ?? record.subscriptionId ?? record.reservationId ?? "")
  const version = Number(record.version ?? 1)
  const freezePolicy = subscriptionFreezePolicy(record)
  const freezeSchedule = pendingFreezeSchedule(record)
  const actions: RecordAction[] = []

  useEffect(() => {
    if (operationId !== "listEmployees" || !organizationId || !context.canAccess(["workforce.assignments.manage"])) return
    let cancelled = false
    void apiRequest<unknown>(`/organizations/${organizationId}/positions?limit=100`).then(response => {
      if (cancelled) return
      setPositionOptions(toList(response.data).flatMap(position => {
        const value = String(position.id ?? "")
        const label = String(position.nameAr ?? position.name ?? position.code ?? "مسمى وظيفي")
        return value ? [{ value, label }] : []
      }))
    }).catch(() => { if (!cancelled) setPositionOptions([]) })
    return () => { cancelled = true }
  }, [context, operationId, organizationId])

  if (operationId === "listMembers" && id && String(record.accountStatus ?? "NOT_LINKED") !== "LINKED") actions.push({
    label: "إصدار رمز تفعيل حساب العضو",
    permission: "members.accounts.manage",
    path: `/organizations/${organizationId}/members/${id}/account-activation-codes`,
    requiresConfirmation: true,
    description: "سيُلغى أي رمز سابق ويُصدر رمز جديد صالح لمدة 15 دقيقة. سلّمه للعضو ليحدد كلمة مروره بنفسه من صفحة تفعيل الحساب.",
    confirmLabel: "إصدار الرمز",
    body: () => ({}),
    responseMessage: data => `رمز التفعيل: ${String(data.activationCode ?? "")}\nرقم العضوية: ${String(data.memberNumber ?? "")}\nالجوال: ${String(data.phoneE164 ?? "")}\nصالح لمدة 15 دقيقة فقط.`,
  })

  if (operationId === "listMembers" && id && String(record.accountStatus ?? "NOT_LINKED") === "LINKED") actions.push({
    label: "تعيين كلمة مرور جديدة للعضو",
    permission: "members.accounts.manage",
    path: `/organizations/${organizationId}/members/${id}/password-resets`,
    description: "استخدم هذا الإجراء عندما ينسى العضو كلمة المرور أو عند تجهيز حسابه للاختبار. لن تظهر كلمة المرور القديمة ولا يمكن استعادتها.",
    confirmLabel: "حفظ كلمة المرور الجديدة",
    fields: [
      { name: "password", label: "كلمة المرور الجديدة", type: "password", required: true, hint: "7 محارف على الأقل؛ أرقام أو حروف أو خليط. لا تستخدم كلمة مرور حساب الموظف أو المدير.", placeholder: "أدخل كلمة مرور للعضو" },
      { name: "confirmPassword", label: "تأكيد كلمة المرور", type: "password", required: true, placeholder: "أعد كتابة كلمة المرور الجديدة" },
    ],
    body: values => ({ password: values.password }),
  })

  if (operationId === "listMembers" && id) actions.push({
    label: "تعديل الملاحظات الداخلية الحساسة",
    permission: "members.sensitive.manage",
    method: "PATCH",
    path: `/organizations/${organizationId}/members/${id}`,
    description: "هذه الملاحظات مخصصة للموظفين المصرح لهم فقط، ولا تظهر للعضو أو لموظف لا يملك صلاحية الاطلاع على البيانات الحساسة.",
    fields: [{ name: "notes", label: "الملاحظات الداخلية", type: "textarea", initial: String(record.notes ?? ""), placeholder: "اكتب الملاحظة أو اترك الحقل فارغًا لمسحها" }],
    body: values => ({ expectedVersion: version, notes: values.notes.trim() || null }),
  })

  if (operationId === "listSubscriptions" && id) {
    if (["PENDING_ACTIVATION", "SCHEDULED"].includes(status)) actions.push({
      label: "تعديل موعد بداية الاشتراك",
      permission: "subscriptions.adjustments.manage",
      path: `/organizations/${organizationId}/subscriptions/${id}/start-date-changes`,
      description: "يمكن تعديل الموعد قبل بدء الاشتراك فقط. يحتفظ النظام بمدة الاشتراك كاملة وينقل تاريخ النهاية بنفس الفارق. إذا كان الاشتراك مسددًا ومجدولًا واخترت الوقت الحالي فسيصبح نشطًا فورًا.",
      confirmLabel: "حفظ موعد البداية الجديد",
      fields: [
        { name: "startAt", label: "موعد البداية الجديد", type: "datetime-local", initial: localDateTime(new Date()), required: true, hint: `الموعد الحالي: ${new Date(String(record.termStart ?? "")).toLocaleString("ar-SA")}` },
        { name: "reason", label: "سبب تعديل الموعد", type: "textarea", initial: "طلب العضو", required: true, placeholder: "اكتب سببًا واضحًا لتعديل موعد البداية" },
      ],
      body: values => ({ expectedVersion: version, startAt: new Date(values.startAt).toISOString(), reason: values.reason.trim() }),
    })
    if (["ACTIVE", "ACTIVE_PROVISIONAL"].includes(status) && !freezeSchedule) actions.push({
      label: "تجميد الاشتراك",
      permission: "subscriptions.freeze",
      path: `/organizations/${organizationId}/subscriptions/${id}/freezes`,
      description: `حدد مدة التجميد وسجّل السبب ليظهر في سجل الاشتراك. ${freezePolicy.message}`,
      disabled: !freezePolicy.allowed,
      disabledReason: freezePolicy.message,
      fields: [
        { name: "startMode", label: "موعد بدء التجميد", type: "select", initial: "NOW", required: true, options: [{ value: "NOW", label: "الآن" }, { value: "LATER", label: "في موعد لاحق" }] },
        { name: "scheduledStartAt", label: "موعد البدء عند اختيار موعد لاحق", type: "datetime-local", initial: localDateTime(new Date(new Date().getTime() + 7 * 86_400_000)), hint: "يُتجاهل هذا الحقل عند اختيار البدء الآن." },
        { name: "requestedDays", label: "عدد أيام التجميد", type: "number", initial: String(freezePolicy.recommendedDays), min: 1, max: freezePolicy.maxDaysPerFreeze || 1, required: true, hint: `الحد الأقصى ${freezePolicy.maxDaysPerFreeze} يوم، والمتبقي ${freezePolicy.remainingFreezes} من ${freezePolicy.maxFreezesPerTerm} مرات. أيام النشاط المحسوبة: ${freezePolicy.activeDays}.` },
        { name: "reason", label: "سبب التجميد", type: "textarea", initial: "طلب العضو", required: true, placeholder: "اكتب سببًا واضحًا للتجميد" },
      ],
      body: values => ({ expectedVersion: version, requestedDays: Number(values.requestedDays), reason: values.reason.trim(), ...(values.startMode === "LATER" ? { scheduledStartAt: new Date(values.scheduledStartAt).toISOString() } : {}) }),
    })
    if (["ACTIVE", "ACTIVE_PROVISIONAL"].includes(status) && freezeSchedule) actions.push({
      label: "إلغاء موعد التجميد المجدول",
      permission: "subscriptions.freeze",
      danger: true,
      path: `/organizations/${organizationId}/subscriptions/${id}/freeze-schedules/${String(freezeSchedule.id)}/cancellations`,
      description: `التجميد مجدول ليبدأ في ${new Date(String(freezeSchedule.scheduledStartAt)).toLocaleString("ar-SA")} لمدة ${String(freezeSchedule.requestedDays)} يوم. إلغاء الجدولة لا يجمّد الاشتراك ولا يغيّر مدته الحالية.`,
      fields: [{ name: "reason", label: "سبب إلغاء الجدولة", type: "textarea", initial: "طلب العضو إلغاء الجدولة", required: true }],
      body: values => ({ expectedVersion: version, reason: values.reason.trim() }),
    })
    if (status === "FROZEN") actions.push({ label: "استئناف الاشتراك", permission: "subscriptions.freeze", path: `/organizations/${organizationId}/subscriptions/${id}/resumptions`, body: () => ({ expectedVersion: version }) })
    if (["ACTIVE", "FROZEN"].includes(status)) {
      actions.push({
        label: "تعديل مدة أو رصيد زيارات الاشتراك",
        permission: "subscriptions.adjustments.manage",
        path: `/organizations/${organizationId}/subscriptions/${id}/adjustments`,
        description: "إجراء استثنائي موثّق يضيف أيامًا إلى نهاية الاشتراك أو زيارات إلى رصيده. لا يستخدم بدل التجديد أو التجميد.",
        fields: [
          { name: "type", label: "نوع التعديل", type: "select", required: true, options: [{ value: "EXTEND_DAYS", label: "إضافة أيام إلى مدة الاشتراك" }, { value: "ADD_VISITS", label: "إضافة زيارات إلى رصيد الاشتراك" }] },
          { name: "value", label: "عدد الأيام أو الزيارات", type: "number", min: 1, required: true, initial: "1" },
          { name: "reason", label: "سبب التعديل", type: "textarea", required: true, placeholder: "مثال: تعويض عن توقف خدمة موثّق" },
        ],
        body: values => ({ expectedVersion: version, type: values.type, value: Number(values.value), reason: values.reason.trim() }),
      })
      actions.push({
        label: "إلغاء الاشتراك",
        permission: "subscriptions.cancel",
        danger: true,
        path: `/organizations/${organizationId}/subscriptions/${id}/cancellations`,
        description: "سيتم تطبيق سياسة الإلغاء المرتبطة بالاشتراك وتسجيل السبب في سجل العضو.",
        fields: [{ name: "reason", label: "سبب الإلغاء", type: "textarea", initial: "طلب العضو", required: true, placeholder: "اكتب سبب إلغاء الاشتراك" }],
        body: values => ({ expectedVersion: version, reason: values.reason.trim() }),
      })
    }
  }

  if (operationId === "listReservations" && id && ["PENDING_PAYMENT", "CONFIRMED"].includes(status)) actions.push({
    label: "إلغاء الحجز",
    permission: "bookings.manage",
    danger: true,
    path: `/organizations/${organizationId}/reservations/${id}/cancellations`,
    description: "سيُلغى الحجز بعد التأكيد مع الاحتفاظ بسبب الإلغاء في السجل.",
    fields: [{ name: "reason", label: "سبب إلغاء الحجز", type: "textarea", initial: "طلب العضو", required: true }],
    body: values => ({ expectedVersion: version, reason: values.reason.trim() }),
  })
  if (operationId === "listReservations" && id && status === "CONFIRMED") {
    actions.push({ label: "إكمال الحجز", permission: "bookings.manage", path: `/organizations/${organizationId}/reservations/${id}/transitions`, body: () => ({ expectedVersion: version, action: "COMPLETE" }) })
    actions.push({ label: "تسجيل عدم حضور", permission: "bookings.manage", danger: true, path: `/organizations/${organizationId}/reservations/${id}/transitions`, description: "سيُسجل الحجز كحالة عدم حضور، وقد ينعكس ذلك على سجل العضو.", body: () => ({ expectedVersion: version, action: "NO_SHOW" }) })
  }

  if (operationId === "listEmployees" && id) {
    actions.push({
      label: "إضافة تعيين وظيفي أو نقل لفرع",
      permission: "workforce.assignments.manage",
      path: `/organizations/${organizationId}/employees/${id}/assignments`,
      description: "اختر الفرع والمسمى الوظيفي وتاريخ البداية. صلاحيات المسمى ستنعكس تلقائيًا على حساب الموظف داخل هذا الفرع.",
      fields: [
        { name: "branchId", label: "الفرع", type: "select", required: true, options: context.branches.map(branch => ({ value: branch.id, label: branch.nameAr ?? branch.name ?? "فرع" })) },
        { name: "positionId", label: "المسمى الوظيفي والصلاحيات", type: "select", required: true, options: positionOptions },
        { name: "validFrom", label: "تاريخ بداية التعيين", type: "date", required: true, initial: businessDate(new Date()) },
        { name: "validUntil", label: "تاريخ نهاية التعيين (اختياري)", type: "date" },
      ],
      body: values => ({ branchId: values.branchId, positionId: values.positionId, validFrom: new Date(`${values.validFrom}T00:00:00+03:00`).toISOString(), ...(values.validUntil ? { validUntil: new Date(`${values.validUntil}T23:59:59+03:00`).toISOString() } : {}) }),
    })
    actions.push({
      label: "تعديل بيانات الموظف",
      permission: "workforce.manage",
      method: "PATCH",
      path: `/organizations/${organizationId}/employees/${id}`,
      description: "حدّث البيانات الأساسية للموظف. يمكن ترك الهاتف أو البريد الإلكتروني فارغًا.",
      fields: [
        { name: "name", label: "اسم الموظف", type: "text", initial: String(record.name ?? record.fullName ?? ""), required: true, placeholder: "الاسم الكامل" },
        { name: "phone", label: "رقم الجوال", type: "tel", initial: String(record.phoneE164 ?? record.phone ?? ""), placeholder: "+9665XXXXXXXX" },
        { name: "email", label: "البريد الإلكتروني", type: "email", initial: String(record.email ?? ""), placeholder: "name@example.com" },
      ],
      body: values => ({ expectedVersion: version, name: values.name.trim(), phone: values.phone.trim() || null, email: values.email.trim() || null }),
    })
    actions.push({
      label: "إنشاء أو تغيير كلمة مرور الدخول",
      permission: "workforce.accounts.manage",
      path: `/organizations/${organizationId}/employees/${id}/password-resets`,
      description: "أنشئ كلمة مرور مؤقتة قوية وأرسلها للموظف عبر قناة آمنة. يستطيع الموظف استخدامها مع رقمه الوظيفي.",
      confirmLabel: "حفظ كلمة المرور",
      fields: [
        { name: "password", label: "كلمة المرور الجديدة", type: "password", required: true, hint: "7 محارف على الأقل؛ أرقام أو حروف أو خليط.", placeholder: "أدخل كلمة المرور الجديدة" },
        { name: "confirmPassword", label: "تأكيد كلمة المرور", type: "password", required: true, placeholder: "أعد كتابة كلمة المرور" },
      ],
      body: values => ({ password: values.password }),
    })
    actions.push({
      label: status === "ACTIVE" ? "تعطيل حساب الموظف" : "إعادة تفعيل الموظف",
      permission: "workforce.manage",
      method: "PATCH",
      danger: status === "ACTIVE",
      path: `/organizations/${organizationId}/employees/${id}`,
      description: status === "ACTIVE" ? "لن يتمكن الموظف من الدخول أو تنفيذ أي عملية حتى إعادة تفعيل حسابه." : "سيستعيد الموظف إمكانية الدخول وفق صلاحيات مسماه الوظيفي.",
      body: () => ({ expectedVersion: version, status: status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
    })
  }

  async function run(action: RecordAction, values: Record<string, string> = {}) {
    setBusy(true)
    setError("")
    try {
      const response = await apiRequest<ApiRecord>(action.path, { method: action.method ?? "POST", body: JSON.stringify(action.body(values)) })
      if (action.responseMessage) {
        setActionResult(action.responseMessage(response.data)); setPendingAction(undefined)
      } else onChanged()
    } catch (reason) {
      setError(humanError(reason, "تعذر تنفيذ الإجراء. راجع البيانات ثم حاول مرة أخرى."))
    } finally {
      setBusy(false)
    }
  }

  const visibleActions = actions.filter(action => context.canAccess([action.permission]))
  function requestAction(action: RecordAction) {
    setError("")
    if (action.fields?.length || action.danger || action.requiresConfirmation) setPendingAction(action)
    else void run(action)
  }

  return <>
    <div className="fixed inset-0 z-[75] grid place-items-end bg-black/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="record-title" className="max-h-[90vh] w-full overflow-y-auto rounded-t-[28px] border bg-card p-5 shadow-2xl sm:max-w-xl sm:rounded-[28px] sm:p-6">
        <div className="flex items-center"><span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-amber-600"><Eye /></span><div className="mr-3"><p className="text-[10px] text-muted-foreground">ملخص السجل</p><h2 id="record-title" className="font-black">{row[0]}</h2></div><Button className="mr-auto" variant="ghost" size="icon" onClick={onClose} disabled={busy} aria-label="إغلاق"><X /></Button></div>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2">{columns.map((label, index) => <div key={label} className="rounded-xl bg-secondary/55 p-4"><dt className="text-[10px] font-bold text-muted-foreground">{label}</dt><dd className="mt-2 text-sm font-bold">{index === statusIndex ? <StatusBadge status={row[index]} /> : row[index]}</dd></div>)}</dl>
        {error && !pendingAction && <p className="mt-4 rounded-xl bg-destructive/10 p-3 text-xs font-bold text-destructive">{error}</p>}
        {actionResult && <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4"><p className="text-xs font-black text-emerald-600">تم إصدار بيانات التفعيل</p><p dir="ltr" className="mt-2 whitespace-pre-line text-left font-mono text-sm font-bold leading-7">{actionResult}</p><p className="mt-2 text-[10px] text-muted-foreground">لا يُحفظ الرمز بصورته الأصلية، لذلك انسخه الآن وسلّمه للعضو عبر قناة آمنة.</p></div>}
        {operationId === "listSubscriptions" && ["ACTIVE", "ACTIVE_PROVISIONAL"].includes(status) && <div role="status" className={`mt-5 rounded-2xl border p-4 text-xs ${freezePolicy.allowed ? "border-blue-500/25 bg-blue-500/5" : "border-amber-500/30 bg-amber-500/8"}`}><p className="font-black">سياسة التجميد المحفوظة مع الاشتراك</p><p className="mt-2 leading-6 text-muted-foreground">{freezePolicy.message} أيام النشاط المحسوبة: {freezePolicy.activeDays}، والحد الأدنى المطلوب: {freezePolicy.minimumActiveDaysBeforeFreeze}.</p></div>}
        {visibleActions.length > 0 && <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">{visibleActions.map(action => <Button key={action.label} variant={action.danger ? "destructive" : "outline"} disabled={busy || action.disabled} title={action.disabledReason} onClick={() => requestAction(action)}>{action.label}</Button>)}</div>}
        <Button className="mt-6 w-full" size="lg" onClick={onClose} disabled={busy}>إغلاق</Button>
      </section>
    </div>
    {pendingAction && <RecordOperationDialog key={pendingAction.label} action={pendingAction} busy={busy} error={error} onClose={() => { if (!busy) { setPendingAction(undefined); setError("") } }} onSubmit={values => run(pendingAction, values)} />}
  </>
}

function RecordOperationDialog({ action, busy, error, onClose, onSubmit }: { action: RecordAction; busy: boolean; error: string; onClose: () => void; onSubmit: (values: Record<string, string>) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries((action.fields ?? []).map(field => [field.name, field.initial ?? ""])))
  const [validationError, setValidationError] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const missing = action.fields?.find(field => field.required && !values[field.name]?.trim())
    if (missing) { setValidationError(`أدخل ${missing.label}.`); return }
    const numberField = action.fields?.find(field => field.type === "number" && field.min !== undefined && Number(values[field.name]) < field.min)
    if (numberField) { setValidationError(`${numberField.label} يجب ألا يقل عن ${numberField.min}.`); return }
    const excessiveNumberField = action.fields?.find(field => field.type === "number" && field.max !== undefined && Number(values[field.name]) > field.max)
    if (excessiveNumberField) { setValidationError(`${excessiveNumberField.label} يجب ألا يزيد على ${excessiveNumberField.max}.`); return }
    if (values.reason !== undefined && values.reason.trim().length < 3) { setValidationError("اكتب سببًا واضحًا من 3 أحرف على الأقل."); return }
    if (values.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) { setValidationError("أدخل بريدًا إلكترونيًا صحيحًا."); return }
    if (values.password !== undefined && values.password.length < MIN_PASSWORD_LENGTH) { setValidationError(`كلمة المرور يجب ألا تقل عن ${MIN_PASSWORD_LENGTH} محارف.`); return }
    if (values.confirmPassword !== undefined && values.password !== values.confirmPassword) { setValidationError("كلمتا المرور غير متطابقتين."); return }
    setValidationError("")
    void onSubmit(values)
  }

  return <div className="fixed inset-0 z-[85] grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="operation-title" className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] border bg-card shadow-2xl sm:max-w-lg sm:rounded-[28px]">
      <div className="flex items-start gap-3 border-b p-5 sm:p-6">
        <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${action.danger ? "bg-destructive/10 text-destructive" : "bg-primary/15 text-amber-600"}`}>{action.danger ? <AlertTriangle /> : <LockKeyhole />}</span>
        <div className="min-w-0 flex-1"><h2 id="operation-title" className="text-lg font-black">{action.label}</h2>{action.description && <p className="mt-1 text-xs leading-6 text-muted-foreground">{action.description}</p>}</div>
        <Button variant="ghost" size="icon" onClick={onClose} disabled={busy} aria-label="إغلاق"><X /></Button>
      </div>
      <form onSubmit={submit} className="p-5 sm:p-6">
        {(action.fields ?? []).length > 0 ? <div className="grid gap-5">{action.fields?.map(field => <label key={field.name} className="grid gap-2 text-sm font-bold">
          <span>{field.label}{field.required && <span className="mr-1 text-destructive" aria-hidden="true">*</span>}</span>
          {field.type === "textarea" ? <textarea value={values[field.name] ?? ""} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} placeholder={field.placeholder} rows={4} className="min-h-28 w-full resize-y rounded-xl border bg-background px-4 py-3 text-sm font-medium outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15" /> : field.type === "select" ? <select required={field.required} value={values[field.name] ?? ""} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary"><option value="">اختر من القائمة</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "date" || field.type === "datetime-local" || field.type === "time" ? <DateTimeInput type={field.type} required={field.required} value={values[field.name] ?? ""} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} className="h-11" /> : <div className="relative"><Input type={field.type === "password" ? (showPassword ? "text" : "password") : field.type} value={values[field.name] ?? ""} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} placeholder={field.placeholder} min={field.min} max={field.max} autoComplete={field.type === "password" ? "new-password" : undefined} className={field.type === "password" ? "pl-12" : undefined} />{field.type === "password" && <button type="button" onClick={() => setShowPassword(current => !current)} className="absolute left-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>}</div>}
          {field.hint && <span className="text-[11px] font-normal leading-5 text-muted-foreground">{field.hint}</span>}
        </label>)}</div> : <div className={`rounded-2xl p-4 text-sm leading-7 ${action.danger ? "bg-destructive/10 text-destructive" : "bg-secondary/60"}`}>راجع أثر هذا الإجراء ثم أكّد التنفيذ. لا تغلق الصفحة أثناء الحفظ.</div>}
        {(validationError || error) && <p role="alert" className="mt-5 rounded-xl bg-destructive/10 p-3 text-xs font-bold text-destructive">{validationError || error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row">
          <Button type="button" variant="outline" className="sm:flex-1" onClick={onClose} disabled={busy}>إلغاء</Button>
          <Button type="submit" variant={action.danger ? "destructive" : "default"} className="sm:flex-1" disabled={busy}>{busy ? "جارٍ الحفظ..." : action.confirmLabel ?? (action.danger ? "تأكيد الإجراء" : "حفظ التغييرات")}</Button>
        </div>
      </form>
    </section>
  </div>
}

function listPath(path: string, organizationId: string, branchId: string, includeBranch = true) {
  let resolved = path.replace("{organizationId}", organizationId).replace("{branchId}", branchId).replace(/^\/api\/v1/, "")
  if (includeBranch && branchId && !path.includes("{branchId}")) resolved += `${resolved.includes("?") ? "&" : "?"}branchId=${encodeURIComponent(branchId)}`
  return resolved
}

function statusOptions(operationId: string, rows: string[][], statusIndex?: number) {
  const fixed: Record<string, string[]> = {
    listMembers: ["ACTIVE", "INACTIVE"],
    listSubscriptions: ["PENDING_ACTIVATION", "SCHEDULED", "ACTIVE", "ACTIVE_PROVISIONAL", "FROZEN", "EXPIRED", "CANCELLED"],
  }
  return fixed[operationId] ?? (statusIndex === undefined ? [] : [...new Set(rows.map(row => row[statusIndex]).filter(Boolean))])
}

function toList(data: unknown): ApiRecord[] {
  if (Array.isArray(data)) return data.filter((item): item is ApiRecord => Boolean(item) && typeof item === "object")
  if (data && typeof data === "object" && "items" in data && Array.isArray((data as { items?: unknown }).items)) return (data as { items: ApiRecord[] }).items
  if (data && typeof data === "object" && "rows" in data && Array.isArray((data as { rows?: unknown }).rows)) return (data as { rows: ApiRecord[] }).rows
  return []
}

const aliases: Record<string, string[]> = { fullNameAr: ["name", "fullName", "displayName"], memberName: ["name"], customerName: ["memberName", "guestName", "name"], customerPhone: ["guestPhoneE164", "phoneE164"], packageName: ["commercialSnapshot.packageName"], startsOn: ["termStart", "startsAt"], endsOn: ["termEnd", "endsAt"], occurredAt: ["attemptedAt"], method: ["accessMethod"], buyerName: ["memberName", "name"], itemSummary: ["lines"], orderNumber: ["orderNumber"], reservationNumber: ["reservationNumber"], positionName: ["assignments.0.positionName"], shiftSummary: ["assignments.0.status"], attendanceAt: ["hireDate"], sourceName: ["sourceNameAr", "sourceCode"], interest: ["interestType"], assigneeName: ["assignedToName", "assigneeName"], scope: ["scopeType"] }

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

function localDateTime(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function metricNote(recordCount: number, fallback: string) {
  return recordCount ? "محسوب من سجلات الصفحة الحالية" : fallback
}

function statusLabel(value: string) { return ({ ACTIVE: "نشط", ACTIVE_PROVISIONAL: "نشط مؤقتًا", INACTIVE: "غير نشط", LINKED: "مرتبط", ACTIVATION_PENDING: "رمز تفعيل صادر", NOT_LINKED: "غير مرتبط", PENDING: "قيد المراجعة", PENDING_ACTIVATION: "بانتظار السداد والتفعيل", FROZEN: "مجمّد", EXPIRED: "منتهي", CANCELLED: "ملغي", ACCEPTED: "مسموح", REJECTED: "مرفوض", PAID: "مدفوع", PARTIALLY_PAID: "مدفوع جزئيًا", DRAFT: "مسودة", SCHEDULED: "مجدول", COMPLETED: "مكتمل", NEW: "جديد", CONTACTED: "تم التواصل", QUALIFIED: "مؤهل", PREPARING: "قيد التحضير", READY: "جاهز" } as Record<string, string>)[value] ?? value }
