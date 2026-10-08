export type AuditRecord = {
  id: string; branchId?: string; branchName?: string; actorType: "user" | "member" | "system";
  actorId?: string; actorName?: string; action: string; aggregateType: string; aggregateId?: string;
  aggregateDisplayName?: string; aggregateReference?: string; correlationId: string;
  summary?: Record<string, unknown>; reason?: string; occurredAt: string;
}

const aggregateLabels: Record<string, string> = {
  member: "عضو", subscription: "اشتراك", employee: "موظف", role: "مجموعة صلاحيات",
  payment: "دفعة مالية", invoice: "فاتورة", booking: "حجز", reservation: "حجز",
  "restaurant-order": "طلب مطعم", "role-assignment": "تعيين صلاحيات", "user-account": "حساب مستخدم",
  "workforce-position": "مسمى وظيفي", branch: "فرع", package: "باقة", service: "خدمة",
  activity: "نشاط رياضي", "service-category": "تصنيف خدمات", promotion: "عرض ترويجي",
  "price-version": "سعر خدمة أو باقة", "commercial-policy-version": "سياسة تجارية",
  "branch-service-availability": "إتاحة خدمة في فرع", facility: "مرفق", "bookable-resource": "مورد قابل للحجز",
  "availability-rule": "فترة إتاحة للحجز", "blackout-period": "فترة حظر حجز", "session-slot": "موعد جلسة",
  "crm-lead": "عميل محتمل", "crm-source": "مصدر عملاء", "crm-follow-up": "متابعة عميل",
  "feedback-ticket": "شكوى أو اقتراح", "feedback-case": "شكوى أو اقتراح", "online-request": "طلب إلكتروني",
  "cashier-shift": "وردية صندوق", "cash-point": "نقطة تحصيل", "sales-order": "طلب بيع",
  "finance-refund-request": "طلب استرداد مالي", refund: "استرداد مالي", expense: "مصروف",
  "expense-category": "تصنيف مصروفات", "other-income": "إيراد آخر", "other-income-category": "تصنيف إيرادات",
  attendance: "سجل حضور", "attendance-attempt": "محاولة دخول", "employee-attendance": "حضور موظف",
  "employee-shift": "وردية موظف", "access-credential": "وسيلة تعريف للدخول", "access-device": "جهاز دخول",
  notification: "إشعار", "notification-template": "قالب إشعار", "whatsapp-campaign": "حملة واتساب",
  "communication-campaign": "حملة تواصل", "file-record": "ملف مرفوع", locker: "خزانة", "locker-assignment": "تخصيص خزانة",
  "training-plan": "خطة تدريب", "training-plan-item": "تمرين في خطة تدريب", "training-template": "قالب خطة تدريب",
  "trainer-profile": "ملف مدرب", "trainer-assignment": "تعيين مدرب", "trainer-member-assignment": "ربط عضو بمدرب",
  "trainer-availability": "فترة إتاحة مدرب", "coaching-specialty": "تخصص تدريب",
  "measurement-type": "نوع قياس", "measurement-session": "جلسة قياسات", "commission-plan": "خطة عمولات", "commission-entry": "عمولة",
  meal: "وجبة", "meal-category": "تصنيف وجبات", "meal-price": "سعر وجبة", "daily-menu": "قائمة الطعام اليومية",
  "retail-category": "تصنيف منتجات", "retail-product": "منتج متجر", "retail-price": "سعر منتج",
  "retail-stock-movement": "حركة مخزون", catalog: "دليل الخدمات والباقات", "legacy-catalog": "دليل البيانات المستوردة",
  "prelaunch-cleanup": "تهيئة بيانات النظام", "reporting-rebuild": "إعادة بناء التقارير",
}

export const aggregateTypes = [
  ["", "كل أجزاء النظام"], ["member", "الأعضاء"], ["subscription", "الاشتراكات"], ["employee", "الموظفون"],
  ["workforce-position", "المسميات الوظيفية"], ["role", "مجموعات الصلاحيات"], ["role-assignment", "تعيينات الصلاحيات"],
  ["user-account", "حسابات المستخدمين"], ["branch", "الفروع"], ["activity", "الأنشطة الرياضية"],
  ["service", "الخدمات"], ["service-category", "تصنيفات الخدمات"], ["package", "الباقات"],
  ["promotion", "العروض الترويجية"], ["price-version", "الأسعار"], ["commercial-policy-version", "السياسات التجارية"],
  ["branch-service-availability", "إتاحة الخدمات بالفروع"], ["sales-order", "طلبات البيع"], ["payment", "المدفوعات"],
  ["invoice", "الفواتير"], ["finance-refund-request", "طلبات الاسترداد"], ["expense", "المصروفات"],
  ["other-income", "الإيرادات الأخرى"], ["cashier-shift", "ورديات الصندوق"], ["cash-point", "نقاط التحصيل"],
  ["reservation", "الحجوزات"], ["facility", "المرافق"], ["bookable-resource", "موارد الحجز"],
  ["availability-rule", "فترات إتاحة الحجز"], ["session-slot", "مواعيد الجلسات"],
  ["attendance-attempt", "محاولات الدخول"], ["access-device", "أجهزة الدخول"], ["access-credential", "وسائل تعريف الدخول"],
  ["employee-attendance", "حضور الموظفين"], ["employee-shift", "ورديات الموظفين"],
  ["restaurant-order", "طلبات المطعم"], ["meal", "الوجبات"], ["meal-category", "تصنيفات الوجبات"],
  ["meal-price", "أسعار الوجبات"], ["daily-menu", "قوائم الطعام اليومية"],
  ["retail-product", "منتجات المتجر"], ["retail-category", "تصنيفات المنتجات"], ["retail-price", "أسعار المنتجات"],
  ["retail-stock-movement", "حركات المخزون"], ["crm-lead", "العملاء المحتملون"], ["feedback-case", "الشكاوى والاقتراحات"],
  ["online-request", "الطلبات الإلكترونية"], ["file-record", "الملفات"], ["notification", "الإشعارات"],
  ["training-plan", "خطط التدريب"], ["trainer-profile", "المدربون"], ["measurement-session", "جلسات القياسات"],
] as const

const exactActionLabels: Record<string, string> = {
  "sales.service-administratively-corrected": "تصحيح خدمة مسجلة بالخطأ",
  "booking.reservation-administratively-corrected": "تصحيح حجز مسجل بالخطأ",
  "subscription.expired": "انتهاء مدة اشتراك", "subscription.activated": "تفعيل اشتراك",
  "subscription.frozen": "تجميد اشتراك", "subscription.resumed": "استئناف اشتراك",
  "subscription.cancelled": "إلغاء اشتراك", "subscription.cancellation-requested": "طلب إلغاء اشتراك",
  "subscription.purchase-prepared": "إعداد بيع باقة", "subscription.purchase-fulfilled": "إتمام بيع باقة",
  "subscription.renewal-purchase-prepared": "إعداد تجديد اشتراك", "subscription.freeze-scheduled": "جدولة تجميد اشتراك",
  "subscription.scheduled-freeze-started": "بدء التجميد المجدول", "subscription.start-rescheduled": "تغيير موعد بداية اشتراك",
  "subscription.adjusted": "تعديل مدة أو رصيد اشتراك", "subscription.administratively-corrected": "تصحيح إداري لاشتراك",
  "subscription.legacy-imported": "استيراد اشتراك من النظام السابق",
  "member.registered": "تسجيل عضو جديد", "member.updated": "تعديل بيانات عضو",
  "member.legacy-imported": "استيراد عضو من النظام السابق", "member.legacy-status-corrected": "تصحيح حالة عضو مستورد",
  "member-account.activated": "تفعيل حساب عضو", "member-account.activation-issued": "إصدار رمز تفعيل حساب عضو",
  "workforce.employee-created": "إضافة موظف جديد", "workforce.employee-updated": "تعديل بيانات موظف",
  "workforce.employee-assigned": "تعيين موظف في فرع", "workforce.employee-password-reset": "إعادة تعيين كلمة مرور موظف",
  "employee-login.provisioned": "تجهيز حساب دخول موظف", "user-account.password-changed": "تغيير كلمة مرور حساب",
  "invoice.issued": "إصدار فاتورة", "invoice.paid": "سداد فاتورة", "payment.recorded": "تسجيل دفعة مالية",
  "payment.method-corrected": "تصحيح طريقة سداد دفعة", "sales-order.created": "إنشاء طلب بيع",
  "cash-shift.opened": "فتح وردية صندوق", "cash-shift.closed": "إغلاق وردية صندوق",
  "booking.availability-created": "إضافة فترة إتاحة للحجز", "booking.session-slot-created": "إضافة موعد جلسة",
  "booking.reservation-pending-payment": "إنشاء حجز بانتظار السداد", "booking.reservation-confirmed": "تأكيد حجز",
  "attendance.accepted": "السماح بالدخول", "attendance.rejected": "رفض محاولة دخول",
  "access-credential.fingerprint-pin-assigned": "تعيين رقم تعريف البصمة",
  "file.upload-requested": "طلب رفع ملف", "file.upload-completed": "اكتمال رفع ملف",
  "file.validation-clean": "اجتياز فحص الملف", "file.validation-rejected": "رفض الملف بعد الفحص",
  "file.validation-infected": "رفض ملف ضار", "file.validation-failed": "تعذر فحص الملف",
  "finance.refund-requested": "طلب استرداد مالي", "finance.refund-approved": "اعتماد طلب استرداد",
  "finance.refund-fulfilled": "تنفيذ الاسترداد المالي", "finance.refund-rejected": "رفض طلب استرداد",
  "restaurant.order-pending": "إنشاء طلب مطعم بانتظار التأكيد", "restaurant.order-preparing": "بدء تجهيز طلب مطعم",
  "restaurant.order-ready": "اكتمال تجهيز طلب مطعم", "restaurant.order-completed": "تسليم طلب مطعم",
  "restaurant.meal-plan-order-confirmed": "تأكيد صرف وجبة من الاشتراك", "restaurant.daily-menu-revised": "تعديل قائمة الطعام اليومية",
  "retail.stock-adjusted": "تعديل رصيد المخزون", "legacy.catalog-materialized": "استيراد دليل الخدمات والباقات",
  "prelaunch.catalog-entitlements-restored": "استعادة استحقاقات الباقات المستوردة", "prelaunch.cleanup-completed": "اكتمال تهيئة بيانات النظام",
}

const verbs: Record<string, string> = {
  created: "إنشاء", updated: "تعديل", deleted: "حذف", archived: "أرشفة", restored: "استعادة",
  revoked: "إلغاء", assigned: "إسناد", activated: "تفعيل", cancelled: "إلغاء", recorded: "تسجيل",
  approved: "اعتماد", rejected: "رفض", paid: "سداد", sent: "إرسال", issued: "إصدار", opened: "فتح",
  closed: "إغلاق", resolved: "حل", published: "نشر", hidden: "إخفاء", expired: "انتهاء مدة",
  uploaded: "رفع", linked: "ربط", unlinked: "إلغاء ربط", confirmed: "تأكيد", completed: "إتمام",
  scheduled: "جدولة", transitioned: "تغيير حالة", reviewed: "مراجعة", adjusted: "تعديل",
  provisioned: "تجهيز", accrued: "احتساب", queued: "جدولة إرسال", rebuilt: "إعادة بناء",
}

const fieldLabels: Record<string, string> = {
  name: "الاسم", code: "الرمز", status: "الحالة", beforeStatus: "الحالة السابقة", afterStatus: "الحالة الجديدة",
  reason: "السبب", before: "قبل التعديل", after: "بعد التعديل", changedFields: "البيانات المعدّلة",
  permissions: "الصلاحيات", memberNumber: "رقم العضوية", employeeNumber: "الرقم الوظيفي",
  subscriptionNumber: "رقم الاشتراك", invoiceNumber: "رقم الفاتورة", orderNumber: "رقم طلب البيع",
  termStart: "بداية الاشتراك", termEnd: "نهاية الاشتراك", startsAt: "تاريخ البداية", endsAt: "تاريخ النهاية",
  occurredAt: "وقت التنفيذ", effectiveAt: "تاريخ السريان", validFrom: "صالح من", validUntil: "صالح حتى",
  businessDate: "تاريخ قائمة الطعام", scheduledStartAt: "بداية التجميد المجدول", requestedDays: "مدة التجميد بالأيام",
  previousTermStart: "بداية الاشتراك السابقة", revisedTermStart: "بداية الاشتراك الجديدة",
  previousTermEnd: "نهاية الاشتراك السابقة", revisedTermEnd: "نهاية الاشتراك الجديدة",
  amount: "السعر", amountMinor: "المبلغ", grossMinor: "الإجمالي", paidMinor: "المبلغ المسدد",
  netMinor: "الصافي", discountMinor: "الخصم", taxMinor: "الضريبة", allocatedMinor: "المبلغ الموزع على الفواتير",
  requestedAmountMinor: "مبلغ الاسترداد المطلوب", eligibleRefundMinor: "المبلغ المستحق للاسترداد",
  currency: "العملة", taxRateBps: "نسبة الضريبة", taxInclusive: "السعر شامل الضريبة",
  settlement: "التسوية المالية", balanceMinor: "المستحق بعد التصحيح",
  invoicePromotion: "كود خصم الفاتورة", applicationScope: "نطاق تطبيق العرض", grossBeforeMinor: "الإجمالي قبل الكود", grossDiscountMinor: "توفير الكود شامل الضريبة",
  benefitType: "نوع العرض", benefitValue: "قيمة العرض", targetType: "ينطبق على", targetName: "الخدمة أو الباقة",
  targetCode: "رمز الخدمة أو الباقة", enabled: "الخدمة متاحة", durationDays: "المدة بالأيام",
  branchAccessPolicy: "نطاق دخول الفروع", visitsPerPeriod: "الزيارات المسموحة", visitAllowance: "رصيد الزيارات",
  visitsUsed: "الزيارات المستخدمة", visitLimitPeriod: "فترة احتساب الزيارات", channel: "قناة الإرسال", audience: "المستلمون",
  category: "التصنيف", priority: "الأولوية", title: "العنوان", type: "النوع", kind: "نوع الوجبة",
  method: "طريقة السداد", originalMethod: "طريقة السداد السابقة", correctedMethod: "طريقة السداد الجديدة",
  lineCount: "عدد بنود الطلب", itemCount: "عدد العناصر", quantity: "الكمية", entitlementCount: "عدد الاستحقاقات",
  subjectType: "نوع صاحب وسيلة الدخول", purpose: "الغرض من الملف", ownerType: "صاحب الملف",
  uploadStatus: "حالة الرفع", detectedMimeType: "نوع الملف الفعلي", actualMimeType: "نوع الملف المرفوع",
  actualSize: "حجم الملف بالبايت", size: "حجم الملف بالبايت", checksumMatched: "بصمة الملف مطابقة",
  sourceType: "مصدر العملية", otherSessionsRevoked: "إلغاء الجلسات الأخرى", accountCreated: "تم إنشاء حساب دخول",
  adjustmentType: "نوع تعديل الاشتراك", value: "قيمة التعديل", activatedImmediately: "تم التفعيل فورًا",
}

const values: Record<string, string> = {
  ACTIVE: "نشط", INACTIVE: "غير نشط", PENDING: "قيد المراجعة", PENDING_PAYMENT: "بانتظار السداد",
  ISSUED: "صادرة", PAID: "مسددة", PARTIALLY_PAID: "مسددة جزئيًا", CANCELLED: "ملغاة", EXPIRED: "منتهي",
  FROZEN: "مجمّد", SUSPENDED: "موقوف", APPROVED: "معتمد", REJECTED: "مرفوض", OPEN: "مفتوح", CLOSED: "مغلق",
  RESOLVED: "تم الحل", IN_PROGRESS: "قيد التنفيذ", DRAFT: "مسودة", PUBLISHED: "منشور", CASH: "نقدًا",
  CARD: "بطاقة", BANK_TRANSFER: "تحويل بنكي", GATEWAY: "بوابة دفع", WALLET: "محفظة",
  CURRENT_BRANCH: "الفرع الحالي", ALL_BRANCHES: "كل الفروع", SELECTED_BRANCHES: "فروع محددة", DAILY: "يوميًا",
  WEEKLY: "أسبوعيًا", MONTHLY: "شهريًا", SYSTEM: "داخل النظام", WHATSAPP: "واتساب", BOTH: "داخل النظام وواتساب",
  HIGH: "عالية", NORMAL: "عادية", LOW: "منخفضة", COMPLAINT: "شكوى", SUGGESTION: "اقتراح",
  VOIDED_UNPAID: "إلغاء فاتورة غير مسددة", REDUCED_UNPAID: "تخفيض المستحق", REFUND_REQUIRED: "طلب استرداد", NO_FINANCIAL_SETTLEMENT: "دون تسوية مالية",
  NOT_REQUIRED: "لا يتطلب تنفيذًا إضافيًا", FULFILLED: "تم التنفيذ",
  COUNTER_INVOICE: "فاتورة الكاونتر", LINE: "الباقات والخدمات",
  FIXED_DISCOUNT: "خصم بمبلغ ثابت", PERCENTAGE: "خصم بنسبة مئوية", FIXED_FINAL_PRICE: "سعر نهائي ثابت",
  SERVICE: "خدمة", PACKAGE: "باقة", MEMBER: "عضو", EMPLOYEE: "موظف", SAR: "ريال سعودي",
  CLEAN: "اجتاز الفحص", UPLOADED: "تم الرفع", SCANNING: "جارٍ الفحص", FAILED: "تعذر التنفيذ", INFECTED: "ملف ضار",
  IDENTITY_DOCUMENT: "مستند هوية", PROFILE_PHOTO: "صورة شخصية", SALES: "طلب بيع", MEAL_PLAN: "اشتراك وجبات",
  CLOCK_IN: "تسجيل دخول", CLOCK_OUT: "تسجيل خروج", PREPARING: "جارٍ التجهيز", READY: "جاهز", COMPLETED: "مكتمل",
}

export function aggregateLabel(type: string): string {
  return aggregateLabels[type] ?? `نوع سجل غير مصنّف (${type})`
}

export function actionLabel(action: string, aggregateType?: string): string {
  if (exactActionLabels[action]) return exactActionLabels[action]
  const suffix = action.split(/[.-]/u).at(-1) ?? ""
  const type = aggregateType ?? action.split(".")[0] ?? ""
  return verbs[suffix] && aggregateLabels[type] ? `${verbs[suffix]} ${aggregateLabels[type]}` : `إجراء غير مصنّف (${action})`
}

export function relatedRecordLabel(record: AuditRecord): string {
  const summary = record.summary ?? {}
  const snapshot = [summary.name, summary.targetName, summary.title].find(isReadableText)
  return snapshot || record.aggregateDisplayName || (isReadableText(summary.code) ? summary.code : aggregateLabel(record.aggregateType))
}

export function relatedRecordHint(record: AuditRecord): string {
  const reference = record.aggregateReference || record.summary?.memberNumber || record.summary?.employeeNumber
    || record.summary?.subscriptionNumber || record.summary?.invoiceNumber || record.summary?.orderNumber || record.summary?.code
  return `${aggregateLabel(record.aggregateType)}${isReadableText(reference) ? ` · المرجع: ${reference}` : ""}`
}

export function actionDescription(record: AuditRecord): string {
  if (record.action === "subscription.expired") return `وصل ${relatedRecordHint(record)} إلى تاريخ نهايته وتم تحديث حالته تلقائيًا.`
  const label = actionLabel(record.action, record.aggregateType)
  const target = relatedRecordLabel(record)
  const details = readableDetails(record.summary).filter(item => ["benefitValue", "amount", "amountMinor", "beforeStatus", "afterStatus", "status", "enabled"].includes(item.key))
  const suffix = details.slice(0, 2).map(item => `${item.label}: ${item.value}`).join("، ")
  return `${label}${target !== aggregateLabel(record.aggregateType) ? ` — ${target}` : ""}${suffix ? `. ${suffix}` : "."}`
}

export function readableDetails(summary?: Record<string, unknown>): Array<{ key: string; label: string; value: string }> {
  if (!summary) return []
  const details: Array<{ key: string; label: string; value: string }> = []
  for (const [key, value] of Object.entries(summary)) {
    if (!fieldLabels[key] || !isDisplayable(value)) continue
    if ((key === "before" || key === "after" || key === "invoicePromotion") && typeof value === "object" && !Array.isArray(value)) {
      for (const nested of readableDetails(value as Record<string, unknown>)) {
        details.push({ ...nested, key: `${key}.${nested.key}`, label: `${nested.label} ${key === "invoicePromotion" ? "لكود الفاتورة" : key === "before" ? "قبل التعديل" : "بعد التعديل"}` })
      }
    } else {
      const formatted = displayValue(key, value, summary)
      if (formatted) details.push({ key, label: fieldLabels[key], value: formatted })
    }
  }
  return details.slice(0, 12)
}

function displayValue(key: string, value: unknown, summary: Record<string, unknown>): string {
  if (Array.isArray(value)) return value.filter(isDisplayable).map(item => key === "changedFields" ? fieldLabels[String(item)] ?? "بيانات أخرى" : displayValue(key, item, summary)).filter(Boolean).join("، ") || "لا يوجد"
  if (value && typeof value === "object") {
    if (key === "amount" && "minorUnits" in value && isDisplayable(value.minorUnits)) return money(value.minorUnits)
    return ""
  }
  if (typeof value === "boolean") return value ? "نعم" : "لا"
  const raw = String(value)
  if (values[raw]) return values[raw]
  if (key === "benefitValue") return summary.benefitType === "PERCENTAGE" ? `${Number(raw) / 100}%` : money(value)
  if (key === "taxRateBps") return `${Number(raw) / 100}%`
  if (/Minor$/u.test(key) && /^-?\d+$/u.test(raw)) return money(value)
  if (/At$|Date$|Start$|End$|validFrom|validUntil/u.test(key)) return auditDateTime(raw)
  return raw
}

function money(value: unknown): string {
  const amount = Number(value)
  return Number.isFinite(amount) ? `${new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount / 100)} ر.س.` : ""
}

function isReadableText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value !== "[REDACTED]" && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu.test(value)
}

function isDisplayable(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "" && value !== "[REDACTED]"
}

export function auditDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "غير متاح" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date)
}
