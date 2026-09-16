"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog } from "@base-ui/react/dialog"
import { CalendarDays, CalendarPlus, CheckCircle2, CreditCard, FileText, Loader2, Printer, RefreshCw, ShoppingBag, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DateTimeInput } from "@/components/date-time-input"
import { useToast } from "@/components/toast-provider"
import { apiRequest, createIdempotencyKey } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { BookingAvailability } from "@/components/booking-availability"
import { bookingSlotPeriod } from "@/lib/booking-availability"
import { ContractPrintSheets, printContractDocument, printableContract, type ContractSnapshot } from "@/components/invoice-details-page"

type Row = Record<string, unknown>
type Member = { organizationId: string; memberId: string; memberName: string; memberNumber: string; canBook?: boolean; canManageMembership?: boolean }
type Tab = "packages" | "services" | "booking"
type Quote = { targetName: string; baseAmountMinor: string; discountMinor: string; netMinor: string; taxMinor: string; grossMinor: string; taxInclusive: boolean; promotion?: { name: string } }
type PendingCheckout = { item: Row; type: "PACKAGE" | "SERVICE"; quote: Quote; contracts: Row[] }

export function MemberMarketplace({ member, branchId, branchName }: { member: Member; branchId: string; branchName?: string }) {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>(member.canManageMembership ? "packages" : "booking")
  const [items, setItems] = useState<Row[]>([])
  const [slots, setSlots] = useState<Row[]>([])
  const [services, setServices] = useState<Row[]>([])
  const [resource, setResource] = useState<Row>()
  const [courtSchedule, setCourtSchedule] = useState(() => futureCourtSchedule())
  const [courtParticipants, setCourtParticipants] = useState("1")
  const [pending, setPending] = useState<PendingCheckout>()
  const [printable, setPrintable] = useState<ContractSnapshot>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [bookingError, setBookingError] = useState("")
  const [loadingSlots, setLoadingSlots] = useState(false)
  const bookingRequest = useRef(0)
  const allowed = (tab === "booking" && member.canBook) || (tab !== "booking" && member.canManageMembership)

  async function load() {
    if (!allowed) return
    bookingRequest.current += 1
    setLoadingSlots(false); setBookingError("")
    setLoading(true); setError(""); setSlots([]); setResource(undefined)
    try {
      const suffix = tab === "packages" ? "packages" : tab === "services" ? "services" : "bookable-resources"
      const response = await apiRequest<unknown>(`/self/organizations/${member.organizationId}/${suffix}?branchId=${branchId}`)
      const loadedItems = list(response.data)
      setItems(loadedItems)
      if (tab === "services") setServices(loadedItems)
      else {
        const serviceResponse = await apiRequest<unknown>(`/self/organizations/${member.organizationId}/services?branchId=${branchId}`)
        setServices(list(serviceResponse.data))
      }
    } catch (reason) {
      setError(humanError(reason, "تعذر تحميل الخيارات المتاحة في هذا الفرع.")); setItems([])
    } finally { setLoading(false) }
  }

  useEffect(() => { const frame = requestAnimationFrame(() => void load()); return () => cancelAnimationFrame(frame) }, [tab, member.memberId, branchId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function prepareCheckout(item: Row, type: "PACKAGE" | "SERVICE") {
    const id = String(item.id ?? ""); if (!id) return
    setBusy(id); setError("")
    try {
      const quote = (await apiRequest<Quote>(`/self/organizations/${member.organizationId}/quotes`, {
        method: "POST",
        body: JSON.stringify({ branchId, targetType: type, targetId: id, quantity: 1, memberId: member.memberId }),
      })).data
      setPending({ item, type, quote, contracts: contractsFor(item, type, services) })
    } catch (reason) { setError(humanError(reason, "تعذر حساب السعر النهائي لهذا الطلب.")) }
    finally { setBusy("") }
  }

  async function confirmCheckout() {
    if (!pending) return
    const id = String(pending.item.id ?? ""); setBusy(id); setError("")
    try {
      const order = await checkout({ type: pending.type === "PACKAGE" ? "MEMBERSHIP" : "SERVICE", targetId: id, quantity: 1, accessBranchId: pending.type === "PACKAGE" ? branchId : undefined })
      setPending(undefined)
      toast.success(invoiceSuccess(order, "تم تسجيل طلبك بنجاح. برجاء السداد في استقبال النادي لإتمام الاشتراك أو الخدمة."))
    } catch (reason) { setError(humanError(reason, "تعذر إنشاء الطلب والفاتورة.")) }
    finally { setBusy("") }
  }

  async function chooseResource(item: Row) {
    const id = String(item.id ?? ""); if (!id) return
    const request = ++bookingRequest.current
    setResource(item); setSlots([]); setBookingError("")
    if (bookingType(item.resourceType) === "COURT") { setLoadingSlots(false); setCourtSchedule(futureCourtSchedule()); setCourtParticipants("1"); return }
    setLoadingSlots(true)
    try {
      const from = new Date(); const to = new Date(); to.setDate(to.getDate() + 30)
      const response = await apiRequest<unknown>(`/self/organizations/${member.organizationId}/bookable-resources/${id}/session-slots?branchId=${branchId}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      if (request === bookingRequest.current) setSlots(list(response.data))
    } catch (reason) { if (request === bookingRequest.current) { setBookingError(humanError(reason, "تعذر تحميل المواعيد المتاحة.")); setSlots([]) } }
    finally { if (request === bookingRequest.current) setLoadingSlots(false) }
  }

  function closeBooking() {
    bookingRequest.current += 1
    setResource(undefined); setSlots([]); setLoadingSlots(false); setBookingError("")
  }

  async function book(slot: Row) {
    if (!resource) return
    const id = String(slot.id ?? ""); const serviceId = String(resource.serviceId ?? "")
    if (!id || !serviceId) return
    setBusy(id); setBookingError("")
    try {
      const order = await checkout({ type: "BOOKING", targetId: serviceId, quantity: 1, booking: { resourceId: String(resource.id), type: bookingType(resource.resourceType), sessionSlotId: id, seats: 1, participantCount: 1 } })
      toast.success(invoiceSuccess(order, "تم تسجيل الحجز بنجاح. برجاء السداد في استقبال النادي لتأكيد الموعد."))
      closeBooking()
    } catch (reason) { setBookingError(humanError(reason, "تعذر إنشاء الحجز والفاتورة.")) }
    finally { setBusy("") }
  }

  async function bookCourt(event: React.FormEvent) {
    event.preventDefault()
    if (!resource) return
    if (!Array.isArray(resource.availabilityRules) || !resource.availabilityRules.length) { setBookingError("لا يمكن تأكيد الحجز قبل توفر فترات الإتاحة لهذا المورد."); return }
    const serviceId = String(resource.serviceId ?? ""); const startsAt = new Date(courtSchedule.startsAt); const endsAt = new Date(courtSchedule.endsAt)
    if (!serviceId) { setBookingError("هذا المورد غير مرتبط بخدمة صالحة للحجز."); return }
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) { setBookingError("وقت نهاية الحجز يجب أن يكون بعد وقت البداية."); return }
    if (startsAt <= new Date()) { setBookingError("اختر موعد حجز في المستقبل."); return }
    const participantCount = Number(courtParticipants)
    if (!Number.isInteger(participantCount) || participantCount < 1 || participantCount > 100) { setBookingError("أدخل عدد مشاركين صحيحًا من 1 إلى 100."); return }
    const id = String(resource.id ?? ""); setBusy(id); setBookingError("")
    try {
      const order = await checkout({ type: "BOOKING", targetId: serviceId, quantity: 1, booking: { resourceId: id, type: "COURT", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), seats: 1, participantCount } })
      toast.success(invoiceSuccess(order, "تم تسجيل الحجز بنجاح. برجاء السداد في استقبال النادي لتأكيد الموعد."))
      setCourtSchedule(futureCourtSchedule())
      setCourtParticipants("1")
      closeBooking()
    } catch (reason) { setBookingError(humanError(reason, "تعذر إنشاء الحجز والفاتورة.")) }
    finally { setBusy("") }
  }

  async function checkout(line: Record<string, unknown>) {
    return (await apiRequest<Row>(`/self/organizations/${member.organizationId}/members/${member.memberId}/orders`, {
      method: "POST",
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({ sellingBranchId: branchId, lines: [line] }),
    })).data
  }

  function printContract(contract: Row, packageName?: string) {
    const snapshot = printableContract(contract, packageName)
    if (!snapshot) { setError("تعذر تجهيز نسخة العقد للطباعة. حدّث الصفحة وحاول مجددًا."); return }
    setPrintable(snapshot)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => void printContractDocument()))
  }

  const tabs: Array<[Tab, string]> = [
    ...(member.canManageMembership ? [["packages", "الباقات"], ["services", "الخدمات"]] as Array<[Tab, string]> : []),
    ...(member.canBook ? [["booking", "حجز موعد"]] as Array<[Tab, string]> : []),
  ]
  if (!tabs.length) return null

  return <>
    <Card className="mt-5 overflow-hidden">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div><div className="flex items-center gap-2"><ShoppingBag className="size-5 text-primary" /><h2 className="font-black">اكتشف واحجز</h2></div><p className="mt-1 text-xs leading-5 text-muted-foreground">كل ما هو منشور ومتاح فعليًا في {branchName ?? "الفرع المختار"}. سيظهر السعر النهائي والضريبة قبل تأكيد الطلب.</p></div>
          <Button className="mr-auto" variant="outline" size="icon" onClick={() => void load()} aria-label="تحديث"><RefreshCw /></Button>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{tabs.map(([key, label]) => <Button key={key} size="sm" variant={tab === key ? "default" : "outline"} onClick={() => setTab(key)}>{key === "booking" ? <CalendarPlus /> : <CreditCard />}{label}</Button>)}</div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs text-red-600">{error}</p>}
        {loading ? <div className="grid min-h-40 place-items-center"><Loader2 className="animate-spin text-primary" /></div> : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {items.map((item, index) => <article key={String(item.id ?? index)} className={`group rounded-2xl border bg-gradient-to-bl from-card to-secondary/20 p-5 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg ${resource?.id === item.id ? "border-primary" : ""}`}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-black">{String(item.name ?? item.code ?? "خيار متاح")}</p><p className="mt-1 text-xs leading-6 text-muted-foreground">{String(item.description ?? item.facilityName ?? item.categoryName ?? "متاح للحجز والشراء من بوابة العضو")}</p></div>{item.amountMinor != null && <Badge variant="outline">{money(item.amountMinor)} ر.س</Badge>}</div>
              {tab === "packages" && <PackageDetails item={item} />}
              {tab === "services" && Boolean(item.categoryName) && <p className="mt-3 text-xs text-muted-foreground">التصنيف: {String(item.categoryName)}</p>}
              <ContractSummary contracts={tab === "packages" ? contractsFor(item, "PACKAGE", services) : tab === "services" ? contractsFor(item, "SERVICE", services) : contractsForResource(item, services)} onPrint={contract => printContract(contract, String(item.name ?? item.code ?? ""))} />
              <Button className="mt-4 w-full" size="sm" disabled={Boolean(busy)} onClick={() => tab === "booking" ? void chooseResource(item) : void prepareCheckout(item, tab === "packages" ? "PACKAGE" : "SERVICE")}>{busy === String(item.id) ? <Loader2 className="animate-spin" /> : tab === "booking" ? <CalendarPlus /> : <ShoppingBag />}{tab === "booking" ? bookingType(item.resourceType) === "COURT" ? "اختيار وقت الحجز" : "عرض المواعيد المتاحة" : "عرض السعر النهائي"}</Button>
            </article>)}
            {!items.length && <div className="rounded-2xl border border-dashed p-10 text-center lg:col-span-2"><CalendarDays className="mx-auto size-9 text-muted-foreground/50" /><p className="mt-3 text-sm font-bold">لا توجد خيارات منشورة في هذا الفرع حاليًا</p><p className="mt-1 text-xs text-muted-foreground">يمكنك اختيار فرع آخر من القائمة بالأعلى.</p></div>}
          </div>
        )}
      </CardContent>
    </Card>
    <Dialog.Root open={Boolean(resource)} disablePointerDismissal={Boolean(busy)} onOpenChange={open => { if (!open && !busy) closeBooking() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-sm" />
        <Dialog.Viewport className="fixed inset-0 z-[101] grid items-end justify-items-center sm:items-center sm:p-5">
          <Dialog.Popup dir="rtl" className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] border bg-card text-card-foreground shadow-2xl outline-none sm:max-w-2xl sm:rounded-[28px]">
            <header className="flex shrink-0 items-start gap-4 border-b p-5 sm:p-6">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-primary">حجز موعد · {branchName ?? "الفرع المختار"}</p>
                <Dialog.Title className="mt-1 text-xl font-black">{String(resource?.name ?? "اختيار وقت الحجز")}</Dialog.Title>
                <Dialog.Description className="mt-2 text-xs leading-6 text-muted-foreground">راجع فترات الإتاحة واختر وقت الحجز. يُؤكد الموعد بعد السداد في استقبال النادي.</Dialog.Description>
              </div>
              <Dialog.Close render={<Button variant="ghost" size="icon" className="mr-auto shrink-0" disabled={Boolean(busy)} aria-label="إغلاق نافذة الحجز" />}><X /></Dialog.Close>
            </header>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6">
              {resource && <BookingAvailability rules={Array.isArray(resource.availabilityRules) ? resource.availabilityRules as Row[] : undefined} timezone={String(resource.timezone ?? "Asia/Riyadh")} />}
              {loadingSlots && <p role="status" className="mt-4 flex items-center gap-2 text-sm font-bold"><Loader2 className="size-4 animate-spin" />جارٍ تحميل المواعيد المتاحة...</p>}
              {bookingError && <div role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-xs leading-6 text-destructive">{bookingError}{resource && bookingType(resource.resourceType) !== "COURT" && <Button type="button" variant="outline" size="sm" className="mt-2 flex" disabled={Boolean(busy)} onClick={() => void chooseResource(resource)}><RefreshCw />إعادة تحميل المواعيد</Button>}</div>}
              {resource && bookingType(resource.resourceType) === "COURT" && <form onSubmit={bookCourt} className="mt-5"><p className="mt-1 text-xs text-muted-foreground">اختر فترة تقع داخل ساعات إتاحة الملعب. يحجز النظام الملعب كوحدة واحدة، وعدد المشاركين للتشغيل والتقارير فقط.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">بداية الحجز<DateTimeInput required type="datetime-local" value={courtSchedule.startsAt} onChange={event => setCourtSchedule(current => ({ ...current, startsAt: event.target.value }))} className="mt-2 h-11" /></label><label className="text-xs font-bold">نهاية الحجز<DateTimeInput required type="datetime-local" value={courtSchedule.endsAt} onChange={event => setCourtSchedule(current => ({ ...current, endsAt: event.target.value }))} className="mt-2 h-11" /></label><label className="text-xs font-bold sm:col-span-2">عدد المشاركين<Input required type="number" min="1" max="100" value={courtParticipants} onChange={event => setCourtParticipants(event.target.value)} className="mt-2 h-11" /></label><Button type="submit" className="sm:col-span-2" disabled={Boolean(busy) || !Array.isArray(resource.availabilityRules) || !resource.availabilityRules.length}>{busy === String(resource.id) ? <Loader2 className="animate-spin" /> : <CalendarPlus />}تأكيد الحجز وإصدار الفاتورة</Button></div></form>}
              {resource && bookingType(resource.resourceType) !== "COURT" && <div className="mt-5"><h3 className="text-sm font-black">المواعيد المتاحة — {String(resource.name ?? "")}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{!loadingSlots && !bookingError && slots.map((slot, index) => <Button key={String(slot.id ?? index)} variant="outline" className="h-auto min-h-14 justify-between gap-3 whitespace-normal py-3 text-start" disabled={Boolean(busy)} onClick={() => void book(slot)}><span className="min-w-0 flex-1">{bookingSlotPeriod(slot, String(resource.timezone ?? "Asia/Riyadh"))}</span><span className="text-[10px] text-muted-foreground">متاح {String(slot.availableCount ?? "")}</span>{busy === String(slot.id) && <Loader2 className="animate-spin" />}</Button>)}{!loadingSlots && !bookingError && !slots.length && <p className="text-xs text-muted-foreground">لا توجد مواعيد شاغرة خلال الثلاثين يومًا القادمة.</p>}</div></div>}
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
    {pending && <QuoteDialog pending={pending} busy={Boolean(busy)} onClose={() => setPending(undefined)} onConfirm={() => void confirmCheckout()} onPrint={contract => printContract(contract, String(pending.item.name ?? pending.item.code ?? ""))} />}
    {printable && <ContractPrintSheets context={{ branchName: branchName ?? "الفرع المختار", preview: true, member: { name: member.memberName, memberNumber: member.memberNumber } }} contracts={[printable]} />}
  </>
}

function QuoteDialog({ pending, busy, onClose, onConfirm, onPrint }: { pending: PendingCheckout; busy: boolean; onClose: () => void; onConfirm: () => void; onPrint: (contract: Row) => void }) {
  const quote = pending.quote
  return <div className="fixed inset-0 z-[100] flex items-end justify-center overflow-hidden bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="member-quote-title" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div className="flex max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border bg-card shadow-2xl sm:max-h-[94dvh] sm:rounded-3xl">
      <div className="flex shrink-0 items-start gap-3 border-b p-5 sm:p-6"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary"><CheckCircle2 /></span><div className="min-w-0"><p className="text-xs font-bold text-primary">مراجعة الطلب</p><h3 id="member-quote-title" className="mt-1 text-xl font-black">{quote.targetName}</h3></div><Button className="mr-auto shrink-0" variant="ghost" size="icon" onClick={onClose} disabled={busy} aria-label="إغلاق"><X /></Button></div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
        <dl className="space-y-3 rounded-2xl bg-secondary/50 p-4 text-sm"><PriceRow label="السعر قبل الخصم" value={quote.baseAmountMinor} />{Number(quote.discountMinor) > 0 && <PriceRow label={`الخصم${quote.promotion ? ` — ${quote.promotion.name}` : ""}`} value={quote.discountMinor} negative />}<PriceRow label="الصافي قبل الضريبة" value={quote.netMinor} /><PriceRow label="الضريبة" value={quote.taxMinor} /><div className="border-t pt-3"><PriceRow label="الإجمالي المطلوب في الاستقبال" value={quote.grossMinor} strong /></div></dl>
        <p className="mt-4 text-xs leading-6 text-muted-foreground">سيُنشأ الطلب وفاتورة برقم واضح. يكتمل تفعيل الاشتراك أو الخدمة بعد السداد في استقبال النادي.</p>
        <ContractSummary contracts={pending.contracts} expanded onPrint={onPrint} />
      </div>
      <div className="flex shrink-0 gap-3 border-t bg-card p-4 sm:px-6"><Button className="flex-1" onClick={onConfirm} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <CreditCard />}تأكيد وإنشاء الفاتورة</Button><Button variant="outline" onClick={onClose} disabled={busy}>رجوع</Button></div>
    </div>
  </div>
}

function PriceRow({ label, value, negative, strong }: { label: string; value: unknown; negative?: boolean; strong?: boolean }) { return <div className={`flex items-center justify-between gap-4 ${strong ? "text-base font-black" : ""}`}><dt>{label}</dt><dd className={negative ? "text-emerald-600" : ""}>{negative ? "− " : ""}{money(value)} ر.س</dd></div> }
function PackageDetails({ item }: { item: Row }) { const entitlements = Array.isArray(item.entitlements) ? item.entitlements as Row[] : []; return <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span className="rounded-lg bg-secondary px-2 py-1">المدة {String(item.durationDays ?? "—")} يوم</span>{item.visitAllowance != null && <span className="rounded-lg bg-secondary px-2 py-1">{String(item.visitAllowance)} زيارة</span>}{entitlements.slice(0, 3).map((value, index) => <span key={String(value.serviceId ?? index)} className="rounded-lg bg-secondary px-2 py-1">{String(value.serviceName ?? "خدمة")}</span>)}</div> }
function list(value: unknown): Row[] { return Array.isArray(value) ? value as Row[] : value && typeof value === "object" && Array.isArray((value as { items?: Row[] }).items) ? (value as { items: Row[] }).items : [] }
function money(value: unknown) { return new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((Number(value) || 0) / 100) }
function bookingType(value: unknown): "COURT" | "CLASS" | "PERSONAL_TRAINING" | "APPOINTMENT" { const type = String(value); return type === "CLASS" || type === "PERSONAL_TRAINING" || type === "APPOINTMENT" ? type : "COURT" }
function futureCourtSchedule() { const now = new Date(); now.setMinutes(0, 0, 0); const startsAt = new Date(now.getTime() + 60 * 60_000); const endsAt = new Date(startsAt.getTime() + 60 * 60_000); const local = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); return { startsAt: local(startsAt), endsAt: local(endsAt) } }
function invoiceSuccess(order: Row, message: string) { const invoiceNumber = String(order.invoiceNumber ?? ""); return invoiceNumber ? `${message} رقم الفاتورة: ${invoiceNumber}.` : message }
function contractsFor(item: Row, type: "PACKAGE" | "SERVICE", services: Row[]) {
  if (type === "PACKAGE") {
    const contract = item.contract && typeof item.contract === "object" ? item.contract as Row : undefined
    if (!contract?.content || !contract.title) return []
    const entitlementIds = new Set((Array.isArray(item.entitlements) ? item.entitlements as Row[] : []).map(entry => String(entry.serviceId ?? "")))
    const activityNames = [...new Set(services.filter(service => entitlementIds.has(String(service.id ?? ""))).flatMap(service => (Array.isArray(service.activities) ? service.activities as Row[] : []).map(activity => String(activity.name ?? "")).filter(Boolean)))]
    return [{ id: item.id, packageId: item.id, packageCode: item.code, packageName: item.name, activityNames, contractType: contract.type, contractTitle: contract.title, contractContent: contract.content, contractSections: contract.sections, source: "SALE" }]
  }
  return []
}
function contractsForResource(resource: Row, services: Row[]) {
  const service = services.find(item => String(item.id) === String(resource.serviceId))
  return service ? contractsFor(service, "SERVICE", services) : []
}
function ContractSummary({ contracts, expanded = false, onPrint }: { contracts: Row[]; expanded?: boolean; onPrint: (contract: Row) => void }) {
  if (!contracts.length) return null
  return <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="flex items-center gap-2 text-xs font-black"><FileText className="size-4 text-primary"/>عقود يجب الاطلاع عليها</p><div className="mt-2 space-y-2">{contracts.map(contract => <details key={String(contract.id)} open={expanded} className="rounded-lg bg-card p-3"><summary className="cursor-pointer text-xs font-bold">{String(contract.contractTitle ?? `عقد ${contract.name ?? "النشاط"}`)}</summary><p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{String(contract.contractContent ?? "")}</p><Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => onPrint(contract)}><Printer/>طباعة العقد</Button></details>)}</div></div>
}
