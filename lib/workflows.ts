export type Choice = { value: string; label: string }
export type FormValues = Record<string, string | boolean>
export type ReferenceSource = {
  path: (context: WorkflowContext) => string
  labelKeys: string[]
  subtitleKeys?: string[]
}
export type WorkflowField = {
  name: string
  label: string
  type?: "text" | "tel" | "email" | "password" | "date" | "datetime-local" | "number" | "textarea" | "select" | "reference" | "checkbox"
  placeholder?: string
  hint?: string
  required?: boolean
  options?: Choice[]
  source?: ReferenceSource
  min?: string
}
export type WorkflowContext = { organizationId: string; branchId: string }
export type Workflow = {
  title: string
  description: string
  submitLabel: string
  successMessage: string
  confirm?: string
  fields: WorkflowField[]
  initial: (context: WorkflowContext) => FormValues
  body: (values: FormValues, context: WorkflowContext) => Record<string, unknown>
}

const today = () => new Date().toISOString().slice(0, 10)
const nowLocal = () => {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
  return date.toISOString().slice(0, 16)
}
const members: ReferenceSource = { path: c => `/organizations/${c.organizationId}/members?branchId=${encodeURIComponent(c.branchId)}&limit=100`, labelKeys: ["fullNameAr", "memberName", "fullName", "displayName"], subtitleKeys: ["memberNumber", "phoneE164"] }
const packages: ReferenceSource = { path: c => `/organizations/${c.organizationId}/packages?branchId=${encodeURIComponent(c.branchId)}&limit=100`, labelKeys: ["nameAr", "packageName", "name"], subtitleKeys: ["code"] }
const resources: ReferenceSource = { path: c => `/organizations/${c.organizationId}/bookable-resources?branchId=${encodeURIComponent(c.branchId)}&limit=100`, labelKeys: ["nameAr", "resourceName", "name"], subtitleKeys: ["type"] }
const invoices: ReferenceSource = { path: c => `/organizations/${c.organizationId}/invoices?branchId=${encodeURIComponent(c.branchId)}&limit=100`, labelKeys: ["invoiceNumber", "number"], subtitleKeys: ["buyerName", "outstandingMinor"] }
const positions: ReferenceSource = { path: c => `/organizations/${c.organizationId}/positions?limit=100`, labelKeys: ["nameAr", "positionName", "name"], subtitleKeys: ["code"] }
const meals: ReferenceSource = { path: c => `/organizations/${c.organizationId}/restaurant/meals?branchId=${encodeURIComponent(c.branchId)}&limit=100`, labelKeys: ["nameAr", "mealName", "name"], subtitleKeys: ["categoryName"] }

export const workflows: Record<string, Workflow> = {
  registerMember: {
    title: "تسجيل عضو جديد", description: "أدخل البيانات الأساسية. يمكنك استكمال الملف والمستندات بعد الحفظ.", submitLabel: "تسجيل العضو", successMessage: "تم تسجيل العضو بنجاح.",
    fields: [
      { name: "fullNameAr", label: "الاسم الكامل", required: true, placeholder: "مثال: أحمد محمد العتيبي" },
      { name: "phoneE164", label: "رقم الجوال", type: "tel", required: true, placeholder: "+966 5X XXX XXXX" },
      { name: "gender", label: "الجنس", type: "select", required: true, options: [{ value: "MALE", label: "ذكر" }, { value: "FEMALE", label: "أنثى" }] },
      { name: "birthDate", label: "تاريخ الميلاد", type: "date", required: true },
      { name: "nationality", label: "الجنسية", placeholder: "مثال: سعودي" },
      { name: "notes", label: "ملاحظات", type: "textarea", placeholder: "أي معلومات مهمة لفريق الاستقبال" },
    ],
    initial: () => ({ fullNameAr: "", phoneE164: "+9665", gender: "MALE", birthDate: "", nationality: "SA", notes: "" }),
    body: (v, c) => ({ branchId: c.branchId, fullNameAr: v.fullNameAr, gender: v.gender, birthDate: v.birthDate, nationality: v.nationality || undefined, registeredOn: today(), contacts: v.phoneE164 ? [{ type: "PHONE", value: v.phoneE164, isPrimary: true }] : [], notes: v.notes || undefined }),
  },
  createSubscription: {
    title: "إنشاء اشتراك", description: "اختر العضو والباقة وتاريخ البداية، ثم راجع البيانات قبل الحفظ.", submitLabel: "إنشاء الاشتراك", successMessage: "تم إنشاء الاشتراك بنجاح.",
    fields: [
      { name: "memberId", label: "العضو", type: "reference", source: members, required: true, placeholder: "اختر عضوًا" },
      { name: "packageId", label: "الباقة", type: "reference", source: packages, required: true, placeholder: "اختر باقة" },
      { name: "startsOn", label: "تاريخ البداية", type: "date", required: true },
      { name: "notes", label: "ملاحظات", type: "textarea" },
    ], initial: () => ({ memberId: "", packageId: "", startsOn: today(), notes: "" }),
    body: (v, c) => ({ memberId: v.memberId, packageId: v.packageId, sellingBranchId: c.branchId, startsOn: v.startsOn, notes: v.notes || undefined }),
  },
  recordManualAttendance: {
    title: "تسجيل دخول", description: "امسح بطاقة العضو أو اكتب الرقم الموجود عليها. ستظهر نتيجة السماح بالدخول فورًا.", submitLabel: "التحقق وتسجيل الدخول", successMessage: "تم تسجيل محاولة الدخول.",
    fields: [{ name: "credentialValue", label: "رقم بطاقة الدخول", required: true, placeholder: "امسح البطاقة أو اكتب رقمها", hint: "وجّه المؤشر داخل الحقل ثم امسح البطاقة." }],
    initial: () => ({ credentialValue: "" }), body: (v, c) => ({ branchId: c.branchId, credentialValue: v.credentialValue, occurredAt: new Date().toISOString() }),
  },
  createManualReservation: {
    title: "حجز جديد", description: "اختر العضو والمرفق المناسب، وسيتم التحقق من التوفر قبل تأكيد الحجز.", submitLabel: "تأكيد الحجز", successMessage: "تم إنشاء الحجز بنجاح.",
    fields: [
      { name: "memberId", label: "العضو", type: "reference", source: members, required: true },
      { name: "resourceId", label: "الحصة أو المرفق", type: "reference", source: resources, required: true },
      { name: "startsAt", label: "الموعد", type: "datetime-local", required: true },
      { name: "seats", label: "عدد المقاعد", type: "number", min: "1", required: true },
    ], initial: () => ({ memberId: "", resourceId: "", startsAt: nowLocal(), seats: "1" }),
    body: (v, c) => ({ branchId: c.branchId, memberId: v.memberId, resourceId: v.resourceId, type: "SESSION", startsAt: new Date(String(v.startsAt)).toISOString(), seats: Number(v.seats) }),
  },
  recordPayment: {
    title: "تسجيل دفعة غير نقدية", description: "للتحويل أو البطاقة. أما النقد فيُسجل من نقطة البيع لربطه بالصندوق والوردية.", submitLabel: "تسجيل الدفعة", successMessage: "تم تسجيل الدفعة بنجاح.", confirm: "راجع المبلغ وطريقة الدفع قبل التأكيد؛ سيُضاف التحصيل إلى السجل المالي.",
    fields: [
      { name: "invoiceId", label: "الفاتورة", type: "reference", source: invoices, required: true },
      { name: "amount", label: "المبلغ (ر.س)", type: "number", min: "0.01", required: true, placeholder: "0.00" },
      { name: "method", label: "طريقة الدفع", type: "select", required: true, options: [{ value: "CARD", label: "بطاقة بنكية" }, { value: "BANK_TRANSFER", label: "تحويل بنكي" }] },
      { name: "externalReference", label: "مرجع الدفع", placeholder: "اختياري" },
    ], initial: () => ({ invoiceId: "", amount: "", method: "CARD", externalReference: "" }),
    body: (v, c) => { const amountMinor = String(Math.round(Number(v.amount) * 100)); return { collectionBranchId: c.branchId, method: v.method, amountMinor, allocations: [{ invoiceId: v.invoiceId, amountMinor }], externalReference: v.externalReference || undefined } },
  },
  createCrmLead: {
    title: "إضافة عميل محتمل", description: "سجّل وسيلة التواصل واهتمام العميل ليتمكن الفريق من متابعته.", submitLabel: "إضافة العميل", successMessage: "تمت إضافة العميل إلى قائمة المتابعة.",
    fields: [
      { name: "fullName", label: "الاسم الكامل", required: true }, { name: "phoneE164", label: "رقم الجوال", type: "tel", placeholder: "+966 5X XXX XXXX" },
      { name: "email", label: "البريد الإلكتروني", type: "email", placeholder: "name@example.com" },
      { name: "originType", label: "كيف تعرف علينا؟", type: "select", options: [{ value: "WALK_IN", label: "زيارة النادي" }, { value: "PHONE", label: "اتصال هاتفي" }, { value: "WEBSITE", label: "الموقع الإلكتروني" }, { value: "REFERRAL", label: "ترشيح" }, { value: "SOCIAL_MEDIA", label: "التواصل الاجتماعي" }, { value: "OTHER", label: "أخرى" }] },
      { name: "interestType", label: "الاهتمام", type: "select", options: [{ value: "GENERAL", label: "استفسار عام" }, { value: "PACKAGE", label: "باقة عضوية" }, { value: "PERSONAL_TRAINING", label: "تدريب شخصي" }, { value: "MEAL_PLAN", label: "خطة غذائية" }] },
      { name: "notes", label: "ملاحظات المتابعة", type: "textarea" },
    ], initial: () => ({ fullName: "", phoneE164: "+9665", email: "", originType: "WALK_IN", interestType: "GENERAL", notes: "" }),
    body: (v, c) => ({ branchId: c.branchId, fullName: v.fullName, phoneE164: v.phoneE164 || undefined, email: v.email || undefined, originType: v.originType, interestType: v.interestType, notes: v.notes || undefined }),
  },
  checkoutOrder: {
    title: "طلب مطعم جديد", description: "اختر العضو والصنف والكمية. سيُحتسب السعر المعتمد تلقائيًا.", submitLabel: "إنشاء الطلب", successMessage: "تم إنشاء الطلب وإرساله للمتابعة.",
    fields: [
      { name: "memberId", label: "العضو", type: "reference", source: members, required: true },
      { name: "mealId", label: "الصنف", type: "reference", source: meals, required: true },
      { name: "quantity", label: "الكمية", type: "number", min: "1", required: true },
    ], initial: () => ({ memberId: "", mealId: "", quantity: "1" }),
    body: (v, c) => ({ sellingBranchId: c.branchId, buyerType: "MEMBER", buyerMemberId: v.memberId, lines: [{ targetType: "RESTAURANT_MEAL", targetId: v.mealId, quantity: Number(v.quantity) }] }),
  },
  createEmployee: {
    title: "إضافة موظف", description: "أدخل بيانات الموظف واختر المسمى الوظيفي لبداية عمل واضحة.", submitLabel: "إضافة الموظف", successMessage: "تمت إضافة الموظف بنجاح.",
    fields: [
      { name: "fullNameAr", label: "اسم الموظف", required: true }, { name: "phoneE164", label: "رقم الجوال", type: "tel", placeholder: "+966 5X XXX XXXX" },
      { name: "positionId", label: "المسمى الوظيفي", type: "reference", source: positions, required: true }, { name: "startsOn", label: "تاريخ بدء العمل", type: "date", required: true },
    ], initial: () => ({ fullNameAr: "", phoneE164: "+9665", positionId: "", startsOn: today() }),
    body: (v, c) => ({ fullNameAr: v.fullNameAr, phoneE164: v.phoneE164 || undefined, branchId: c.branchId, positionId: v.positionId, startsOn: v.startsOn }),
  },
  requestReportingRebuild: {
    title: "تحديث بيانات التقارير", description: "استخدم هذا الإجراء فقط إذا كانت أرقام التقارير لا تعكس آخر العمليات.", submitLabel: "بدء التحديث", successMessage: "بدأ تحديث بيانات التقارير. يمكنك متابعة العمل وسيكتمل في الخلفية.", confirm: "قد يستغرق تحديث التقارير عدة دقائق. هل تريد المتابعة؟",
    fields: [{ name: "reason", label: "سبب التحديث", type: "textarea", required: true, placeholder: "اكتب سبب طلب التحديث" }], initial: () => ({ reason: "" }), body: v => ({ reason: v.reason }),
  },
  provisionUserAccount: {
    title: "إضافة حساب موظف", description: "أنشئ حساب دخول جديدًا، ثم حدّد صلاحياته من صفحة الأدوار.", submitLabel: "إنشاء الحساب", successMessage: "تم إنشاء الحساب، ويمكنك الآن إسناد الصلاحيات المناسبة.",
    fields: [{ name: "email", label: "البريد الإلكتروني للموظف", type: "email", required: true, placeholder: "name@example.com" }, { name: "password", label: "كلمة المرور المؤقتة", type: "password", required: true, hint: "12 حرفًا على الأقل؛ لا تُحفظ أو تُعرض بعد الإرسال." }, { name: "requiresMfa", label: "طلب تحقق إضافي عند الإجراءات الحساسة", type: "checkbox" }],
    initial: () => ({ email: "", password: "", requiresMfa: true }), body: v => ({ loginMethod: "STAFF_EMAIL_PASSWORD", email: v.email, password: v.password, requiresMfa: Boolean(v.requiresMfa) }),
  },
}
