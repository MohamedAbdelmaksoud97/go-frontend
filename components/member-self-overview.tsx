"use client"

import { useEffect, useState } from "react"
import { Activity, CalendarDays, CreditCard, Dumbbell, Loader2, Printer, ReceiptText, RefreshCw, ShoppingBag, Utensils, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DateTimeInput } from "@/components/date-time-input"
import { useToast } from "@/components/toast-provider"
import { apiRequest, createIdempotencyKey } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { escapePrintHtml, openBrandedPrintWindow } from "@/lib/branded-print"
import { pendingFreezeSchedule, subscriptionFreezePolicy } from "@/lib/subscription-freeze-policy"

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
  const toast = useToast()
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
  const [freezeMode, setFreezeMode] = useState<"NOW" | "LATER">("NOW")
  const [freezeStartAt, setFreezeStartAt] = useState(localDateTime(new Date(new Date().getTime() + 7 * 86_400_000)))
  const [renewal, setRenewal] = useState<{ row: Row; quote: Row }>()
  const selectedPendingSchedule = freezeRequest ? pendingFreezeSchedule(freezeRequest) : undefined
  const selectedFreezePolicy = freezeRequest ? subscriptionFreezePolicy({ ...freezeRequest, freezeSchedules: selectedPendingSchedule ? [] : freezeRequest.freezeSchedules }, freezeMode === "LATER" ? new Date(freezeStartAt) : new Date()) : undefined

  async function load() {
    setLoading(true); setError("")
    try {
      const response = await apiRequest<unknown>(`/self/organizations/${member.organizationId}/members/${member.memberId}/${active}?limit=100`)
      setRows(list(response.data))
    } catch (reason) { setError(humanError(reason, "تعذر تحميل بيانات العضوية.")) }
    finally { setLoading(false) }
  }

  useEffect(() => { const frame = requestAnimationFrame(() => void load()); return () => cancelAnimationFrame(frame) }, [active, member.memberId, member.organizationId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function subscriptionAction(row: Row, action: "freezes" | "resumptions" | "cancellations", actionReason?: string, requestedDays?: number, scheduledStartAt?: string) {
    const id = String(row.id ?? row.subscriptionId ?? ""); if (!id) return false
    let body: Record<string, unknown> = { expectedVersion: Number(row.version ?? 1) }
    if (action === "freezes") { if (!requestedDays || requestedDays < 1 || !actionReason || actionReason.trim().length < 3) return false; body = { ...body, requestedDays, reason: actionReason.trim(), ...(scheduledStartAt ? { scheduledStartAt } : {}) } }
    if (action === "cancellations") { if (!actionReason || actionReason.trim().length < 3) return false; body = { ...body, reason: actionReason.trim() } }
    setBusy(id)
    try { await apiRequest(`/self/organizations/${member.organizationId}/members/${member.memberId}/subscriptions/${id}/${action}`, { method: "POST", body: JSON.stringify(body) }); await load(); return true }
    catch (reason) { setError(humanError(reason, "تعذر تحديث الاشتراك.")); return false }
    finally { setBusy("") }
  }

  async function cancelFreezeSchedule(row: Row, schedule: Row, cancellationReason: string) {
    const id = String(row.id ?? row.subscriptionId ?? ""); const scheduleId = String(schedule.id ?? "")
    if (!id || !scheduleId || cancellationReason.trim().length < 3) return false
    setBusy(id)
    try { await apiRequest(`/self/organizations/${member.organizationId}/members/${member.memberId}/subscriptions/${id}/freeze-schedules/${scheduleId}/cancellations`, { method: "POST", body: JSON.stringify({ expectedVersion: Number(row.version ?? 1), reason: cancellationReason.trim() }) }); await load(); return true }
    catch (cause) { setError(humanError(cause, "تعذر إلغاء موعد التجميد.")); return false }
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
    if (selectedPendingSchedule) {
      if (freezeReason.trim().length < 3) return
      const succeeded = await cancelFreezeSchedule(freezeRequest, selectedPendingSchedule, freezeReason)
      if (succeeded) { setFreezeRequest(undefined); setFreezeReason("") }
      return
    }
    const policy = subscriptionFreezePolicy(freezeRequest, freezeMode === "LATER" ? new Date(freezeStartAt) : new Date())
    const days = Number(freezeDays)
    if (!policy.allowed || !Number.isInteger(days) || days < 1 || days > policy.maxDaysPerFreeze || freezeReason.trim().length < 3) return
    const scheduled = freezeMode === "LATER" ? new Date(freezeStartAt) : undefined
    if (scheduled && (!Number.isFinite(scheduled.getTime()) || scheduled <= new Date() || scheduled >= new Date(String(freezeRequest.termEnd ?? "")))) return
    const succeeded = await subscriptionAction(freezeRequest, "freezes", freezeReason, days, scheduled?.toISOString())
    if (succeeded) { setFreezeRequest(undefined); setFreezeDays("7"); setFreezeReason(""); setFreezeMode("NOW") }
  }

  async function prepareRenewal(row: Row) {
    const packageId = String(row.packageId ?? ""); const sellingBranchId = String(row.sellingBranchId ?? "")
    if (!packageId || !sellingBranchId) { setError("تعذر تحديد الباقة أو فرع الاشتراك المطلوب تجديده."); return }
    setBusy(String(row.id ?? "")); setError("")
    try {
      const quote = (await apiRequest<Row>(`/self/organizations/${member.organizationId}/quotes`, { method: "POST", body: JSON.stringify({ branchId: sellingBranchId, targetType: "PACKAGE", targetId: packageId, quantity: 1, memberSegment: "OTHER" }) })).data
      setRenewal({ row, quote })
    } catch (cause) { setError(humanError(cause, "تعذر حساب سعر تجديد الاشتراك.")) }
    finally { setBusy("") }
  }

  async function confirmRenewal() {
    if (!renewal) return
    const row = renewal.row; const subscriptionId = String(row.id ?? ""); const packageId = String(row.packageId ?? ""); const sellingBranchId = String(row.sellingBranchId ?? "")
    if (!subscriptionId || !packageId || !sellingBranchId) return
    setBusy(subscriptionId); setError("")
    try {
      const order = (await apiRequest<Row>(`/self/organizations/${member.organizationId}/members/${member.memberId}/orders`, { method: "POST", idempotencyKey: createIdempotencyKey(), body: JSON.stringify({ sellingBranchId, memberSegment: "OTHER", lines: [{ type: "MEMBERSHIP", targetId: packageId, quantity: 1, renewal: { subscriptionId, expectedVersion: Number(row.version ?? 1) } }] }) })).data
      setRenewal(undefined)
      toast.success(`تم إنشاء طلب التجديد${order.invoiceNumber ? ` وفاتورة ${String(order.invoiceNumber)}` : ""}. يبدأ الاشتراك الجديد بعد انتهاء المدة الحالية، ويُفعّل بعد السداد.`)
      await load()
    } catch (cause) { setError(humanError(cause, "تعذر إنشاء طلب التجديد والفاتورة.")) }
    finally { setBusy("") }
  }

  return <>
    <Card className="mt-5 overflow-hidden border-primary/15"><CardContent className="p-0">{showMemberHeader && <div className="bg-gradient-to-l from-primary/[.10] to-transparent p-5"><div className="flex flex-wrap items-center gap-3"><div><p className="text-xs font-bold text-primary">بوابة العضو</p><h2 className="mt-1 text-xl font-black">{member.memberName}</h2><p className="mt-1 text-xs text-muted-foreground">رقم العضوية: {member.memberNumber}</p></div><Button className="mr-auto" variant="outline" size="sm" onClick={() => void load()}><RefreshCw />تحديث البيانات</Button></div></div>}<div className="p-5"><div className="flex flex-wrap items-center gap-3"><nav className="flex gap-2 overflow-x-auto pb-2" aria-label="أقسام حساب العضو">{visibleTabs.map(tab => <Button key={tab.key} variant={active === tab.key ? "default" : "outline"} size="sm" className="shrink-0" onClick={() => setActive(tab.key)}><tab.icon />{tab.label}</Button>)}</nav>{!showMemberHeader && <Button className="mr-auto" variant="outline" size="sm" onClick={() => void load()}><RefreshCw />تحديث</Button>}</div>{error && <p role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-xs text-red-600">{error}</p>}{loading ? <div className="grid min-h-40 place-items-center"><Loader2 className="animate-spin text-primary" /></div> : <div className="mt-4 space-y-3">{rows.map((row, index) => <article key={String(row.id ?? index)} className="rounded-2xl border bg-secondary/20 p-4"><div className="flex flex-wrap items-start gap-3"><div className="min-w-0"><p className="text-sm font-black">{title(row, active, index)}</p><p className="mt-2 text-xs leading-6 text-muted-foreground">{summary(row, active)}</p>{lineNames(row).length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{lineNames(row).map((name, lineIndex) => <span key={`${name}-${lineIndex}`} className="rounded-lg bg-background px-2 py-1 text-[11px]">{name}</span>)}</div>}{active === "subscriptions" && <FreezeHistory row={row} />}</div><div className="mr-auto flex gap-2">{active === "subscriptions" && member.canManageMembership && <SubscriptionButtons row={row} busy={busy === String(row.id)} onAction={value => {
                if (value === "cancellations") { setCancellation({ row, kind: "subscription" }); setReason(""); return }
                if (value === "freezes") { const policy = subscriptionFreezePolicy(row); const scheduled = pendingFreezeSchedule(row); setFreezeRequest(row); setFreezeDays(String(policy.recommendedDays)); setFreezeReason(scheduled ? "طلب العضو إلغاء الجدولة" : ""); setFreezeMode("NOW"); return }
                if (value === "renewals") { void prepareRenewal(row); return }
                void subscriptionAction(row, value)
              }} />}{active === "invoices" && <Button size="sm" variant="outline" onClick={() => printInvoice(row, member)}><Printer />طباعة</Button>}{active === "reservations" && member.canBook && !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(String(row.status)) && <Button size="sm" variant="destructive" disabled={busy === String(row.id)} onClick={() => { setCancellation({ row, kind: "reservation" }); setReason("") }}>إلغاء الحجز</Button>}</div></div></article>)}{!rows.length && <div className="rounded-2xl border border-dashed py-10 text-center"><p className="text-sm font-bold">لا توجد بيانات في هذا القسم بعد</p><p className="mt-1 text-xs text-muted-foreground">ستظهر هنا تلقائيًا فور تنفيذ العملية المرتبطة.</p></div>}</div>}</div></CardContent></Card>
    {freezeRequest && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="freeze-title" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setFreezeRequest(undefined) }}>
      <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border bg-card p-6 shadow-2xl">
        <div className="flex items-start gap-4"><div><p className="text-xs font-bold text-primary">وفق سياسة الباقة</p><h3 id="freeze-title" className="mt-1 text-xl font-black">{selectedPendingSchedule ? "إدارة التجميد المجدول" : "تجميد الاشتراك"}</h3></div><Button className="mr-auto" size="icon" variant="ghost" aria-label="إغلاق" disabled={Boolean(busy)} onClick={() => setFreezeRequest(undefined)}><X /></Button></div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{selectedPendingSchedule ? "راجع موعد التجميد القادم أو ألغِه قبل حلول وقت البدء." : "يمكنك بدء التجميد الآن أو تحديد موعد لاحق، وسيتحقق النظام من سياسة الباقة عند الجدولة وعند التنفيذ."}</p>
        {selectedPendingSchedule ? <div className="mt-4 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 text-sm"><p className="font-black">موعد التجميد القادم</p><p className="mt-2 text-muted-foreground">{formatDate(selectedPendingSchedule.scheduledStartAt)} · لمدة {String(selectedPendingSchedule.requestedDays)} يوم</p><p className="mt-1 text-muted-foreground">{String(selectedPendingSchedule.reason ?? "دون سبب مسجل")}</p></div> : <>
        <fieldset className="mt-4"><legend className="text-sm font-bold">موعد البدء</legend><div className="mt-2 grid grid-cols-2 gap-2"><Button type="button" variant={freezeMode === "NOW" ? "default" : "outline"} onClick={() => setFreezeMode("NOW")}>الآن</Button><Button type="button" variant={freezeMode === "LATER" ? "default" : "outline"} onClick={() => setFreezeMode("LATER")}>موعد لاحق</Button></div></fieldset>
        {freezeMode === "LATER" && <div className="mt-4"><label className="block text-sm font-bold" htmlFor="freeze-start-at">تاريخ ووقت بدء التجميد</label><DateTimeInput id="freeze-start-at" className="mt-2" type="datetime-local" min={localDateTime(new Date(new Date().getTime() + 60_000))} max={localDateTime(new Date(String(freezeRequest.termEnd ?? "")))} value={freezeStartAt} onChange={event => setFreezeStartAt(event.target.value)} /></div>}
        {selectedFreezePolicy && <div className={`mt-4 rounded-2xl border p-4 text-xs ${selectedFreezePolicy.allowed ? "border-blue-500/25 bg-blue-500/5" : "border-amber-500/30 bg-amber-500/8"}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FreezeMetric label="أقصى مدة" value={`${selectedFreezePolicy.maxDaysPerFreeze} يوم`} />
            <FreezeMetric label="المرات المتبقية" value={`${selectedFreezePolicy.remainingFreezes} من ${selectedFreezePolicy.maxFreezesPerTerm}`} />
            <FreezeMetric label="النشاط المطلوب" value={`${selectedFreezePolicy.minimumActiveDaysBeforeFreeze} يوم`} />
            <FreezeMetric label="نشاطك المحسوب" value={`${selectedFreezePolicy.activeDays} يوم`} />
          </div>
          <p className="mt-3 leading-6 text-muted-foreground">{selectedFreezePolicy.message}</p>
        </div>}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div><label className="block text-sm font-bold" htmlFor="freeze-days">عدد أيام التجميد</label><Input id="freeze-days" className="mt-2" type="number" min={1} max={selectedFreezePolicy?.maxDaysPerFreeze || 1} inputMode="numeric" value={freezeDays} onChange={event => setFreezeDays(event.target.value)} autoFocus /></div>
          <div><label className="block text-sm font-bold" htmlFor="freeze-reason">سبب التجميد</label><Input id="freeze-reason" className="mt-2" value={freezeReason} onChange={event => setFreezeReason(event.target.value)} placeholder="مثال: سفر أو ظرف صحي" /></div>
        </div>
        </>}
        {selectedPendingSchedule && <div className="mt-5"><label className="block text-sm font-bold" htmlFor="freeze-reason">سبب إلغاء الجدولة</label><Input id="freeze-reason" className="mt-2" value={freezeReason} onChange={event => setFreezeReason(event.target.value)} /></div>}
        <div className="mt-6 flex flex-wrap gap-2"><Button variant={selectedPendingSchedule ? "destructive" : "default"} disabled={Boolean(busy) || Boolean(selectedPendingSchedule ? freezeReason.trim().length < 3 : !selectedFreezePolicy?.allowed || !Number.isInteger(Number(freezeDays)) || Number(freezeDays) < 1 || Number(freezeDays) > (selectedFreezePolicy?.maxDaysPerFreeze ?? 0) || freezeReason.trim().length < 3)} onClick={() => void confirmFreeze()}>{busy && <Loader2 className="animate-spin" />}{selectedPendingSchedule ? "إلغاء موعد التجميد" : freezeMode === "LATER" ? "حفظ الجدولة" : "تأكيد التجميد الآن"}</Button><Button variant="outline" disabled={Boolean(busy)} onClick={() => setFreezeRequest(undefined)}>رجوع</Button></div>
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
    {renewal && <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="renewal-title" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setRenewal(undefined) }}>
      <div className="my-auto w-full max-w-lg rounded-3xl border bg-card p-6 shadow-2xl">
        <div className="flex items-start gap-4"><div><p className="text-xs font-bold text-primary">تجديد وفق سياسة الباقة</p><h3 id="renewal-title" className="mt-1 text-xl font-black">تجديد {String(renewal.row.packageName ?? "الاشتراك")}</h3></div><Button className="mr-auto" size="icon" variant="ghost" aria-label="إغلاق" disabled={Boolean(busy)} onClick={() => setRenewal(undefined)}><X /></Button></div>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">سيُنشئ النظام طلب بيع وفاتورة مستقلة، ويحفظ السعر والسياسات الحالية للباقة. يبدأ الاشتراك الجديد بعد نهاية الاشتراك الحالي ولا يُفعّل قبل سداد الفاتورة.</p>
        <div className="mt-5 grid grid-cols-2 gap-3"><RenewalMetric label="السعر قبل الضريبة" value={money(renewal.quote.netMinor)} /><RenewalMetric label="الضريبة" value={money(renewal.quote.taxMinor)} /><RenewalMetric label="الإجمالي" value={money(renewal.quote.grossMinor)} /><RenewalMetric label="موعد البداية" value={dateOnly(renewal.row.termEnd)} /></div>
        <div className="mt-6 flex flex-wrap gap-2"><Button disabled={Boolean(busy)} onClick={() => void confirmRenewal()}>{busy && <Loader2 className="animate-spin" />}تأكيد وإنشاء الفاتورة</Button><Button variant="outline" disabled={Boolean(busy)} onClick={() => setRenewal(undefined)}>رجوع</Button></div>
      </div>
    </div>}
  </>
}

function SubscriptionButtons({ row, busy, onAction }: { row: Row; busy: boolean; onAction: (value: "freezes" | "resumptions" | "cancellations" | "renewals") => void }) { const value = String(row.status ?? ""); const cancellationPending = Boolean(row.cancellationRequest); const freezePolicy = subscriptionFreezePolicy(row); const scheduled = pendingFreezeSchedule(row); const renewalWindow = subscriptionRenewalEligibility(row); return <>{cancellationPending && <Badge variant="warning">الإلغاء مجدول</Badge>}{scheduled && <Badge variant="warning">التجميد مجدول</Badge>}{["ACTIVE", "ACTIVE_PROVISIONAL"].includes(value) && !cancellationPending && <><Button size="sm" variant="outline" disabled={busy || (!freezePolicy.allowed && !scheduled)} title={freezePolicy.message} onClick={() => onAction("freezes")}>{scheduled ? "إدارة موعد التجميد" : "تجميد العضوية"}</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => onAction("cancellations")}>طلب إلغاء</Button></>}{value === "FROZEN" && !cancellationPending && <Button size="sm" disabled={busy} onClick={() => onAction("resumptions")}>استئناف</Button>}{["ACTIVE", "EXPIRED"].includes(value) && <Button size="sm" variant="outline" disabled={busy || !renewalWindow.allowed} title={renewalWindow.message} onClick={() => onAction("renewals")}><RefreshCw />تجديد</Button>}</> }
function FreezeMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-background/70 p-2"><span className="block text-[10px] text-muted-foreground">{label}</span><strong className="mt-1 block">{value}</strong></div> }
function RenewalMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border bg-secondary/25 p-3"><span className="block text-[10px] text-muted-foreground">{label}</span><strong className="mt-1 block text-sm">{value}</strong></div> }
function FreezeHistory({ row }: { row: Row }) { const periods = Array.isArray(row.freezePeriods) ? row.freezePeriods as Row[] : []; const scheduled = pendingFreezeSchedule(row); if (!periods.length && !scheduled) return null; return <div className="mt-3 rounded-xl border bg-background/60 p-3"><p className="text-xs font-black">التجميد</p>{scheduled && <p className="mt-2 rounded-lg bg-blue-500/10 p-2 text-[11px] leading-5 text-blue-700 dark:text-blue-300">مجدول ليبدأ في {formatDate(scheduled.scheduledStartAt)} لمدة {String(scheduled.requestedDays)} يوم · {String(scheduled.reason ?? "دون سبب مسجل")}</p>}<div className="mt-2 space-y-1.5">{periods.map((period, index) => <p key={String(period.id ?? index)} className="text-[11px] leading-5 text-muted-foreground">{dateOnly(period.startedAt)} — {period.resumedAt ? `استؤنف في ${dateOnly(period.resumedAt)}` : `مجمّد حتى ${dateOnly(period.plannedEndAt)}`} · {String(period.reason ?? "دون سبب مسجل")}</p>)}</div></div> }
function subscriptionRenewalEligibility(row: Row) {
  if (row.cancellationRequest) return { allowed: false, message: "لا يمكن التجديد مع وجود طلب إلغاء قائم." }
  if (pendingFreezeSchedule(row)) return { allowed: false, message: "ألغِ التجميد المجدول أو انتظر تنفيذه قبل التجديد حتى يُحسب موعد البداية بدقة." }
  const snapshot = row.policySnapshot && typeof row.policySnapshot === "object" && !Array.isArray(row.policySnapshot) ? row.policySnapshot as Row : undefined
  const policies = Array.isArray(snapshot?.policies) ? snapshot.policies as Row[] : []
  const configuration = policies.find(policy => policy.policyType === "RENEWAL")?.configuration
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) return { allowed: false, message: "لا توجد سياسة تجديد محفوظة مع هذا الاشتراك." }
  const graceDays = Number((configuration as Row).graceDays); const termEnd = new Date(String(row.termEnd ?? ""))
  if (!Number.isInteger(graceDays) || graceDays < 0 || Number.isNaN(termEnd.getTime())) return { allowed: false, message: "بيانات سياسة التجديد المحفوظة غير صالحة." }
  const latest = new Date(termEnd.getTime() + graceDays * 86_400_000)
  if (new Date() > latest) return { allowed: false, message: `انتهت مهلة التجديد في ${dateOnly(latest)}.` }
  return { allowed: true, message: new Date() < termEnd ? "يبدأ التجديد بعد انتهاء المدة الحالية ولا يفقد العضو أي أيام متبقية." : "التجديد متاح خلال مهلة ما بعد انتهاء الاشتراك." }
}
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
  if (active === "subscriptions") { const period = `${dateOnly(row.termStart)} — ${dateOnly(row.termEnd)}`; const visits = row.visitAllowance == null ? "دخول غير محدود" : `${String(row.visitsRemaining ?? 0)} زيارة متبقية من ${String(row.visitAllowance)}`; const freeze = subscriptionFreezePolicy(row); const freezeSummary = freeze.available ? `التجميد: أقصى ${freeze.maxDaysPerFreeze} يوم في المرة، والمتبقي ${freeze.remainingFreezes} من ${freeze.maxFreezesPerTerm} مرات${freeze.allowed ? "" : ` — ${freeze.message}`}` : freeze.message; return join([row.subscriptionNumber && `رقم الاشتراك ${row.subscriptionNumber}`, period, status(row.status), visits, branch && `فرع ${branch}`, freezeSummary]) }
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
function printInvoice(row: Row, member: Member) { const lines = lineNames(row); const invoiceNumber = String(row.invoiceNumber ?? ""); const employeeName = String(row.operationEmployeeName ?? "غير مسجل"); openBrandedPrintWindow({ title: `فاتورة ${invoiceNumber}`, subtitle: "فاتورة العضو", body: `<section class="document-heading"><p class="eyebrow">فاتورة</p><h1 dir="ltr">${escapePrintHtml(invoiceNumber)}</h1><p>${escapePrintHtml(member.memberName)} · ${escapePrintHtml(member.memberNumber)}</p></section><div class="document-grid"><div class="document-box"><span>تاريخ الإصدار</span><strong>${escapePrintHtml(formatDate(row.issuedAt))}</strong></div><div class="document-box"><span>الحالة</span><strong>${escapePrintHtml(status(row.status))}</strong></div><div class="document-box"><span>الإجمالي</span><strong>${escapePrintHtml(money(row.grossMinor))}</strong></div><div class="document-box"><span>المتبقي</span><strong>${escapePrintHtml(money(row.outstandingMinor))}</strong></div><div class="document-box"><span>موظف تنفيذ العملية</span><strong>${escapePrintHtml(employeeName)}</strong></div></div>${lines.length ? `<table><thead><tr><th>البيان</th></tr></thead><tbody>${lines.map(name => `<tr><td>${escapePrintHtml(name)}</td></tr>`).join("")}</tbody></table>` : ""}` }) }
function money(value: unknown) { return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format((Number(value) || 0) / 100) }
function formatDate(value: unknown) { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date) }
function dateOnly(value: unknown) { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? "تاريخ غير متاح" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(date) }
function localDateTime(value: Date) { if (Number.isNaN(value.getTime())) return ""; const offset = value.getTimezoneOffset() * 60_000; return new Date(value.getTime() - offset).toISOString().slice(0, 16) }
function join(values: unknown[]) { return values.filter(value => value !== undefined && value !== null && value !== "").map(String).join(" · ") }
function status(value: unknown) { return ({ ACTIVE: "نشط", ACTIVE_PROVISIONAL: "نشط مؤقتًا", FROZEN: "مجمّد", EXPIRED: "منتهي", CANCELLED: "ملغى", PENDING_PAYMENT: "بانتظار السداد", PAID: "مدفوع", FULFILLED: "مكتمل", PENDING: "بانتظار السداد", CONFIRMED: "تم التأكيد ووصل للتشغيل", PREPARING: "قيد التحضير", READY: "جاهز للاستلام", COMPLETED: "مكتمل", NO_SHOW: "لم يحضر", ISSUED: "بانتظار السداد", PARTIALLY_PAID: "مدفوعة جزئيًا", ACCEPTED: "دخول مسموح", REJECTED: "دخول مرفوض", DRAFT: "مسودة", OPEN: "مفتوح", CLOSED: "مغلق", SKIPPED: "تم التخطي" } as Record<string, string>)[String(value)] ?? "حالة غير متاحة" }
