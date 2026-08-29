"use client"

import { useEffect, useState } from "react"
import { Activity, CalendarDays, CreditCard, Dumbbell, Loader2, Printer, ReceiptText, RefreshCw, ShoppingBag, Utensils, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { apiRequest } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { escapePrintHtml, openBrandedPrintWindow } from "@/lib/branded-print"

type Member = { organizationId: string; memberId: string; registrationBranchId: string; memberName: string; memberNumber: string; canManageMembership?: boolean; canBook?: boolean }
type Row = Record<string, unknown>
export type MemberOverviewTab = "subscriptions" | "orders" | "invoices" | "restaurant-orders" | "reservations" | "attendance" | "training-plans"
const allTabs = [
  { key: "subscriptions", label: "اشتراكاتي", icon: CreditCard },
  { key: "orders", label: "طلباتي", icon: ShoppingBag },
  { key: "invoices", label: "فواتيري", icon: ReceiptText },
  { key: "restaurant-orders", label: "طلبات المطعم", icon: Utensils },
  { key: "reservations", label: "حجوزاتي", icon: CalendarDays },
  { key: "attendance", label: "حضوري", icon: Activity },
  { key: "training-plans", label: "خطط التدريب", icon: Dumbbell },
] as const

export function MemberSelfOverview({ member, tabs, initialTab, showMemberHeader = true }: { member: Member; tabs?: MemberOverviewTab[]; initialTab?: MemberOverviewTab; showMemberHeader?: boolean }) {
  const visibleTabs = allTabs.filter(tab => !tabs || tabs.includes(tab.key))
  const [active, setActive] = useState<MemberOverviewTab>(initialTab ?? visibleTabs[0]?.key ?? "subscriptions")
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("")
  const [cancellation, setCancellation] = useState<{ row: Row; kind: "subscription" | "reservation" }>()
  const [reason, setReason] = useState("")
  const [freezeRequest, setFreezeRequest] = useState<Row>()
  const [freezeDays, setFreezeDays] = useState("7")
  const [freezeReason, setFreezeReason] = useState("")

  async function load() {
    setLoading(true); setError("")
    try {
      const response = await apiRequest<unknown>(`/self/organizations/${member.organizationId}/members/${member.memberId}/${active}?limit=100`)
      setRows(list(response.data))
    } catch (reason) { setError(humanError(reason, "تعذر تحميل بيانات العضوية.")) }
    finally { setLoading(false) }
  }

  useEffect(() => { const frame = requestAnimationFrame(() => void load()); return () => cancelAnimationFrame(frame) }, [active, member.memberId, member.organizationId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function subscriptionAction(row: Row, action: "freezes" | "resumptions" | "cancellations", actionReason?: string, requestedDays?: number) {
    const id = String(row.id ?? row.subscriptionId ?? ""); if (!id) return false
    let body: Record<string, unknown> = { expectedVersion: Number(row.version ?? 1) }
    if (action === "freezes") { if (!requestedDays || requestedDays < 1 || !actionReason || actionReason.trim().length < 3) return false; body = { ...body, requestedDays, reason: actionReason.trim() } }
    if (action === "cancellations") { if (!actionReason || actionReason.trim().length < 3) return false; body = { ...body, reason: actionReason.trim() } }
    setBusy(id)
    try { await apiRequest(`/self/organizations/${member.organizationId}/members/${member.memberId}/subscriptions/${id}/${action}`, { method: "POST", body: JSON.stringify(body) }); await load(); return true }
    catch (reason) { setError(humanError(reason, "تعذر تحديث الاشتراك.")); return false }
    finally { setBusy("") }
  }

  async function cancelReservation(row: Row, cancellationReason: string) {
    const id = String(row.id ?? row.reservationId ?? "")
    if (!id || cancellationReason.trim().length < 3) return false
    setBusy(id)
    try { await apiRequest(`/self/organizations/${member.organizationId}/members/${member.memberId}/reservations/${id}/cancellations`, { method: "POST", body: JSON.stringify({ expectedVersion: Number(row.version ?? 1), reason: cancellationReason.trim() }) }); await load(); return true }
    catch (value) { setError(humanError(value, "تعذر إلغاء الحجز.")); return false }
    finally { setBusy("") }
  }

  async function confirmCancellation() {
    if (!cancellation || reason.trim().length < 3) return
    const succeeded = cancellation.kind === "subscription"
      ? await subscriptionAction(cancellation.row, "cancellations", reason)
      : await cancelReservation(cancellation.row, reason)
    if (succeeded) { setCancellation(undefined); setReason("") }
  }

  async function confirmFreeze() {
    if (!freezeRequest) return
    const days = Number(freezeDays)
    if (!Number.isInteger(days) || days < 1 || freezeReason.trim().length < 3) return
    const succeeded = await subscriptionAction(freezeRequest, "freezes", freezeReason, days)
    if (succeeded) { setFreezeRequest(undefined); setFreezeDays("7"); setFreezeReason("") }
  }

  return <>
    <Card className="mt-5 overflow-hidden border-primary/15"><CardContent className="p-0">{showMemberHeader && <div className="bg-gradient-to-l from-primary/[.10] to-transparent p-5"><div className="flex flex-wrap items-center gap-3"><div><p className="text-xs font-bold text-primary">بوابة العضو</p><h2 className="mt-1 text-xl font-black">{member.memberName}</h2><p className="mt-1 text-xs text-muted-foreground">رقم العضوية: {member.memberNumber}</p></div><Button className="mr-auto" variant="outline" size="sm" onClick={() => void load()}><RefreshCw />تحديث البيانات</Button></div></div>}<div className="p-5"><div className="flex flex-wrap items-center gap-3"><nav className="flex gap-2 overflow-x-auto pb-2" aria-label="أقسام حساب العضو">{visibleTabs.map(tab => <Button key={tab.key} variant={active === tab.key ? "default" : "outline"} size="sm" className="shrink-0" onClick={() => setActive(tab.key)}><tab.icon />{tab.label}</Button>)}</nav>{!showMemberHeader && <Button className="mr-auto" variant="outline" size="sm" onClick={() => void load()}><RefreshCw />تحديث</Button>}</div>{error && <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-xs text-red-600">{error}</p>}{loading ? <div className="grid min-h-40 place-items-center"><Loader2 className="animate-spin text-primary" /></div> : <div className="mt-4 space-y-3">{rows.map((row, index) => <article key={String(row.id ?? index)} className="rounded-2xl border bg-secondary/20 p-4"><div className="flex flex-wrap items-start gap-3"><div className="min-w-0"><p className="text-sm font-black">{title(row, active, index)}</p><p className="mt-2 text-xs leading-6 text-muted-foreground">{summary(row, active)}</p>{lineNames(row).length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{lineNames(row).map((name, lineIndex) => <span key={`${name}-${lineIndex}`} className="rounded-lg bg-background px-2 py-1 text-[11px]">{name}</span>)}</div>}{active === "subscriptions" && <FreezeHistory row={row} />}</div><div className="mr-auto flex gap-2">{active === "subscriptions" && member.canManageMembership && <SubscriptionButtons row={row} busy={busy === String(row.id)} onAction={value => {
                if (value === "cancellations") { setCancellation({ row, kind: "subscription" }); setReason(""); return }
                if (value === "freezes") { setFreezeRequest(row); setFreezeDays("7"); setFreezeReason(""); return }
                void subscriptionAction(row, value)
              }} />}{active === "invoices" && <Button size="sm" variant="outline" onClick={() => printInvoice(row, member)}><Printer />طباعة</Button>}{active === "reservations" && member.canBook && !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(String(row.status)) && <Button size="sm" variant="destructive" disabled={busy === String(row.id)} onClick={() => { setCancellation({ row, kind: "reservation" }); setReason("") }}>إلغاء الحجز</Button>}</div></div></article>)}{!rows.length && <div className="rounded-2xl border border-dashed py-10 text-center"><p className="text-sm font-bold">لا توجد بيانات في هذا القسم بعد</p><p className="mt-1 text-xs text-muted-foreground">ستظهر هنا تلقائيًا فور تنفيذ العملية المرتبطة.</p></div>}</div>}</div></CardContent></Card>
    {freezeRequest && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="freeze-title" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setFreezeRequest(undefined) }}>
      <div className="w-full max-w-lg rounded-3xl border bg-card p-6 shadow-2xl">
        <div className="flex items-start gap-4"><div><p className="text-xs font-bold text-primary">وفق سياسة الباقة</p><h3 id="freeze-title" className="mt-1 text-xl font-black">تجميد الاشتراك</h3></div><Button className="mr-auto" size="icon" variant="ghost" aria-label="إغلاق" disabled={Boolean(busy)} onClick={() => setFreezeRequest(undefined)}><X /></Button></div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">حدّد المدة المناسبة. سيتحقق النظام تلقائيًا من الحد الأقصى للمدة وعدد مرات التجميد والمدة الدنيا التي يجب أن يكون فيها الاشتراك نشطًا.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div><label className="block text-sm font-bold" htmlFor="freeze-days">عدد أيام التجميد</label><Input id="freeze-days" className="mt-2" type="number" min={1} max={365} inputMode="numeric" value={freezeDays} onChange={event => setFreezeDays(event.target.value)} autoFocus /></div>
          <div><label className="block text-sm font-bold" htmlFor="freeze-reason">سبب التجميد</label><Input id="freeze-reason" className="mt-2" value={freezeReason} onChange={event => setFreezeReason(event.target.value)} placeholder="مثال: سفر أو ظرف صحي" /></div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2"><Button disabled={Boolean(busy) || !Number.isInteger(Number(freezeDays)) || Number(freezeDays) < 1 || freezeReason.trim().length < 3} onClick={() => void confirmFreeze()}>{busy && <Loader2 className="animate-spin" />}تأكيد التجميد</Button><Button variant="outline" disabled={Boolean(busy)} onClick={() => setFreezeRequest(undefined)}>رجوع</Button></div>
      </div>
    </div>}
    {cancellation && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cancellation-title" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setCancellation(undefined) }}>
      <div className="w-full max-w-lg rounded-3xl border bg-card p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div><p className="text-xs font-bold text-primary">تأكيد الإجراء</p><h3 id="cancellation-title" className="mt-1 text-xl font-black">{cancellation.kind === "subscription" ? "طلب إلغاء الاشتراك" : "إلغاء الحجز"}</h3></div>
          <Button className="mr-auto" size="icon" variant="ghost" aria-label="إغلاق" disabled={Boolean(busy)} onClick={() => setCancellation(undefined)}><X /></Button>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">اكتب سبب الإلغاء ليصل الطلب إلى فريق النادي واضحًا ويمكن مراجعته بسرعة.</p>
        <label className="mt-5 block text-sm font-bold" htmlFor="cancellation-reason">سبب الإلغاء</label>
        <Input id="cancellation-reason" className="mt-2" value={reason} onChange={event => setReason(event.target.value)} placeholder="مثال: تغير موعد الحجز أو ظروف شخصية" autoFocus />
        {reason.length > 0 && reason.trim().length < 3 && <p className="mt-2 text-xs text-red-600">اكتب سببًا واضحًا من 3 أحرف على الأقل.</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="destructive" disabled={Boolean(busy) || reason.trim().length < 3} onClick={() => void confirmCancellation()}>{busy && <Loader2 className="animate-spin" />}{cancellation.kind === "subscription" ? "إرسال طلب الإلغاء" : "تأكيد إلغاء الحجز"}</Button>
          <Button variant="outline" disabled={Boolean(busy)} onClick={() => setCancellation(undefined)}>رجوع</Button>
        </div>
      </div>
    </div>}
  </>
}

function SubscriptionButtons({ row, busy, onAction }: { row: Row; busy: boolean; onAction: (value: "freezes" | "resumptions" | "cancellations") => void }) { const value = String(row.status ?? ""); const cancellationPending = Boolean(row.cancellationRequest); return <>{cancellationPending && <Badge variant="warning">الإلغاء مجدول</Badge>}{["ACTIVE", "ACTIVE_PROVISIONAL"].includes(value) && !cancellationPending && <><Button size="sm" variant="outline" disabled={busy} onClick={() => onAction("freezes")}>تجميد العضوية</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => onAction("cancellations")}>طلب إلغاء</Button></>}{value === "FROZEN" && !cancellationPending && <Button size="sm" disabled={busy} onClick={() => onAction("resumptions")}>استئناف</Button>}</> }
function FreezeHistory({ row }: { row: Row }) { const periods = Array.isArray(row.freezePeriods) ? row.freezePeriods as Row[] : []; if (!periods.length) return null; return <div className="mt-3 rounded-xl border bg-background/60 p-3"><p className="text-xs font-black">سجل التجميدات</p><div className="mt-2 space-y-1.5">{periods.map((period, index) => <p key={String(period.id ?? index)} className="text-[11px] leading-5 text-muted-foreground">{dateOnly(period.startedAt)} — {period.resumedAt ? `استؤنف في ${dateOnly(period.resumedAt)}` : `مجمّد حتى ${dateOnly(period.plannedEndAt)}`} · {String(period.reason ?? "دون سبب مسجل")}</p>)}</div></div> }
function list(value: unknown): Row[] { if (Array.isArray(value)) return value as Row[]; if (value && typeof value === "object" && Array.isArray((value as { items?: unknown[] }).items)) return (value as { items: Row[] }).items; return [] }
function title(row: Row, active: string, index: number) {
  const names = lineNames(row)
  if (active === "subscriptions") return String(row.packageName ?? (row.subscriptionNumber ? `الاشتراك ${row.subscriptionNumber}` : "اشتراك النادي"))
  if (active === "orders") return `${names[0] ?? "طلب النادي"}${row.orderNumber ? ` — ${String(row.orderNumber)}` : ""}`
  if (active === "restaurant-orders") return `${names[0] ?? "طلب المطعم"}${row.invoiceNumber ? ` — فاتورة ${String(row.invoiceNumber)}` : ""}`
  if (active === "reservations") return String(row.serviceName ?? row.resourceName ?? "حجز نادي")
  if (active === "attendance") return String(row.serviceName ?? (row.branchName ? `زيارة ${row.branchName}` : "زيارة النادي"))
  return String(row.invoiceNumber ?? row.name ?? row.planName ?? ({ invoices: "فاتورة", ["training-plans"]: "خطة تدريب" } as Record<string, string>)[active] ?? `سجل ${index + 1}`)
}
function summary(row: Row, active: string) {
  const branch = row.sellingBranchName ?? row.registrationBranchName ?? row.branchName
  if (active === "subscriptions") { const period = `${dateOnly(row.termStart)} — ${dateOnly(row.termEnd)}`; const visits = row.visitAllowance == null ? "دخول غير محدود" : `${String(row.visitsRemaining ?? 0)} زيارة متبقية من ${String(row.visitAllowance)}`; return join([row.subscriptionNumber && `رقم الاشتراك ${row.subscriptionNumber}`, period, status(row.status), visits, branch && `فرع ${branch}`]) }
  if (active === "invoices") return join([row.issuedAt && formatDate(row.issuedAt), branch && `فرع ${branch}`, `الإجمالي ${money(row.grossMinor)}`, `المدفوع ${money(row.paidMinor)}`, `المتبقي ${money(row.outstandingMinor)}`, status(row.status)])
  if (active === "orders") return join([row.createdAt && formatDate(row.createdAt), branch && `فرع ${branch}`, `الإجمالي ${money(row.grossMinor)}`, status(row.status), row.invoiceNumber && `فاتورة ${row.invoiceNumber}`, row.invoiceStatus && status(row.invoiceStatus)])
  if (active === "restaurant-orders") return join([row.createdAt && formatDate(row.createdAt), branch && `فرع ${branch}`, `الإجمالي ${money(row.grossMinor)}`, status(row.status), row.invoiceNumber && `فاتورة ${row.invoiceNumber}`, row.invoiceStatus && status(row.invoiceStatus)])
  if (active === "reservations") return join([row.startsAt && formatDate(row.startsAt), branch && `فرع ${branch}`, row.seats && `${row.seats} مقعد`, status(row.status)])
  if (active === "attendance") return join([row.attemptedAt && formatDate(row.attemptedAt), branch && `فرع ${branch}`, row.subscriptionNumber && `اشتراك ${row.subscriptionNumber}`, status(row.decision)])
  if (active === "training-plans") { const items = Array.isArray(row.items) ? row.items as Row[] : []; const completed = items.filter(item => item.completionStatus === "COMPLETED").length; return join([row.trainerName && `المدرب ${row.trainerName}`, row.goal && `الهدف: ${row.goal}`, row.startsOn && `${dateOnly(row.startsOn)}${row.endsOn ? ` — ${dateOnly(row.endsOn)}` : ""}`, items.length > 0 && `${completed} من ${items.length} تمارين مكتملة`, status(row.status)]) }
  const value = row.startsAt ?? row.attemptedAt ?? row.issuedAt ?? row.createdAt ?? row.termStart
  return join([value && formatDate(value), status(row.status ?? row.decision ?? "")])
}
function lineNames(row: Row) { const values = Array.isArray(row.lines) ? row.lines as Row[] : []; return values.map(value => String(value.description ?? value.mealName ?? "")).filter(Boolean) }
function printInvoice(row: Row, member: Member) { const lines = lineNames(row); const invoiceNumber = String(row.invoiceNumber ?? ""); openBrandedPrintWindow({ title: `فاتورة ${invoiceNumber}`, subtitle: "فاتورة العضو", body: `<section class="document-heading"><p class="eyebrow">فاتورة</p><h1 dir="ltr">${escapePrintHtml(invoiceNumber)}</h1><p>${escapePrintHtml(member.memberName)} · ${escapePrintHtml(member.memberNumber)}</p></section><div class="document-grid"><div class="document-box"><span>تاريخ الإصدار</span><strong>${escapePrintHtml(formatDate(row.issuedAt))}</strong></div><div class="document-box"><span>الحالة</span><strong>${escapePrintHtml(status(row.status))}</strong></div><div class="document-box"><span>الإجمالي</span><strong>${escapePrintHtml(money(row.grossMinor))}</strong></div><div class="document-box"><span>المتبقي</span><strong>${escapePrintHtml(money(row.outstandingMinor))}</strong></div></div>${lines.length ? `<table><thead><tr><th>البيان</th></tr></thead><tbody>${lines.map(name => `<tr><td>${escapePrintHtml(name)}</td></tr>`).join("")}</tbody></table>` : ""}` }) }
function money(value: unknown) { return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format((Number(value) || 0) / 100) }
function formatDate(value: unknown) { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date) }
function dateOnly(value: unknown) { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? "تاريخ غير متاح" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(date) }
function join(values: unknown[]) { return values.filter(value => value !== undefined && value !== null && value !== "").map(String).join(" · ") }
function status(value: unknown) { return ({ ACTIVE: "نشط", ACTIVE_PROVISIONAL: "نشط مؤقتًا", FROZEN: "مجمّد", EXPIRED: "منتهي", CANCELLED: "ملغى", PENDING_PAYMENT: "بانتظار السداد", PAID: "مدفوع", FULFILLED: "مكتمل", PENDING: "بانتظار السداد", CONFIRMED: "تم التأكيد ووصل للتشغيل", PREPARING: "قيد التحضير", READY: "جاهز للاستلام", COMPLETED: "مكتمل", NO_SHOW: "لم يحضر", ISSUED: "بانتظار السداد", PARTIALLY_PAID: "مدفوعة جزئيًا", ACCEPTED: "دخول مسموح", REJECTED: "دخول مرفوض", DRAFT: "مسودة", OPEN: "مفتوح", CLOSED: "مغلق", SKIPPED: "تم التخطي" } as Record<string, string>)[String(value)] ?? "حالة غير متاحة" }
