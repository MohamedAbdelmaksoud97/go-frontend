"use client"

import { useEffect, useState } from "react"
import { CalendarDays, CalendarPlus, CheckCircle2, CreditCard, FileText, Loader2, Printer, RefreshCw, ShoppingBag, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/toast-provider"
import { apiRequest, createIdempotencyKey } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { escapePrintHtml, openBrandedPrintWindow } from "@/lib/branded-print"

type Row = Record<string, unknown>
type Member = { organizationId: string; memberId: string; canBook?: boolean; canManageMembership?: boolean }
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
  const [pending, setPending] = useState<PendingCheckout>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const allowed = (tab === "booking" && member.canBook) || (tab !== "booking" && member.canManageMembership)

  async function load() {
    if (!allowed) return
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
        body: JSON.stringify({ branchId, targetType: type, targetId: id, quantity: 1, memberSegment: "OTHER" }),
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
    setResource(item); setBusy(id); setError("")
    try {
      const from = new Date(); const to = new Date(); to.setDate(to.getDate() + 30)
      const response = await apiRequest<unknown>(`/self/organizations/${member.organizationId}/bookable-resources/${id}/session-slots?branchId=${branchId}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      setSlots(list(response.data))
    } catch (reason) { setError(humanError(reason, "تعذر تحميل المواعيد المتاحة.")); setSlots([]) }
    finally { setBusy("") }
  }

  async function book(slot: Row) {
    if (!resource) return
    const id = String(slot.id ?? ""); const serviceId = String(resource.serviceId ?? "")
    if (!id || !serviceId) return
    setBusy(id); setError("")
    try {
      const order = await checkout({ type: "BOOKING", targetId: serviceId, quantity: 1, booking: { resourceId: String(resource.id), type: bookingType(resource.resourceType), sessionSlotId: id, seats: 1 } })
      toast.success(invoiceSuccess(order, "تم تسجيل الحجز بنجاح. برجاء السداد في استقبال النادي لتأكيد الموعد."))
      await chooseResource(resource)
    } catch (reason) { setError(humanError(reason, "تعذر إنشاء الحجز والفاتورة.")) }
    finally { setBusy("") }
  }

  async function checkout(line: Record<string, unknown>) {
    return (await apiRequest<Row>(`/self/organizations/${member.organizationId}/members/${member.memberId}/orders`, {
      method: "POST",
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({ sellingBranchId: branchId, memberSegment: "OTHER", lines: [line] }),
    })).data
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
              <ContractSummary contracts={tab === "packages" ? contractsFor(item, "PACKAGE", services) : tab === "services" ? contractsFor(item, "SERVICE", services) : contractsForResource(item, services)} />
              <Button className="mt-4 w-full" size="sm" disabled={Boolean(busy)} onClick={() => tab === "booking" ? void chooseResource(item) : void prepareCheckout(item, tab === "packages" ? "PACKAGE" : "SERVICE")}>{busy === String(item.id) ? <Loader2 className="animate-spin" /> : tab === "booking" ? <CalendarPlus /> : <ShoppingBag />}{tab === "booking" ? "عرض المواعيد المتاحة" : "عرض السعر النهائي"}</Button>
            </article>)}
            {!items.length && <div className="rounded-2xl border border-dashed p-10 text-center lg:col-span-2"><CalendarDays className="mx-auto size-9 text-muted-foreground/50" /><p className="mt-3 text-sm font-bold">لا توجد خيارات منشورة في هذا الفرع حاليًا</p><p className="mt-1 text-xs text-muted-foreground">يمكنك اختيار فرع آخر من القائمة بالأعلى.</p></div>}
          </div>
        )}
        {resource && <div className="mt-5 border-t pt-5"><h3 className="text-sm font-black">المواعيد المتاحة — {String(resource.name ?? "")}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{slots.map((slot, index) => <Button key={String(slot.id ?? index)} variant="outline" className="h-auto justify-between py-3" disabled={Boolean(busy)} onClick={() => void book(slot)}><span>{date(slot.startsAt)}</span><span className="text-[10px] text-muted-foreground">متاح {String(slot.availableCount ?? "")}</span>{busy === String(slot.id) && <Loader2 className="animate-spin" />}</Button>)}{!slots.length && <p className="text-xs text-muted-foreground">لا توجد مواعيد شاغرة خلال الثلاثين يومًا القادمة.</p>}</div></div>}
      </CardContent>
    </Card>
    {pending && <QuoteDialog pending={pending} busy={Boolean(busy)} onClose={() => setPending(undefined)} onConfirm={() => void confirmCheckout()} />}
  </>
}

function QuoteDialog({ pending, busy, onClose, onConfirm }: { pending: PendingCheckout; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const quote = pending.quote
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="member-quote-title" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div className="w-full max-w-lg rounded-3xl border bg-card p-6 shadow-2xl"><div className="flex items-start gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary"><CheckCircle2 /></span><div><p className="text-xs font-bold text-primary">مراجعة الطلب</p><h3 id="member-quote-title" className="mt-1 text-xl font-black">{quote.targetName}</h3></div><Button className="mr-auto" variant="ghost" size="icon" onClick={onClose} disabled={busy} aria-label="إغلاق"><X /></Button></div>
      <dl className="mt-6 space-y-3 rounded-2xl bg-secondary/50 p-4 text-sm"><PriceRow label="السعر قبل الخصم" value={quote.baseAmountMinor} />{Number(quote.discountMinor) > 0 && <PriceRow label={`الخصم${quote.promotion ? ` — ${quote.promotion.name}` : ""}`} value={quote.discountMinor} negative />}<PriceRow label="الصافي قبل الضريبة" value={quote.netMinor} /><PriceRow label="الضريبة" value={quote.taxMinor} /><div className="border-t pt-3"><PriceRow label="الإجمالي المطلوب في الاستقبال" value={quote.grossMinor} strong /></div></dl>
      <p className="mt-4 text-xs leading-6 text-muted-foreground">سيُنشأ الطلب وفاتورة برقم واضح. يكتمل تفعيل الاشتراك أو الخدمة بعد السداد في استقبال النادي.</p>
      <ContractSummary contracts={pending.contracts} expanded />
      <div className="mt-6 flex gap-3"><Button className="flex-1" onClick={onConfirm} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <CreditCard />}تأكيد وإنشاء الفاتورة</Button><Button variant="outline" onClick={onClose} disabled={busy}>رجوع</Button></div>
    </div>
  </div>
}

function PriceRow({ label, value, negative, strong }: { label: string; value: unknown; negative?: boolean; strong?: boolean }) { return <div className={`flex items-center justify-between gap-4 ${strong ? "text-base font-black" : ""}`}><dt>{label}</dt><dd className={negative ? "text-emerald-600" : ""}>{negative ? "− " : ""}{money(value)} ر.س</dd></div> }
function PackageDetails({ item }: { item: Row }) { const entitlements = Array.isArray(item.entitlements) ? item.entitlements as Row[] : []; return <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span className="rounded-lg bg-secondary px-2 py-1">المدة {String(item.durationDays ?? "—")} يوم</span>{item.visitAllowance != null && <span className="rounded-lg bg-secondary px-2 py-1">{String(item.visitAllowance)} زيارة</span>}{entitlements.slice(0, 3).map((value, index) => <span key={String(value.serviceId ?? index)} className="rounded-lg bg-secondary px-2 py-1">{String(value.serviceName ?? "خدمة")}</span>)}</div> }
function list(value: unknown): Row[] { return Array.isArray(value) ? value as Row[] : value && typeof value === "object" && Array.isArray((value as { items?: Row[] }).items) ? (value as { items: Row[] }).items : [] }
function money(value: unknown) { return new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((Number(value) || 0) / 100) }
function date(value: unknown) { const parsed = new Date(String(value)); return Number.isNaN(parsed.getTime()) ? "موعد" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(parsed) }
function bookingType(value: unknown): "COURT" | "CLASS" | "PERSONAL_TRAINING" { const type = String(value); return type === "CLASS" || type === "PERSONAL_TRAINING" ? type : "COURT" }
function invoiceSuccess(order: Row, message: string) { const invoiceNumber = String(order.invoiceNumber ?? ""); return invoiceNumber ? `${message} رقم الفاتورة: ${invoiceNumber}.` : message }
function contractsFor(item: Row, type: "PACKAGE" | "SERVICE", services: Row[]) {
  const relatedServices = type === "SERVICE" ? [item] : (() => {
    const entitlements = Array.isArray(item.entitlements) ? item.entitlements as Row[] : []
    const ids = new Set(entitlements.map(entry => String(entry.serviceId ?? "")))
    return services.filter(service => ids.has(String(service.id ?? "")))
  })()
  const unique = new Map<string, Row>()
  for (const service of relatedServices) for (const activity of Array.isArray(service.activities) ? service.activities as Row[] : []) {
    if (activity.contractContent) unique.set(String(activity.id), activity)
  }
  return [...unique.values()]
}
function contractsForResource(resource: Row, services: Row[]) {
  const service = services.find(item => String(item.id) === String(resource.serviceId))
  return service ? contractsFor(service, "SERVICE", services) : []
}
function ContractSummary({ contracts, expanded = false }: { contracts: Row[]; expanded?: boolean }) {
  if (!contracts.length) return null
  return <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="flex items-center gap-2 text-xs font-black"><FileText className="size-4 text-primary"/>عقود يجب الاطلاع عليها</p><div className="mt-2 space-y-2">{contracts.map(contract => <details key={String(contract.id)} open={expanded} className="rounded-lg bg-card p-3"><summary className="cursor-pointer text-xs font-bold">{String(contract.contractTitle ?? `عقد ${contract.name ?? "النشاط"}`)}</summary><p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{String(contract.contractContent ?? "")}</p><Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => printContract(contract)}><Printer/>طباعة العقد</Button></details>)}</div></div>
}
function printContract(contract: Row) {
  const activityName = String(contract.name ?? "النشاط")
  const title = String(contract.contractTitle ?? `عقد ${activityName}`)
  openBrandedPrintWindow({
    title,
    subtitle: "نسخة بنود عقد النشاط",
    body: `<section class="document-heading"><p class="eyebrow">عقد ممارسة نشاط</p><h1>${escapePrintHtml(title)}</h1></section><section class="document-subject"><span>النشاط</span><strong>${escapePrintHtml(activityName)}</strong><small>تطبق هذه البنود عند الاشتراك في خدمة أو باقة مرتبطة بالنشاط.</small></section><p class="document-preamble">تم إعداد هذه الوثيقة لعرض البنود المعتمدة لممارسة نشاط <strong>${escapePrintHtml(activityName)}</strong>.</p><section class="document-section"><h2>بنود ممارسة النشاط</h2><div class="document-terms">${escapePrintHtml(String(contract.contractContent ?? ""))}</div></section><section class="document-signatures"><div>توقيع المشترك</div><div>توقيع الموظف المختص</div><div>التاريخ</div></section>`,
  })
}
