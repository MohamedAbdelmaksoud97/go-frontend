"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CalendarDays, Check, CheckCircle2, Copy, CreditCard, Eye, EyeOff, FileCheck2, Loader2, LockKeyhole, MapPin, Search, ShieldAlert, TicketPercent, UploadCloud, UserRound, X, XCircle } from "lucide-react"
import { endpoints } from "@/lib/endpoint-catalog"
import { apiRequest, createIdempotencyKey, executeOperation, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { passwordLengthError } from "@/lib/password-policy"
import { type Choice, type FormValues, workflows } from "@/lib/workflows"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/toast-provider"
import { useAppContext } from "@/components/app-context"
import { DateTimeInput } from "@/components/date-time-input"
import { StatusBadge } from "@/components/status-badge"
import { ownerFileValidationError, uploadOwnerFile } from "@/lib/owner-file-upload"

type Props = {
  operationId: string
  organizationId: string
  branchId: string
  onClose: () => void
  onSaved?: () => void
  initialValues?: FormValues
  lockedReferenceLabels?: Record<string, string>
}

type SubscriptionQuote = {
  targetId: string
  targetName: string
  branchId: string
  currency: "SAR"
  baseAmountMinor: string
  discountMinor: string
  netMinor: string
  taxMinor: string
  grossMinor: string
  taxRateBps: number
  taxInclusive: boolean
  promotion?: {
    id: string
    code: string
    name: string
    benefitType: "PERCENTAGE" | "FIXED_AMOUNT"
    benefitValue: number
  }
}

type DataRow = Record<string, unknown>
type CourtAvailabilityState = { key: string; loading: boolean; rules: DataRow[]; error?: string }

type AttendanceSubscriptionState = {
  key: string
  loading: boolean
  items: DataRow[]
  error?: string
}

export function ActionDialog({ operationId, organizationId, branchId, onClose, onSaved, initialValues, lockedReferenceLabels }: Props) {
  const router = useRouter()
  const toast = useToast()
  const appContext = useAppContext()
  const workflow = workflows[operationId]
  const effectiveOrganizationId = organizationId || appContext.organizationId
  const effectiveBranchId = branchId || appContext.branchId || (appContext.branches.length === 1 ? appContext.branches[0]?.id ?? "" : "")
  const context = useMemo(() => ({ organizationId: effectiveOrganizationId, branchId: effectiveBranchId }), [effectiveBranchId, effectiveOrganizationId])
  const [values, setValues] = useState<FormValues>(() => {
    const initial = { ...(workflow?.initial(context) ?? {}), ...initialValues }
    if (operationId === "createManualReservation" && !appContext.canAccess(["sales.checkout"])) initial.billingMode = "OPERATIONAL"
    return initial
  })
  const [options, setOptions] = useState<Record<string, Choice[]>>({})
  const [referenceQueries, setReferenceQueries] = useState<Record<string, string>>({})
  const [loadingOptions, setLoadingOptions] = useState(() => Boolean(hasRuntimeApi() && effectiveBranchId && workflow?.fields.some(field => field.type === "reference" && !lockedReferenceLabels?.[field.name])))
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotError, setSlotError] = useState("")
  const [courtAvailabilityState, setCourtAvailabilityState] = useState<CourtAvailabilityState>({ key: "", loading: false, rules: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [createdEmployee, setCreatedEmployee] = useState<{ id: string; number: string; name: string }>()
  const [createdBookingInvoice, setCreatedBookingInvoice] = useState<{ invoiceId: string; invoiceNumber: string; grossMinor: string }>()
  const [quoteState, setQuoteState] = useState<{ key: string; loading: boolean; quote?: SubscriptionQuote; error?: string }>({ key: "", loading: false })
  const [bookingQuoteState, setBookingQuoteState] = useState<{ key: string; loading: boolean; quote?: SubscriptionQuote; error?: string }>({ key: "", loading: false })
  const [appliedPromoCode, setAppliedPromoCode] = useState("")
  const [promoApplyVersion, setPromoApplyVersion] = useState(0)
  const isManualAttendance = operationId === "recordManualAttendance"
  const initialAttendanceMemberId = isManualAttendance ? String(initialValues?.memberId ?? "") : ""
  const [attendanceSubscriptionsState, setAttendanceSubscriptionsState] = useState<AttendanceSubscriptionState>(() => ({ key: initialAttendanceMemberId, loading: Boolean(initialAttendanceMemberId), items: [] }))
  const [attendanceResult, setAttendanceResult] = useState<DataRow>()
  const isSubscriptionSale = operationId === "createSubscription"
  const isManualReservation = operationId === "createManualReservation"
  const canCreatePaidBooking = appContext.canAccess(["sales.checkout"])
  const isPaidBooking = isManualReservation && values.billingMode === "INVOICE"
  const selectedMemberId = String(values.memberId ?? "")
  const selectedMember = options.memberId?.find(choice => choice.value === selectedMemberId)?.meta
  const attendanceSubscriptions = attendanceSubscriptionsState.key === selectedMemberId ? attendanceSubscriptionsState.items : []
  const attendanceSubscriptionsError = attendanceSubscriptionsState.key === selectedMemberId ? attendanceSubscriptionsState.error ?? "" : ""
  const attendanceSubscriptionsLoading = Boolean(selectedMemberId && (attendanceSubscriptionsState.key !== selectedMemberId || attendanceSubscriptionsState.loading))
  const selectedPackageId = String(values.packageId ?? "")
  const selectedResourceId = String(values.resourceId ?? "")
  const selectedResourceType = String(values.resourceType ?? "")
  const selectedServiceId = String(values.serviceId ?? "")
  const bookingQuantity = selectedResourceType === "CLASS" ? Number(values.seats) : 1
  const bookingQuoteKey = `${effectiveBranchId}:${selectedServiceId}:${Number.isInteger(bookingQuantity) ? bookingQuantity : 0}`
  const bookingQuote = bookingQuoteState.key === bookingQuoteKey ? bookingQuoteState.quote : undefined
  const bookingQuoteError = bookingQuoteState.key === bookingQuoteKey ? bookingQuoteState.error ?? "" : ""
  const bookingQuoteLoading = Boolean(isPaidBooking && selectedServiceId && selectedResourceId && (bookingQuoteState.key !== bookingQuoteKey || bookingQuoteState.loading))
  const courtAvailability: CourtAvailabilityState = courtAvailabilityState.key === selectedResourceId ? courtAvailabilityState : { key: selectedResourceId, loading: Boolean(selectedResourceId && selectedResourceType === "COURT"), rules: [] }
  const courtAvailabilityMissing = selectedResourceType === "COURT" && selectedResourceId !== "" && !courtAvailability.loading && !courtAvailability.error && courtAvailability.rules.length === 0
  const normalizedPromoCode = appliedPromoCode.trim().toUpperCase()
  const quoteKey = `${effectiveBranchId}:${selectedPackageId}:${normalizedPromoCode}:${promoApplyVersion}`
  const subscriptionQuote = quoteState.key === quoteKey ? quoteState.quote : undefined
  const quoteError = quoteState.key === quoteKey ? quoteState.error ?? "" : ""
  const quoteLoading = Boolean(selectedPackageId && (quoteState.key !== quoteKey || quoteState.loading))
  const effectiveBranchName = appContext.branches.find(branch => branch.id === effectiveBranchId)?.nameAr
    ?? appContext.branches.find(branch => branch.id === effectiveBranchId)?.name
    ?? "الفرع المحدد"
  const visibleFields = workflow?.fields
    .filter(field => isVisibleField(operationId, field.name, values) && (field.type !== "file" || appContext.canAccess(["files.manage"])))
    .map(field => field.name === "billingMode" ? { ...field, options: field.options?.map(option => option.value === "INVOICE" ? { ...option, disabled: !canCreatePaidBooking } : option) } : field) ?? []

  useEffect(() => {
    if (!workflow || !hasRuntimeApi()) return
    if (!effectiveOrganizationId || !effectiveBranchId) return
    const referenceFields = workflow.fields.filter(field => field.type === "reference" && field.source && !lockedReferenceLabels?.[field.name])
    if (!referenceFields.length) return
    let cancelled = false
    const timer = window.setTimeout(() => { if (!cancelled) setLoadingOptions(true); void Promise.all(referenceFields.map(async field => {
      try {
        const path = referencePath(field.source!.path(context), field.source!.searchParam, referenceQueries[field.name])
        const response = await apiRequest<unknown>(path)
        const payload = response.data
        const list = Array.isArray(payload) ? payload : payload && typeof payload === "object" && "items" in payload ? (payload as { items: unknown[] }).items : []
        const available = field.name === "packageId"
          ? await sellablePackages(list, effectiveOrganizationId, effectiveBranchId)
          : field.name === "resourceId"
            ? list.filter(item => item && typeof item === "object" && (item as Record<string, unknown>).status === "ACTIVE")
          : list
        return [field.name, available.flatMap(item => toChoice(item, field.source!.labelKeys, field.source!.subtitleKeys, field.name === "positionId"))] as const
      } catch { return [field.name, []] as const }
    })).then(entries => { if (!cancelled) setOptions(Object.fromEntries(entries)) }).finally(() => { if (!cancelled) setLoadingOptions(false) }) }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [context, effectiveBranchId, effectiveOrganizationId, lockedReferenceLabels, referenceQueries, workflow])

  useEffect(() => {
    if (!isManualAttendance || !selectedMemberId || !effectiveOrganizationId || !hasRuntimeApi()) return
    let cancelled = false
    void loadAllAttendanceSubscriptions(effectiveOrganizationId, selectedMemberId)
      .then(items => {
        if (cancelled) return
        setAttendanceSubscriptionsState({ key: selectedMemberId, loading: false, items })
      })
      .catch(reason => {
        if (cancelled) return
        setAttendanceSubscriptionsState({ key: selectedMemberId, loading: false, items: [], error: humanError(reason, "تعذر تحميل اشتراكات العضو. يمكنك إعادة اختيار العضو للمحاولة مجددًا.") })
      })
    return () => { cancelled = true }
  }, [effectiveOrganizationId, isManualAttendance, selectedMemberId])

  useEffect(() => {
    if (operationId !== "createManualReservation" || values.resourceType === "COURT" || !values.resourceId || !effectiveOrganizationId || !hasRuntimeApi()) return
    let cancelled = false
    const from = new Date()
    const to = new Date(from.getTime() + 30 * 86_400_000)
    void apiRequest<unknown>(`/organizations/${effectiveOrganizationId}/bookable-resources/${String(values.resourceId)}/session-slots?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      .then(response => {
        if (cancelled) return
        const payload = response.data
        const list = Array.isArray(payload) ? payload : payload && typeof payload === "object" && "items" in payload ? (payload as { items: unknown[] }).items : []
        setOptions(current => ({ ...current, sessionSlotId: list.flatMap(sessionSlotChoice) }))
      })
      .catch(reason => { if (!cancelled) setSlotError(humanError(reason, "تعذر تحميل المواعيد المتاحة لهذا المورد.")) })
      .finally(() => { if (!cancelled) setLoadingSlots(false) })
    return () => { cancelled = true }
  }, [effectiveOrganizationId, operationId, values.resourceId, values.resourceType])

  useEffect(() => {
    if (operationId !== "createManualReservation" || selectedResourceType !== "COURT" || !selectedResourceId || !effectiveOrganizationId || !hasRuntimeApi()) return
    let cancelled = false
    void apiRequest<unknown>(`/organizations/${effectiveOrganizationId}/bookable-resources/${selectedResourceId}/availability-rules`)
      .then(response => {
        if (cancelled) return
        const payload = response.data
        const rules = Array.isArray(payload) ? payload as DataRow[] : payload && typeof payload === "object" && "items" in payload ? (payload as { items: DataRow[] }).items : []
        setCourtAvailabilityState({ key: selectedResourceId, loading: false, rules })
      })
      .catch(reason => {
        if (!cancelled) setCourtAvailabilityState({ key: selectedResourceId, loading: false, rules: [], error: humanError(reason, "تعذر التحقق من ساعات إتاحة هذا المورد.") })
      })
    return () => { cancelled = true }
  }, [effectiveOrganizationId, operationId, selectedResourceId, selectedResourceType])

  useEffect(() => {
    if (!isSubscriptionSale || !selectedPackageId || !effectiveOrganizationId || !effectiveBranchId || !hasRuntimeApi()) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!cancelled) setQuoteState({ key: quoteKey, loading: true })
      void apiRequest<SubscriptionQuote>(`/organizations/${effectiveOrganizationId}/quotes`, {
        method: "POST",
        body: JSON.stringify({ branchId: effectiveBranchId, targetType: "PACKAGE", targetId: selectedPackageId, quantity: 1, memberSegment: "OTHER", ...(normalizedPromoCode ? { promoCode: normalizedPromoCode } : {}) }),
      }).then(response => {
        if (!cancelled) setQuoteState({ key: quoteKey, loading: false, quote: response.data })
      }).catch(reason => {
        if (!cancelled) setQuoteState({ key: quoteKey, loading: false, error: humanError(reason, "تعذر التحقق من سعر الباقة في الفرع الحالي.") })
      })
    }, 180)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [effectiveBranchId, effectiveOrganizationId, isSubscriptionSale, normalizedPromoCode, quoteKey, selectedPackageId])

  useEffect(() => {
    if (!isPaidBooking || !selectedServiceId || !selectedResourceId || !effectiveOrganizationId || !effectiveBranchId || !hasRuntimeApi()) return
    if (!Number.isInteger(bookingQuantity) || bookingQuantity < 1) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!cancelled) setBookingQuoteState({ key: bookingQuoteKey, loading: true })
      void apiRequest<SubscriptionQuote>(`/organizations/${effectiveOrganizationId}/quotes`, {
        method: "POST",
        body: JSON.stringify({ branchId: effectiveBranchId, targetType: "SERVICE", targetId: selectedServiceId, quantity: bookingQuantity, memberSegment: "OTHER" }),
      }).then(response => {
        if (!cancelled) setBookingQuoteState({ key: bookingQuoteKey, loading: false, quote: response.data })
      }).catch(reason => {
        if (!cancelled) setBookingQuoteState({ key: bookingQuoteKey, loading: false, error: humanError(reason, "تعذر تسعير هذا الحجز في الفرع الحالي. تأكد من إضافة سعر نشط للخدمة المرتبطة بالمورد.") })
      })
    }, 180)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [bookingQuantity, bookingQuoteKey, effectiveBranchId, effectiveOrganizationId, isPaidBooking, selectedResourceId, selectedServiceId])

  if (!workflow) return null
  const operation = endpoints.find(item => item.operationId === operationId)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!effectiveOrganizationId || !effectiveBranchId) { setError("تعذر تحديد فرع العمل. ارجع إلى اختيار سياق العمل وحدد الفرع ثم حاول مجددًا."); return }
    if (!operation && !isSubscriptionSale && !isPaidBooking) { setError("تعذر تجهيز العملية المطلوبة. حدّث الصفحة ثم حاول مجددًا."); return }
    const validationError = await validateValues(operationId, values)
    if (validationError) { setError(validationError); return }
    if (isManualReservationWithoutCourtAvailability(values, courtAvailability)) { setError("لا يمكن تأكيد الحجز قبل إضافة ساعات إتاحة لهذا المورد."); return }
    if (isSubscriptionSale && !subscriptionQuote) { setError(quoteError || "انتظر حتى يتم التحقق من سعر الباقة في الفرع الحالي."); return }
    if (isPaidBooking && !canCreatePaidBooking) { setError("لا تملك صلاحية إنشاء طلب بيع وفاتورة. اختر حجزًا تشغيليًا أو اطلب صلاحية المبيعات."); return }
    if (isPaidBooking && !bookingQuote) { setError(bookingQuoteError || "انتظر حتى يتم التحقق من سعر الخدمة المرتبطة بالحجز."); return }
    setSaving(true); setError("")
    try {
      // executeOperation receives endpoint-catalog paths as complete API paths.
      // The subscription sale is routed through Sales checkout, so it must carry
      // the same /api/v1 prefix instead of being mistaken for a Next.js-local path.
      const path = isSubscriptionSale || isPaidBooking ? `/api/v1/organizations/${effectiveOrganizationId}/orders` : operation!.path.replace("{organizationId}", effectiveOrganizationId).replace("{branchId}", effectiveBranchId)
      const body = isSubscriptionSale ? {
        sellingBranchId: effectiveBranchId,
        memberId: values.memberId,
        memberSegment: "OTHER",
        lines: [{ type: "MEMBERSHIP", targetId: values.packageId, quantity: 1, accessBranchId: effectiveBranchId, startAt: new Date(String(values.startAt)).toISOString(), ...(normalizedPromoCode ? { promoCode: normalizedPromoCode } : {}) }],
      } : isPaidBooking ? {
        sellingBranchId: effectiveBranchId,
        ...(values.customerType === "MEMBER" ? { memberId: values.memberId } : {}),
        memberSegment: "OTHER",
        lines: [{
          type: "BOOKING",
          targetId: values.serviceId,
          quantity: bookingQuantity,
          booking: {
            resourceId: values.resourceId,
            type: values.resourceType,
            seats: bookingQuantity,
            participantCount: selectedResourceType === "COURT" ? Number(values.participantCount) : bookingQuantity,
            ...(values.customerType === "VISITOR" ? {
              guestName: String(values.guestName ?? "").trim(),
              guestPhoneE164: String(values.guestPhoneE164 ?? "").replace(/[\s()-]/gu, ""),
              ...(String(values.guestEmail ?? "").trim() ? { guestEmail: String(values.guestEmail).trim().toLowerCase() } : {}),
            } : {}),
            ...(selectedResourceType === "COURT"
              ? { startsAt: new Date(String(values.startsAt)).toISOString(), endsAt: new Date(String(values.endsAt)).toISOString() }
              : { sessionSlotId: values.sessionSlotId }),
          },
        }],
      } : workflow.body(values, context)
      const response = hasRuntimeApi() ? await executeOperation<Record<string, unknown>>(path, isSubscriptionSale || isPaidBooking ? "post" : operation!.method, {}, body, isSubscriptionSale || isPaidBooking || operation!.idempotent ? createIdempotencyKey() : undefined) : undefined
      if (isManualAttendance && response?.data.decision) {
        setAttendanceResult(response.data)
        if (response.data.decision === "ACCEPTED") toast.success("تم السماح للعضو بالدخول وتسجيل المحاولة بنجاح.")
        else toast.error(`تم رفض الدخول: ${attendanceRejectionLabel(String(response.data.rejectionReason ?? ""))}`)
        onSaved?.()
        return
      }
      if (["createEmployee", "registerMember"].includes(operationId) && response?.data.id) {
        const ownerId = String(response.data.id)
        const owner = operationId === "createEmployee" ? { module: "workforce" as const, type: "EMPLOYEE" as const } : { module: "members" as const, type: "MEMBER" as const }
        const uploads = [
          values.identityImage instanceof File ? { label: "صورة الهوية", kind: "IDENTITY" as const, file: values.identityImage } : undefined,
          values.profileImage instanceof File ? { label: operationId === "createEmployee" ? "صورة الموظف" : "صورة العضو", kind: "PROFILE" as const, file: values.profileImage } : undefined,
        ].filter((item): item is { label: string; kind: "IDENTITY" | "PROFILE"; file: File } => item !== undefined)
        const failures: string[] = []
        for (const upload of uploads) {
          try {
            await uploadOwnerFile(effectiveOrganizationId, ownerId, owner, upload.kind, upload.file)
          } catch (reason) {
            failures.push(`${upload.label}: ${humanError(reason, "تعذر رفع الملف إلى مساحة التخزين.")}`)
          }
        }
        if (failures.length > 0) {
          toast.warning(`تم إنشاء ${operationId === "createEmployee" ? "الموظف وحسابه" : "العضو"}، لكن لم يكتمل رفع الملفات: ${failures.join(" — ")}`)
        }
      }
      const invoiceNumber = response?.data.invoiceNumber
      if (isPaidBooking && response?.data.invoiceId) {
        setCreatedBookingInvoice({ invoiceId: String(response.data.invoiceId), invoiceNumber: String(invoiceNumber ?? ""), grossMinor: String(response.data.grossMinor ?? bookingQuote?.grossMinor ?? "0") })
        toast.success(`تم إنشاء الحجز والفاتورة${invoiceNumber ? ` رقم ${String(invoiceNumber)}` : ""}. الحجز الآن بانتظار التحصيل.`)
        onSaved?.()
        return
      }
      const employeeNumber = operationId === "createEmployee" ? String(response?.data.employeeNumber ?? "") : ""
      if (employeeNumber && response?.data.id) {
        setCreatedEmployee({ id: String(response.data.id), number: employeeNumber, name: String(response.data.name ?? values.fullNameAr ?? "الموظف") })
        toast.success("تم إنشاء الموظف وحساب الدخول بنجاح.")
        onSaved?.()
        return
      }
      toast.success(isSubscriptionSale && invoiceNumber ? `تم إنشاء الاشتراك والفاتورة رقم ${String(invoiceNumber)}. سيُفعّل الاشتراك تلقائيًا بعد تحصيل الفاتورة.` : workflow.successMessage); onSaved?.(); onClose()
    } catch (reason) { setError(humanError(reason, isSubscriptionSale ? "تعذر إنشاء الاشتراك والفاتورة." : isPaidBooking ? "تعذر إنشاء الحجز وفاتورته. راجع السعر والموعد ثم حاول مجددًا." : `تعذر تنفيذ «${workflow.title}».`)) }
    finally { setSaving(false) }
  }

  return <div className="fixed inset-0 z-[80] grid place-items-end bg-black/65 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section dir="rtl" role="dialog" aria-modal="true" aria-labelledby="action-title" className={`max-h-[94vh] w-full overflow-y-auto rounded-t-[28px] border bg-card shadow-2xl sm:rounded-[28px] ${isManualAttendance ? "sm:max-w-4xl" : "sm:max-w-2xl"}`}>
      <header className="sticky top-0 z-10 flex items-start gap-4 border-b bg-card/95 p-5 backdrop-blur sm:p-6">
        <div className="min-w-0"><p className="text-[11px] font-bold text-amber-600 dark:text-primary">إجراء جديد</p><h2 id="action-title" className="mt-1 text-xl font-black">{workflow.title}</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">{workflow.description}</p>{(isSubscriptionSale || isPaidBooking) && effectiveBranchId && <p className="mt-2 text-xs font-bold text-primary">فرع البيع والتحصيل: {effectiveBranchName}</p>}</div>
        <Button variant="ghost" size="icon" className="mr-auto" onClick={onClose} aria-label="إغلاق"><X /></Button>
      </header>
      {createdEmployee ? <section className="p-5 sm:p-6" aria-live="polite">
        <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/[.07] p-6 text-center">
          <CheckCircle2 className="mx-auto size-12 text-emerald-600"/>
          <h3 className="mt-4 text-xl font-black">تم إنشاء الموظف وحساب الدخول</h3>
          <p className="mt-2 text-sm text-muted-foreground">سلّم الرقم الوظيفي التالي إلى {createdEmployee.name} لاستخدامه مع كلمة المرور عند تسجيل الدخول.</p>
          <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-primary/30 bg-background p-5">
            <p className="text-xs font-bold text-muted-foreground">الرقم الوظيفي للدخول</p>
            <strong className="mt-2 block text-3xl font-black tracking-wider text-primary" dir="ltr">{createdEmployee.number}</strong>
            <Button type="button" variant="outline" className="mt-4 w-full" onClick={() => void navigator.clipboard.writeText(createdEmployee.number).then(() => toast.success("تم نسخ الرقم الوظيفي.")).catch(() => toast.error("تعذر النسخ تلقائيًا؛ حدّد الرقم وانسخه يدويًا."))}><Copy/>نسخ الرقم الوظيفي</Button>
          </div>
          <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={onClose}>إغلاق</Button><Button type="button" onClick={() => { onClose(); router.push(`/employees/${createdEmployee.id}`) }}>فتح ملف الموظف</Button></div>
        </div>
      </section> : createdBookingInvoice ? <section className="p-5 sm:p-6" aria-live="polite">
        <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/[.07] p-6 text-center">
          <CheckCircle2 className="mx-auto size-12 text-emerald-600"/>
          <h3 className="mt-4 text-xl font-black">تم إنشاء الحجز والفاتورة</h3>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">تم حفظ السعة للحجز بحالة «بانتظار الدفع». سيتحول إلى «مؤكد» تلقائيًا فور اكتمال تحصيل الفاتورة.</p>
          <div className="mx-auto mt-6 grid max-w-md gap-3 rounded-2xl border bg-background p-5 sm:grid-cols-2">
            <div><p className="text-[10px] font-bold text-muted-foreground">رقم الفاتورة</p><strong className="mt-1 block text-base font-black" dir="ltr">{createdBookingInvoice.invoiceNumber || "—"}</strong></div>
            <div><p className="text-[10px] font-bold text-muted-foreground">المبلغ المطلوب</p><strong className="mt-1 block text-base font-black text-emerald-700 dark:text-emerald-400">{formatMoney(createdBookingInvoice.grossMinor, "SAR")}</strong></div>
          </div>
          <p className="mx-auto mt-4 max-w-md rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs leading-6 text-blue-700 dark:text-blue-300">في نقطة البيع يمكنك تحصيل المبلغ كاملًا بطريقة واحدة أو تقسيمه على وسيلتين، مثل جزء نقدي وجزء بالبطاقة.</p>
          <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={onClose}>العودة إلى الحجوزات</Button><Button type="button" onClick={() => { onClose(); router.push(`/cashier?invoiceId=${encodeURIComponent(createdBookingInvoice.invoiceId)}`) }}><CreditCard/>الذهاب إلى التحصيل</Button></div>
        </div>
      </section> : attendanceResult ? <AttendanceDecisionResult result={attendanceResult} member={selectedMember} subscriptions={attendanceSubscriptions} branchName={effectiveBranchName} onClose={onClose} onAgain={() => {
        setAttendanceResult(undefined)
        setValues(workflow.initial(context))
        setAttendanceSubscriptionsState({ key: "", loading: false, items: [] })
        setReferenceQueries({})
      }} /> : <form onSubmit={submit} className="p-5 sm:p-6">
        {workflow.confirm && <div className="mb-5 flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 text-xs leading-6"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" /><p>{workflow.confirm}</p></div>}
        <div className="grid gap-5 sm:grid-cols-2">{visibleFields.map(field => <Field key={field.name} field={field} value={values[field.name]} choices={options[field.name]} loading={loadingOptions || (field.name === "sessionSlotId" && loadingSlots)} lockedLabel={lockedReferenceLabels?.[field.name]} referenceQuery={referenceQueries[field.name] ?? ""} onReferenceSearch={query => setReferenceQueries(current => ({ ...current, [field.name]: query }))} onChange={value => {
          setError("")
          if (isManualAttendance && field.name === "memberId") {
            const memberId = String(value ?? "")
            setAttendanceResult(undefined)
            setAttendanceSubscriptionsState({ key: memberId, loading: Boolean(memberId), items: [] })
            setValues(current => ({ ...current, memberId: value }))
            return
          }
          if (isManualReservation && field.name === "customerType") {
            setValues(current => ({ ...current, customerType: value, memberId: value === "VISITOR" ? "" : current.memberId, billingMode: !canCreatePaidBooking ? "OPERATIONAL" : current.billingMode || "INVOICE" }))
            return
          }
          if (operationId !== "createManualReservation" || field.name !== "resourceId") { setValues(current => ({ ...current, [field.name]: value })); return }
          const resource = options.resourceId?.find(choice => choice.value === value)?.meta
          const resourceType = String(resource?.type ?? resource?.resourceType ?? "")
          setSlotError(""); setLoadingSlots(resourceType !== "COURT"); setOptions(current => ({ ...current, sessionSlotId: [] }))
          setCourtAvailabilityState({ key: String(value ?? ""), loading: resourceType === "COURT", rules: [] })
          setValues(current => ({ ...current, resourceId: value, resourceType, serviceId: String(resource?.serviceId ?? ""), sessionSlotId: "", seats: resourceType === "CLASS" ? current.seats : "1", participantCount: resourceType === "COURT" ? current.participantCount || "1" : "1" }))
        }} />)}</div>
        {isManualReservation && values.billingMode === "OPERATIONAL" && <div className="mt-5 flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 text-xs leading-6 text-amber-800 dark:text-amber-300"><AlertTriangle className="mt-0.5 size-5 shrink-0"/><div><p className="font-black">حجز تشغيلي بلا مقابل</p><p className="mt-1">سيُؤكد الحجز مباشرة من دون طلب بيع أو فاتورة. استخدمه فقط للحجوزات المجانية أو الإدارية؛ لن يظهر مبلغ لتحصيله لاحقًا.</p>{!canCreatePaidBooking && <p className="mt-1 font-bold">خيار الفاتورة غير متاح لأن حسابك لا يملك صلاحية إنشاء المبيعات.</p>}</div></div>}
        {isManualReservation && isPaidBooking && selectedServiceId && <BookingPricePreview quote={bookingQuote} loading={bookingQuoteLoading} error={bookingQuoteError} />}
        {operationId === "createManualReservation" && selectedResourceType === "COURT" && selectedResourceId && <div className={`mt-5 rounded-2xl border p-4 text-xs leading-6 ${courtAvailabilityMissing ? "border-red-500/25 bg-red-500/8" : courtAvailability.error ? "border-amber-500/25 bg-amber-500/8" : "border-blue-500/20 bg-blue-500/5"}`}>
          {courtAvailability.loading ? <p className="flex items-center gap-2 font-bold"><Loader2 className="size-4 animate-spin" />جارٍ التحقق من ساعات إتاحة الملعب...</p> : courtAvailabilityMissing ? <div><p className="font-black text-red-600">هذا المورد غير جاهز للحجز</p><p className="mt-1 text-muted-foreground">لم تُضف له أيام وساعات إتاحة بعد، لذلك سيرفض الخادم أي وقت يتم اختياره.</p>{appContext.canAccess(["bookings.facilities.manage"]) && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { onClose(); router.push("/system-settings/bookable-resources") }}><CalendarDays />فتح إعداد إتاحة الموارد</Button>}</div> : courtAvailability.error ? <p className="font-bold text-amber-700">{courtAvailability.error}</p> : <div><p className="font-black text-blue-700 dark:text-blue-400">ساعات الحجز المتاحة</p><p className="mt-1 text-muted-foreground">{courtAvailability.rules.map(availabilityRuleLabel).join(" · ")}</p><p className="mt-1 text-muted-foreground">يجب أن يبدأ الحجز وينتهي في اليوم نفسه وداخل إحدى هذه الفترات.</p></div>}
        </div>}
        {slotError && <p role="alert" className="mt-5 rounded-xl bg-red-500/10 p-3 text-xs font-semibold text-red-600">{slotError}</p>}
        {isSubscriptionSale && selectedPackageId && <PromoCodeControl
          value={String(values.promoCode ?? "")}
          appliedCode={normalizedPromoCode}
          quote={subscriptionQuote}
          loading={quoteLoading}
          error={quoteError}
          onChange={value => { setError(""); setValues(current => ({ ...current, promoCode: value.toUpperCase() })) }}
          onApply={() => {
            const code = String(values.promoCode ?? "").trim().toUpperCase()
            if (!code) { setError("أدخل كود الخصم أولًا ثم اضغط «تطبيق الكود»."); return }
            setError("")
            setValues(current => ({ ...current, promoCode: code }))
            setAppliedPromoCode(code)
            setPromoApplyVersion(current => current + 1)
          }}
          onRemove={() => {
            setError("")
            setValues(current => ({ ...current, promoCode: "" }))
            setAppliedPromoCode("")
            setPromoApplyVersion(current => current + 1)
          }}
        />}
        {isSubscriptionSale && selectedPackageId && <SubscriptionPricePreview quote={subscriptionQuote} loading={quoteLoading} error={quoteError} />}
        {isManualAttendance && selectedMemberId && <AttendanceMemberPreview member={selectedMember} lockedMemberLabel={lockedReferenceLabels?.memberId} subscriptions={attendanceSubscriptions} loading={attendanceSubscriptionsLoading} error={attendanceSubscriptionsError} branchId={effectiveBranchId} branches={appContext.branches} />}
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-500/10 p-3 text-xs font-semibold text-red-600">{error}</p>}
        <footer className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row"><Button type="button" variant="outline" size="lg" onClick={onClose}>إلغاء</Button><Button type="submit" size="lg" className="sm:mr-auto sm:min-w-40" disabled={saving}>{saving && <Loader2 className="animate-spin" />}{isPaidBooking ? "إنشاء الحجز والفاتورة" : isManualReservation ? "تأكيد الحجز بلا مقابل" : workflow.submitLabel}</Button></footer>
      </form>}
    </section>
  </div>
}

function AttendanceMemberPreview({ member, lockedMemberLabel, subscriptions, loading, error, branchId, branches }: {
  member?: DataRow
  lockedMemberLabel?: string
  subscriptions: DataRow[]
  loading: boolean
  error: string
  branchId: string
  branches: Array<{ id: string; nameAr?: string; name?: string }>
}) {
  const memberName = String(member?.name ?? member?.fullNameAr ?? member?.memberName ?? lockedMemberLabel ?? "العضو المحدد")
  const memberNumber = String(member?.memberNumber ?? member?.legacyMemberNumber ?? subscriptions[0]?.memberNumber ?? "")
  const memberStatus = String(member?.status ?? "")
  const blocked = member?.isBlocked === true || subscriptions.some(subscription => subscription.memberIsBlocked === true)
  const blockedReason = String(member?.blockedReason ?? "")

  return <section className="mt-5 overflow-hidden rounded-2xl border bg-secondary/20" aria-live="polite">
    <div className="flex flex-wrap items-start gap-3 border-b bg-card/70 p-4">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${blocked || (memberStatus && memberStatus !== "ACTIVE") ? "bg-red-500/10 text-red-600" : "bg-primary/10 text-primary"}`}><UserRound className="size-5" /></span>
      <div className="min-w-0 flex-1"><p className="font-black">{memberName}</p>{memberNumber && <p className="mt-1 text-xs text-muted-foreground">رقم العضوية: <span dir="ltr">{memberNumber}</span></p>}</div>
      <div className="flex flex-wrap gap-2">{memberStatus && <StatusBadge status={memberStatus}/>} {blocked && <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-600"><ShieldAlert className="size-3.5"/>محظور</span>}</div>
      {blocked && <p className="w-full rounded-xl border border-red-500/20 bg-red-500/8 p-3 text-xs font-semibold leading-6 text-red-600">هذا العضو محظور ولن يُسمح له بالدخول.{blockedReason ? ` السبب: ${blockedReason}` : ""}</p>}
    </div>
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-black">اشتراكات العضو</h3><p className="mt-1 text-[11px] text-muted-foreground">تُعرض جميع الاشتراكات المتاحة لصلاحياتك، والقرار النهائي يصدر عند التحقق.</p></div>{!loading && !error && <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold">{subscriptions.length}</span>}</div>
      {loading ? <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin"/>جارٍ تحميل تفاصيل الاشتراكات...</div>
        : error ? <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/8 p-3 text-xs font-semibold leading-6 text-red-600">{error}</p>
          : subscriptions.length === 0 ? <p className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-4 text-xs font-semibold leading-6 text-amber-700 dark:text-amber-300">لا توجد اشتراكات مسجلة لهذا العضو ضمن نطاق صلاحياتك؛ من المتوقع رفض الدخول.</p>
            : <div className="max-h-[42vh] space-y-3 overflow-y-auto pl-1">{subscriptions.map(subscription => <AttendanceSubscriptionCard key={String(subscription.id)} subscription={subscription} branchId={branchId} branches={branches}/>)}</div>}
    </div>
  </section>
}

function AttendanceSubscriptionCard({ subscription, branchId, branches }: { subscription: DataRow; branchId: string; branches: Array<{ id: string; nameAr?: string; name?: string }> }) {
  const snapshot = isDataRow(subscription.commercialSnapshot) ? subscription.commercialSnapshot : {}
  const entitlements = Array.isArray(subscription.entitlements) ? subscription.entitlements.filter(isDataRow) : []
  const packageName = String(snapshot.packageName ?? subscription.packageName ?? "باقة العضو")
  const allowance = finiteNumber(subscription.visitAllowance)
  const used = finiteNumber(subscription.visitsUsed) ?? 0
  const remaining = allowance === undefined ? undefined : Math.max(0, allowance - used)
  const eligibility = attendanceSubscriptionEligibility(subscription, branchId)
  const accessLabel = subscription.branchAccessPolicy === "ALL_ORGANIZATION_BRANCHES"
    ? "جميع فروع المؤسسة"
    : (Array.isArray(subscription.allowedBranchIds) ? subscription.allowedBranchIds : []).map(id => attendanceBranchName(String(id), branches)).join("، ") || attendanceBranchName(String(subscription.sellingBranchId ?? ""), branches)

  return <article className={`rounded-2xl border p-4 ${eligibility.eligible ? "border-emerald-500/30 bg-emerald-500/[.04]" : "bg-card"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="font-black">{packageName}</p><p className="mt-1 text-[11px] text-muted-foreground">اشتراك <span dir="ltr">{String(subscription.subscriptionNumber ?? "—")}</span></p></div>
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={String(subscription.status ?? "غير محدد")}/><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${eligibility.eligible ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-600"}`}>{eligibility.label}</span></div>
    </div>
    <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
      <AttendanceDetail icon={CalendarDays} label="مدة الاشتراك" value={`${attendanceDate(subscription.termStart)} — ${attendanceDate(subscription.termEnd)}`}/>
      <AttendanceDetail icon={CreditCard} label="الزيارات" value={allowance === undefined ? "غير محدودة" : `${remaining} متبقية من ${allowance} · المستخدم ${used}`}/>
      <AttendanceDetail icon={MapPin} label="صلاحية الفروع" value={accessLabel}/>
      <AttendanceDetail icon={CheckCircle2} label="الاستخدام في الفرع الحالي" value={eligibility.eligible ? "متاح مبدئيًا" : eligibility.label}/>
    </dl>
    {entitlements.length > 0 && <div className="mt-4 border-t pt-3"><p className="text-[11px] font-black">الخدمات المشمولة</p><div className="mt-2 flex flex-wrap gap-2">{entitlements.map((entitlement, index) => {
      const serviceAllowance = finiteNumber(entitlement.visitAllowance)
      const serviceUsed = finiteNumber(entitlement.visitsUsed) ?? 0
      const serviceRemaining = serviceAllowance === undefined ? "غير محدودة" : `${Math.max(0, serviceAllowance - serviceUsed)} من ${serviceAllowance} متبقية`
      return <span key={String(entitlement.id ?? index)} className="rounded-lg bg-secondary px-2.5 py-1.5 text-[10px] font-semibold">{String(entitlement.serviceNameSnapshot ?? entitlement.serviceCodeSnapshot ?? "خدمة")} · {serviceRemaining}</span>
    })}</div></div>}
  </article>
}

function AttendanceDetail({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return <div className="rounded-xl bg-background/70 p-3"><dt className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground"><Icon className="size-3.5"/>{label}</dt><dd className="mt-1.5 font-bold leading-5">{value}</dd></div>
}

function AttendanceDecisionResult({ result, member, subscriptions, branchName, onAgain, onClose }: { result: DataRow; member?: DataRow; subscriptions: DataRow[]; branchName: string; onAgain: () => void; onClose: () => void }) {
  const accepted = result.decision === "ACCEPTED"
  const subscription = subscriptions.find(item => String(item.id) === String(result.subscriptionId ?? ""))
  const snapshot = subscription && isDataRow(subscription.commercialSnapshot) ? subscription.commercialSnapshot : {}
  const memberName = String(member?.name ?? member?.fullNameAr ?? member?.memberName ?? subscription?.memberName ?? "العضو المحدد")
  const memberNumber = String(member?.memberNumber ?? member?.legacyMemberNumber ?? subscription?.memberNumber ?? "")
  const rejection = attendanceRejectionLabel(String(result.rejectionReason ?? ""))

  return <section className="p-5 sm:p-6" aria-live="assertive">
    <div className={`rounded-3xl border p-6 text-center ${accepted ? "border-emerald-500/35 bg-emerald-500/[.07]" : "border-red-500/35 bg-red-500/[.07]"}`}>
      {accepted ? <CheckCircle2 className="mx-auto size-14 text-emerald-600"/> : <XCircle className="mx-auto size-14 text-red-600"/>}
      <p className={`mt-4 text-xs font-black ${accepted ? "text-emerald-700 dark:text-emerald-300" : "text-red-600"}`}>{accepted ? "موافقة" : "رفض"}</p>
      <h3 className="mt-1 text-2xl font-black">{accepted ? "تم السماح بالدخول" : "تم رفض الدخول"}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{memberName}{memberNumber ? ` · رقم العضوية ${memberNumber}` : ""}</p>
      {!accepted && <p className="mx-auto mt-5 max-w-md rounded-2xl border border-red-500/20 bg-background/70 p-4 text-sm font-bold leading-7 text-red-700 dark:text-red-300">{rejection}</p>}
      {accepted && subscription && <p className="mx-auto mt-5 max-w-md rounded-2xl border border-emerald-500/20 bg-background/70 p-4 text-sm font-bold leading-7">تم الاعتماد على {String(snapshot.packageName ?? "اشتراك العضو")} · <span dir="ltr">{String(subscription.subscriptionNumber ?? "")}</span></p>}
      <dl className="mx-auto mt-5 grid max-w-md gap-2 text-xs sm:grid-cols-2">
        <AttendanceDetail icon={MapPin} label="الفرع" value={branchName}/>
        <AttendanceDetail icon={CalendarDays} label="وقت المحاولة" value={attendanceDateTime(result.attemptedAt)}/>
      </dl>
      <p className="mt-4 text-[11px] text-muted-foreground">تم حفظ محاولة الدخول في سجل الحضور.</p>
      <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={onClose}>إغلاق</Button><Button type="button" onClick={onAgain}>تسجيل دخول عضو آخر</Button></div>
    </div>
  </section>
}

function attendanceSubscriptionEligibility(subscription: DataRow, branchId: string) {
  const status = String(subscription.status ?? "")
  if (status !== "ACTIVE" && status !== "ACTIVE_PROVISIONAL") return { eligible: false, label: "الاشتراك غير نشط" }
  if (subscription.fulfillmentKind !== "FACILITY_ACCESS") return { eligible: false, label: "لا يشمل دخول النادي" }
  const now = Date.now()
  const schedules = Array.isArray(subscription.freezeSchedules) ? subscription.freezeSchedules.filter(isDataRow) : []
  if (schedules.some(schedule => schedule.status === "PENDING" && new Date(String(schedule.scheduledStartAt ?? "")).getTime() <= now)) return { eligible: false, label: "التجميد بدأ" }
  const accessPeriods = Array.isArray(subscription.accessPeriods) ? subscription.accessPeriods.filter(isDataRow) : []
  if (accessPeriods.length > 0 && !accessPeriods.some(period => new Date(String(period.startsAt ?? "")).getTime() <= now && now < new Date(String(period.endsAt ?? "")).getTime())) return { eligible: false, label: "خارج فترة الصلاحية" }
  if (subscription.branchAccessPolicy !== "ALL_ORGANIZATION_BRANCHES" && !(Array.isArray(subscription.allowedBranchIds) && subscription.allowedBranchIds.some(id => String(id) === branchId))) return { eligible: false, label: "غير صالح لهذا الفرع" }
  const allowance = finiteNumber(subscription.visitAllowance)
  if (allowance !== undefined && (finiteNumber(subscription.visitsUsed) ?? 0) >= allowance) return { eligible: false, label: "الزيارات منتهية" }
  return { eligible: true, label: "مؤهل مبدئيًا" }
}

function attendanceRejectionLabel(reason: string) {
  return ({
    MEMBER_INACTIVE: "حساب العضو غير نشط.",
    MEMBER_BLOCKED: "العضو محظور من الدخول.",
    BRANCH_INACTIVE: "الفرع غير نشط حاليًا.",
    NOT_ACTIVE: "لا يوجد اشتراك نشط صالح للدخول.",
    OUTSIDE_ACCESS_PERIOD: "الاشتراك خارج فترة السماح بالدخول.",
    BRANCH_NOT_ALLOWED: "اشتراك العضو غير صالح في هذا الفرع.",
    VISITS_EXHAUSTED: "استهلك العضو جميع الزيارات المتاحة.",
    SERVICE_NOT_INCLUDED: "الخدمة المطلوبة غير مشمولة في الاشتراك.",
    SERVICE_VISITS_EXHAUSTED: "استهلك العضو جميع زيارات الخدمة المتاحة.",
    FULFILLMENT_NOT_ACCESS: "نوع الاشتراك لا يمنح صلاحية دخول النادي.",
    CONCURRENT_ACCESS_CONFLICT: "تغيّرت بيانات الاشتراك أثناء التحقق. أعد المحاولة.",
  } as Record<string, string>)[reason] ?? "لم تتحقق شروط السماح بالدخول."
}

function attendanceBranchName(branchId: string, branches: Array<{ id: string; nameAr?: string; name?: string }>) {
  const branch = branches.find(item => item.id === branchId)
  return branch?.nameAr ?? branch?.name ?? "فرع غير متاح"
}

function attendanceDate(value: unknown) {
  const date = new Date(String(value ?? ""))
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(date)
}

function attendanceDateTime(value: unknown) {
  const date = new Date(String(value ?? ""))
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(date)
}

function finiteNumber(value: unknown) {
  const number = Number(value)
  return value === null || value === undefined || value === "" || !Number.isFinite(number) ? undefined : number
}

function isDataRow(value: unknown): value is DataRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function dataRows(value: unknown): DataRow[] {
  if (Array.isArray(value)) return value.filter(isDataRow)
  if (isDataRow(value) && Array.isArray(value.items)) return value.items.filter(isDataRow)
  return []
}

async function loadAllAttendanceSubscriptions(organizationId: string, memberId: string) {
  const items: DataRow[] = []
  const seenCursors = new Set<string>()
  let cursor = ""
  do {
    const query = new URLSearchParams({ memberId, limit: "100" })
    if (cursor) query.set("cursor", cursor)
    const response = await apiRequest<unknown>(`/organizations/${organizationId}/subscriptions?${query}`)
    items.push(...dataRows(response.data))
    const nextCursor = isDataRow(response.data) ? String(response.data.nextCursor ?? "") : ""
    if (!nextCursor || seenCursors.has(nextCursor)) break
    seenCursors.add(nextCursor)
    cursor = nextCursor
  } while (cursor)
  return items
}

function PromoCodeControl({ value, appliedCode, quote, loading, error, onChange, onApply, onRemove }: {
  value: string
  appliedCode: string
  quote?: SubscriptionQuote
  loading: boolean
  error: string
  onChange: (value: string) => void
  onApply: () => void
  onRemove: () => void
}) {
  const enteredCode = value.trim().toUpperCase()
  const hasUnappliedChange = enteredCode !== appliedCode
  const appliedSuccessfully = Boolean(appliedCode && !loading && !error && quote?.promotion?.code.toUpperCase() === appliedCode)
  return <section className="mt-5 rounded-2xl border bg-secondary/25 p-4" aria-label="كود الخصم">
    <div className="flex items-start gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><TicketPercent className="size-4" /></div>
      <div><h3 className="text-xs font-black">هل لدى العضو كود خصم؟</h3><p className="mt-1 text-[11px] leading-5 text-muted-foreground">أدخل الكود ثم طبّقه لمراجعة صلاحيته وتحديث السعر قبل إنشاء الفاتورة.</p></div>
    </div>
    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
      <Input
        dir="ltr"
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); onApply() } }}
        placeholder="SUMMER25"
        aria-label="كود الخصم"
        className="h-11 font-mono uppercase tracking-wider"
        autoComplete="off"
      />
      <Button type="button" variant="outline" className="h-11 shrink-0" disabled={!enteredCode || loading || (!hasUnappliedChange && appliedSuccessfully)} onClick={onApply}>
        {loading && appliedCode ? <Loader2 className="animate-spin" /> : appliedSuccessfully && !hasUnappliedChange ? <Check /> : <TicketPercent />}
        {appliedSuccessfully && !hasUnappliedChange ? "تم التطبيق" : "تطبيق الكود"}
      </Button>
      {appliedCode && <Button type="button" variant="ghost" className="h-11 shrink-0 text-muted-foreground" disabled={loading} onClick={onRemove}><X />إزالة</Button>}
    </div>
    <div aria-live="polite">
      {hasUnappliedChange && appliedCode && <p className="mt-3 text-[11px] font-semibold text-amber-700 dark:text-amber-300">تم تعديل الكود. اضغط «تطبيق الكود» لتحديث السعر.</p>}
      {!hasUnappliedChange && appliedSuccessfully && <p className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" />تم قبول الكود {appliedCode} وتحديث إجمالي الاشتراك.</p>}
      {!hasUnappliedChange && appliedCode && !loading && error && <p className="mt-3 text-[11px] font-bold text-red-600">لم يُطبّق الكود. راجع صلاحيته أو الباقات والفروع المحددة له.</p>}
    </div>
  </section>
}

function SubscriptionPricePreview({ quote, loading, error }: { quote?: SubscriptionQuote; loading: boolean; error: string }) {
  if (loading) return <div className="mt-5 flex items-center gap-2 rounded-2xl border bg-secondary/40 p-4 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /> جارٍ التحقق من السعر والضريبة في الفرع الحالي...</div>
  if (error) return <div className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/8 p-4 text-xs font-semibold leading-6 text-red-600">{error}</div>
  if (!quote) return null
  const hasDiscount = Number(quote.discountMinor) > 0
  const grossBeforeOfferMinor = priceBeforeOfferIncludingTax(quote)
  const savingsMinor = subtractMinor(grossBeforeOfferMinor, quote.grossMinor)
  return <section className="mt-5 rounded-2xl border border-emerald-500/25 bg-emerald-500/6 p-4" aria-label="ملخص سعر الاشتراك">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-black">ملخص السعر في الفرع الحالي</p><p className="mt-1 text-[11px] text-muted-foreground">{quote.targetName}</p></div>
      <div className="text-left"><span className="block text-[10px] text-muted-foreground">الإجمالي النهائي</span><strong className="text-lg text-emerald-700 dark:text-emerald-400">{formatMoney(quote.grossMinor, quote.currency)}</strong></div>
    </div>
    {hasDiscount && <div className="mt-4 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><span className="inline-flex rounded-full bg-amber-500/20 px-2 py-1 text-[10px] font-black text-amber-800 dark:text-amber-300">عرض مطبّق</span><p className="mt-2 text-sm font-black">{quote.promotion?.name ?? "خصم تلقائي"}</p></div>
        {quote.promotion?.code && <div className="text-left"><span className="block text-[10px] text-muted-foreground">رمز العرض</span><b className="mt-1 block text-xs" dir="ltr">{quote.promotion.code}</b></div>}
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-xl bg-background/70 p-3"><dt className="text-muted-foreground">السعر قبل العرض</dt><dd className="mt-1 font-bold line-through decoration-red-500/70">{formatMoney(grossBeforeOfferMinor, quote.currency)}</dd><span className="mt-1 block text-[10px] text-muted-foreground">شامل الضريبة</span></div>
        <div className="rounded-xl bg-background/70 p-3"><dt className="text-muted-foreground">السعر بعد تطبيق العرض</dt><dd className="mt-1 font-black text-emerald-700 dark:text-emerald-400">{formatMoney(quote.grossMinor, quote.currency)}</dd><span className="mt-1 block text-[10px] text-muted-foreground">شامل الضريبة</span></div>
        <div className="rounded-xl bg-background/70 p-3"><dt className="text-muted-foreground">إجمالي التوفير</dt><dd className="mt-1 font-black text-emerald-700 dark:text-emerald-400">{formatMoney(savingsMinor, quote.currency)}</dd><span className="mt-1 block text-[10px] text-muted-foreground">بعد احتساب الضريبة</span></div>
      </dl>
    </div>}
    <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
      <div><dt className="text-muted-foreground">السعر بعد الخصم قبل الضريبة</dt><dd className="mt-1 font-bold">{formatMoney(quote.netMinor, quote.currency)}</dd></div>
      <div><dt className="text-muted-foreground">الضريبة</dt><dd className="mt-1 font-bold">{formatMoney(quote.taxMinor, quote.currency)}</dd></div>
      <div><dt className="text-muted-foreground">الإجمالي النهائي شامل الضريبة</dt><dd className="mt-1 font-black">{formatMoney(quote.grossMinor, quote.currency)}</dd></div>
    </dl>
  </section>
}

function BookingPricePreview({ quote, loading, error }: { quote?: SubscriptionQuote; loading: boolean; error: string }) {
  if (loading) return <div className="mt-5 flex items-center gap-2 rounded-2xl border bg-secondary/40 p-4 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /> جارٍ التحقق من سعر الحجز والضريبة...</div>
  if (error) return <div className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/8 p-4 text-xs font-semibold leading-6 text-red-600">{error}</div>
  if (!quote) return null
  return <section className="mt-5 rounded-2xl border border-emerald-500/25 bg-emerald-500/6 p-4" aria-label="ملخص سعر الحجز">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-black">فاتورة الحجز قبل التأكيد</p><p className="mt-1 text-[11px] text-muted-foreground">{quote.targetName} · السعر المعتمد في الفرع الحالي</p></div>
      <div className="text-left"><span className="block text-[10px] text-muted-foreground">الإجمالي المطلوب</span><strong className="text-lg text-emerald-700 dark:text-emerald-400">{formatMoney(quote.grossMinor, quote.currency)}</strong></div>
    </div>
    <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
      <div><dt className="text-muted-foreground">قبل الضريبة</dt><dd className="mt-1 font-bold">{formatMoney(quote.netMinor, quote.currency)}</dd></div>
      <div><dt className="text-muted-foreground">الضريبة</dt><dd className="mt-1 font-bold">{formatMoney(quote.taxMinor, quote.currency)}</dd></div>
      <div><dt className="text-muted-foreground">حالة الحجز بعد الإنشاء</dt><dd className="mt-1 font-black text-amber-700 dark:text-amber-300">بانتظار الدفع</dd></div>
    </dl>
    <p className="mt-4 rounded-xl bg-background/70 p-3 text-[11px] font-semibold leading-5 text-muted-foreground">سيتم حجز السعة وإصدار الفاتورة معًا. لا يصبح الحجز مؤكدًا إلا بعد اكتمال التحصيل من نقطة البيع.</p>
  </section>
}

function priceBeforeOfferIncludingTax(quote: SubscriptionQuote) {
  try {
    const base = BigInt(quote.baseAmountMinor)
    if (quote.taxInclusive) return base.toString()
    const rate = BigInt(Math.max(0, Math.trunc(quote.taxRateBps)))
    const tax = divideRounded(base * rate, BigInt(10_000))
    return (base + tax).toString()
  } catch {
    return quote.grossMinor
  }
}

function subtractMinor(minuend: string, subtrahend: string) {
  try {
    const difference = BigInt(minuend) - BigInt(subtrahend)
    return (difference > BigInt(0) ? difference : BigInt(0)).toString()
  } catch {
    return "0"
  }
}

function divideRounded(value: bigint, divisor: bigint) {
  return (value + divisor / BigInt(2)) / divisor
}

function Field({ field, value, choices = [], loading, lockedLabel, referenceQuery, onReferenceSearch, onChange }: { field: (typeof workflows)[string]["fields"][number]; value: string | boolean | File | undefined; choices?: Choice[]; loading: boolean; lockedLabel?: string; referenceQuery: string; onReferenceSearch: (value: string) => void; onChange: (value: string | boolean | File | undefined) => void }) {
  const [showPassword, setShowPassword] = useState(false)
  if (field.type === "checkbox") return <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-xs font-bold sm:col-span-2"><input type="checkbox" className="size-4 accent-amber-500" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} /><span>{field.label}</span></label>
  const className = field.type === "textarea" ? "sm:col-span-2" : ""
  return <label className={`text-xs font-bold ${className}`}><span>{field.label}{field.required && <span className="mr-1 text-red-500">*</span>}</span>
    {field.type === "reference" && lockedLabel ? <span className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-primary/20 bg-primary/[.06] px-3 text-sm"><LockKeyhole className="size-4 shrink-0 text-primary"/><span className="font-bold">{lockedLabel}</span></span> : field.type === "file" ? <span className="mt-2 flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-background px-4 py-3 transition hover:border-primary hover:bg-primary/5"><input className="sr-only" type="file" required={field.required} accept={field.name === "profileImage" ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,application/pdf"} onChange={event => onChange(event.target.files?.[0])} /><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${value instanceof File ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"}`}>{value instanceof File ? <FileCheck2 className="size-5" /> : <UploadCloud className="size-5" />}</span><span className="min-w-0"><span className="block truncate text-sm font-bold">{value instanceof File ? value.name : "اختر ملفًا من الجهاز"}</span><span className="mt-1 block text-[10px] font-normal text-muted-foreground">{value instanceof File ? `${(value.size / 1024 / 1024).toFixed(2)} ميجابايت · اضغط للاستبدال` : "اضغط هنا للاستعراض والاختيار"}</span></span></span> : field.type === "select" || field.type === "reference" ? <div className="mt-2 space-y-2">{field.type === "reference" && field.source?.searchParam && <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input value={referenceQuery} onChange={event => onReferenceSearch(event.target.value)} className="h-10 pr-10" placeholder="ابحث بالاسم أو رقم العضوية أو الجوال أو الهوية..."/></div>}<select required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"><option value="">{loading ? "جارٍ تجهيز الخيارات..." : field.placeholder ?? "اختر من القائمة"}</option>{(field.options ?? choices).map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select>{field.name === "packageId" && !loading && choices.length === 0 && <span className="block text-[10px] font-normal leading-5 text-amber-600">لا توجد باقات منشورة ومُسعّرة للفرع الحالي. راجع أسعار الباقات في إعداد النظام.</span>}{field.name === "positionId" && !loading && choices.some(choice => choice.disabled) && <span className="block text-[10px] font-normal leading-5 text-amber-600">المسميات التي لم تُحدد لها صلاحيات تظهر للتوضيح فقط ولا يمكن إنشاء حساب دخول عليها. اضبطها أولًا من إعداد النظام ← المسميات الوظيفية والصلاحيات.</span>}</div> : field.type === "textarea" ? <textarea required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} placeholder={field.placeholder} rows={4} className="mt-2 w-full resize-none rounded-xl border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" /> : field.type === "password" ? <span className="relative mt-2 block"><Input className="h-11 pl-11" type={showPassword ? "text" : "password"} required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} placeholder={field.placeholder} autoComplete="new-password" dir="ltr" /><button type="button" onClick={() => setShowPassword(current => !current)} className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span> : field.type === "date" || field.type === "datetime-local" || field.type === "time" ? <DateTimeInput className="mt-2 h-11" type={field.type} required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} /> : <Input className="mt-2 h-11" type={field.type ?? "text"} min={field.min} required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} placeholder={field.placeholder} dir={field.type === "tel" || field.type === "email" || field.type === "number" ? "ltr" : undefined} />}
    {field.name === "sessionSlotId" && !loading && choices.length === 0 && <span className="mt-2 block text-[10px] font-normal leading-5 text-amber-600">لا توجد مواعيد مفتوحة خلال الثلاثين يومًا القادمة. أضف موعدًا من إعداد النظام ← موارد الحجز ← الإتاحة.</span>}
    {field.hint && <span className="mt-2 block text-[10px] font-normal leading-5 text-muted-foreground">{field.hint}</span>}
  </label>
}

function isVisibleField(operationId: string, fieldName: string, values: FormValues) {
  if (operationId !== "createManualReservation") return true
  const visitor = values.customerType === "VISITOR"
  if (fieldName === "memberId") return !visitor
  if (["guestName", "guestPhoneE164", "guestEmail"].includes(fieldName)) return visitor
  if (fieldName === "sessionSlotId") return values.resourceType === "CLASS" || values.resourceType === "PERSONAL_TRAINING" || values.resourceType === "APPOINTMENT"
  if (["startsAt", "endsAt"].includes(fieldName)) return !values.resourceType || values.resourceType === "COURT"
  if (fieldName === "seats") return values.resourceType === "CLASS"
  if (fieldName === "participantCount") return values.resourceType === "COURT"
  return true
}

async function validateValues(operationId: string, values: FormValues): Promise<string> {
  const workflow = workflows[operationId]
  for (const field of workflow?.fields ?? []) {
    if (!isVisibleField(operationId, field.name, values)) continue
    const value = values[field.name]
    const empty = value === undefined || value === false || (typeof value === "string" && value.trim() === "")
    if (field.required && empty) return `أكمل حقل «${field.label}» قبل المتابعة.`
    if (field.type === "email" && typeof value === "string" && value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim())) return `أدخل بريدًا إلكترونيًا صحيحًا في حقل «${field.label}».`
    if (field.type === "tel" && typeof value === "string" && value.trim()) {
      const normalized = value.replace(/[\s()-]/gu, "")
      if (!/^\+[1-9]\d{7,14}$/u.test(normalized)) return `أدخل رقم الجوال بالصيغة الدولية، مثل +9665… أو +2010…`
    }
  }
  if (operationId === "createCrmLead" && !String(values.phoneE164 ?? "").trim() && !String(values.email ?? "").trim()) return "أدخل رقم جوال أو بريدًا إلكترونيًا واحدًا على الأقل حتى يمكن متابعة العميل."
  if (operationId === "createManualReservation") {
    if (!values.resourceType || !values.serviceId) return "اختر مورد حجز صالحًا مرتبطًا بخدمة قبل المتابعة."
    if (values.resourceType === "CLASS") {
      const seats = Number(values.seats)
      if (!Number.isInteger(seats) || seats < 1) return "أدخل عدد مقاعد صحيحًا لا يقل عن مقعد واحد."
    }
    if (values.resourceType === "COURT") {
      const participantCount = Number(values.participantCount)
      if (!Number.isInteger(participantCount) || participantCount < 1 || participantCount > 100) return "أدخل عدد مشاركين صحيحًا من 1 إلى 100."
      if (String(values.startsAt ?? "").slice(0, 10) !== String(values.endsAt ?? "").slice(0, 10)) return "يجب أن يبدأ الحجز وينتهي في اليوم نفسه؛ لا يمكن أن يعبر حجز الملعب منتصف الليل."
      const startsAt = new Date(String(values.startsAt)); const endsAt = new Date(String(values.endsAt))
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) return "وقت نهاية الحجز يجب أن يكون بعد وقت البداية."
      if (startsAt <= new Date()) return "اختر موعد حجز في المستقبل."
    }
  }
  if (operationId === "createEmployee") {
    const password = String(values.password ?? "")
    const passwordError = passwordLengthError(password)
    if (passwordError) return passwordError
    if (password !== String(values.confirmPassword ?? "")) return "كلمتا المرور غير متطابقتين."
  }
  if (!["createEmployee", "registerMember"].includes(operationId)) return ""
  for (const key of ["identityImage", "profileImage"] as const) {
    const file = values[key]
    if (!(file instanceof File)) continue
    const label = key === "identityImage" ? "صورة الهوية" : operationId === "createEmployee" ? "صورة الموظف" : "صورة العضو"
    const error = await ownerFileValidationError(file, key === "identityImage" ? "IDENTITY" : "PROFILE", label)
    if (error) return error
  }
  return ""
}

function isManualReservationWithoutCourtAvailability(values: FormValues, availability: CourtAvailabilityState) {
  return values.resourceType === "COURT" && Boolean(values.resourceId) && !availability.loading && !availability.error && availability.rules.length === 0
}

function availabilityRuleLabel(rule: DataRow) {
  const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
  const day = days[Number(rule.dayOfWeek)] ?? "يوم غير محدد"
  return `${day} ${String(rule.startLocal ?? "").slice(0, 5)}–${String(rule.endLocal ?? "").slice(0, 5)}`
}

function referencePath(path: string, searchParam?: string, query?: string) {
  if (!searchParam || !query?.trim()) return path
  const url = new URL(path, "http://local")
  url.searchParams.set(searchParam, query.trim())
  return `${url.pathname}${url.search}`
}

function toChoice(item: unknown, labelKeys: string[], subtitleKeys: string[] = [], flagEmptyPermissions = false): Choice[] {
  if (!item || typeof item !== "object") return []
  const record = item as Record<string, unknown>
  const id = String(record.id ?? record.memberId ?? record.measurementTypeId ?? record.resourceId ?? record.packageId ?? record.invoiceId ?? record.positionId ?? "")
  if (!id) return []
  const label = labelKeys.map(key => record[key]).find(Boolean)
  const subtitle = (subtitleKeys ?? []).map(key => record[key]).find(Boolean)
  const disabled = flagEmptyPermissions && Array.isArray(record.permissions) && record.permissions.length === 0
  const baseLabel = [label, subtitle].filter(Boolean).join(" — ") || "سجل متاح"
  return [{ value: id, label: disabled ? `${baseLabel} — بدون صلاحيات` : baseLabel, disabled, meta: record }]
}

function sessionSlotChoice(item: unknown): Choice[] {
  if (!item || typeof item !== "object") return []
  const slot = item as Record<string, unknown>
  const id = String(slot.id ?? slot.sessionSlotId ?? "")
  const startsAt = new Date(String(slot.startsAt ?? "")); const endsAt = new Date(String(slot.endsAt ?? ""))
  if (!id || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return []
  const date = new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(startsAt)
  const end = new Intl.DateTimeFormat("ar-SA", { timeStyle: "short" }).format(endsAt)
  const remaining = Math.max(0, Number(slot.capacity ?? 0) - Number(slot.bookedCount ?? 0))
  return [{ value: id, label: `${date} — ${end} — المتاح ${remaining}`, disabled: remaining < 1, meta: slot }]
}

async function sellablePackages(items: unknown[], organizationId: string, branchId: string): Promise<unknown[]> {
  const published = items.filter(item => {
    if (!item || typeof item !== "object") return false
    const value = item as Record<string, unknown>
    if (value.status !== "PUBLISHED") return false
    if (value.branchAccessPolicy !== "SELECTED_BRANCHES") return true
    return Array.isArray(value.branchIds) && value.branchIds.some(id => String(id) === branchId)
  })
  if (!organizationId || !branchId || !published.length) return published

  const response = await apiRequest<unknown>(`/organizations/${organizationId}/prices?branchId=${encodeURIComponent(branchId)}`)
  const payload = response.data
  const prices = Array.isArray(payload) ? payload : payload && typeof payload === "object" && "items" in payload ? (payload as { items: unknown[] }).items : []
  const now = Date.now()
  const pricedPackageIds = new Set(prices.flatMap(item => {
    if (!item || typeof item !== "object") return []
    const price = item as Record<string, unknown>
    if (price.targetType !== "PACKAGE" || price.status !== "ACTIVE") return []
    const priceBranchId = String(price.branchId ?? "")
    if (priceBranchId && priceBranchId !== branchId) return []
    const validFrom = Date.parse(String(price.validFrom ?? ""))
    const validUntil = price.validUntil ? Date.parse(String(price.validUntil)) : Number.POSITIVE_INFINITY
    if (!Number.isFinite(validFrom) || validFrom > now || validUntil <= now) return []
    const targetId = String(price.targetId ?? "")
    return targetId ? [targetId] : []
  }))
  return published.filter(item => pricedPackageIds.has(String((item as Record<string, unknown>).id ?? "")))
}

function formatMoney(minor: string, currency: string) {
  const amount = Number(minor)
  if (!Number.isFinite(amount)) return "—"
  return new Intl.NumberFormat("ar-SA", { style: "currency", currency }).format(amount / 100)
}
