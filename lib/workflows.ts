import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy"

export type Choice = { value: string; label: string; disabled?: boolean }
export type FormValues = Record<string, string | boolean | File | undefined>
export type ReferenceSource = {
  path: (context: WorkflowContext) => string
  labelKeys: string[]
  subtitleKeys?: string[]
  searchParam?: string
}
export type WorkflowField = {
  name: string
  label: string
  type?: "text" | "tel" | "email" | "password" | "date" | "datetime-local" | "time" | "number" | "textarea" | "select" | "reference" | "checkbox" | "file"
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
const normalizedOptionalPhone = (value: FormValues[string]) => {
  const phone = String(value ?? "").replace(/[\s()-]/gu, "")
  return phone || undefined
}
const members: ReferenceSource = { path: c => `/organizations/${c.organizationId}/members?branchId=${encodeURIComponent(c.branchId)}&limit=25`, labelKeys: ["name", "fullNameAr", "memberName", "fullName", "displayName"], subtitleKeys: ["memberNumber", "legacyMemberNumber", "phoneE164", "nationalId"], searchParam: "search" }
const packages: ReferenceSource = { path: c => `/organizations/${c.organizationId}/packages?branchId=${encodeURIComponent(c.branchId)}&limit=100`, labelKeys: ["nameAr", "packageName", "name"], subtitleKeys: ["code"] }
const resources: ReferenceSource = { path: c => `/organizations/${c.organizationId}/bookable-resources?branchId=${encodeURIComponent(c.branchId)}&limit=100`, labelKeys: ["nameAr", "resourceName", "name"], subtitleKeys: ["type"] }
const services: ReferenceSource = { path: c => `/organizations/${c.organizationId}/services?branchId=${encodeURIComponent(c.branchId)}&limit=100`, labelKeys: ["nameAr", "serviceName", "name"], subtitleKeys: ["code"] }
const invoices: ReferenceSource = { path: c => `/organizations/${c.organizationId}/invoices?branchId=${encodeURIComponent(c.branchId)}&limit=100`, labelKeys: ["invoiceNumber", "number"], subtitleKeys: ["buyerName", "outstandingMinor"] }
const positions: ReferenceSource = { path: c => `/organizations/${c.organizationId}/positions?limit=100`, labelKeys: ["nameAr", "positionName", "name"], subtitleKeys: ["code"] }
const meals: ReferenceSource = { path: c => `/organizations/${c.organizationId}/restaurant/meals?branchId=${encodeURIComponent(c.branchId)}&limit=100`, labelKeys: ["nameAr", "mealName", "name"], subtitleKeys: ["categoryName"] }
const employees: ReferenceSource = { path: c => `/organizations/${c.organizationId}/employees?branchId=${encodeURIComponent(c.branchId)}&limit=100`, labelKeys: ["name", "fullNameAr", "displayName"], subtitleKeys: ["employeeNumber"] }
const otherIncomeCategories: ReferenceSource = { path: c => `/organizations/${c.organizationId}/other-income-categories`, labelKeys: ["name", "nameAr"], subtitleKeys: ["code"] }
const expenseCategories: ReferenceSource = { path: c => `/organizations/${c.organizationId}/expense-categories`, labelKeys: ["name", "nameAr"], subtitleKeys: ["code"] }
const selfTrainerMembers: ReferenceSource = { path: c => `/self/organizations/${c.organizationId}/trainer/members`, labelKeys: ["memberName", "name", "fullNameAr"], subtitleKeys: ["memberNumber"] }
const measurementTypes: ReferenceSource = { path: c => `/organizations/${c.organizationId}/measurement-types?limit=100`, labelKeys: ["name", "nameAr"], subtitleKeys: ["unit", "code"] }

export const workflows: Record<string, Workflow> = {
  recordExpense: {
    title: "تسجيل مصروف", description: "سجّل المصروف أولًا، ثم أرسله للاعتماد والسداد من السجل المالي حسب حد التصنيف.", submitLabel: "تسجيل المصروف", successMessage: "تم تسجيل المصروف وأصبح جاهزًا لدورة الاعتماد.",
    fields:[{name:"categoryId",label:"تصنيف المصروف",type:"reference",source:expenseCategories,required:true},{name:"amount",label:"المبلغ (ر.س)",type:"number",min:"0.01",required:true},{name:"description",label:"البيان والغرض",type:"textarea",required:true}],
    initial:()=>({categoryId:"",amount:"",description:""}),body:(v,c)=>({branchId:c.branchId,categoryId:v.categoryId,amountMinor:String(Math.round(Number(v.amount)*100)),description:v.description}),
  },
  recordSelfTrainerMeasurement: {
    title: "تسجيل قياس للمتدرب", description: "اختر العضو ونوع القياس وسجّل القيمة كما ظهرت في جهاز القياس.", submitLabel: "حفظ القياس", successMessage: "تم حفظ القياس في ملف العضو.",
    fields:[{name:"memberId",label:"العضو",type:"reference",source:selfTrainerMembers,required:true},{name:"measurementTypeId",label:"نوع القياس",type:"reference",source:measurementTypes,required:true},{name:"value",label:"القيمة",type:"number",required:true},{name:"notes",label:"ملاحظات",type:"textarea"}],
    initial:()=>({memberId:"",measurementTypeId:"",value:"",notes:""}),body:(v,c)=>({branchId:c.branchId,memberId:v.memberId,values:[{measurementTypeId:v.measurementTypeId,value:String(v.value)}],measuredAt:new Date().toISOString(),notes:v.notes||undefined}),
  },
  recordOtherIncome: {
    title: "تسجيل إيراد آخر", description: "سجّل إيرادًا غير مرتبط بفاتورة. التحصيل النقدي يتم من نقطة البيع لربطه بالوردية والصندوق.", submitLabel: "تسجيل الإيراد", successMessage: "تم تسجيل الإيراد في السجل المالي.",
    fields: [{name:"categoryId",label:"تصنيف الإيراد",type:"reference",source:otherIncomeCategories,required:true},{name:"amount",label:"المبلغ (ر.س)",type:"number",min:"0.01",required:true},{name:"paymentMethodCode",label:"طريقة التحصيل",type:"select",required:true,options:[{value:"CARD",label:"بطاقة بنكية"},{value:"BANK_TRANSFER",label:"تحويل بنكي"},{value:"GATEWAY",label:"بوابة دفع"},{value:"WALLET",label:"محفظة إلكترونية"}]},{name:"description",label:"البيان",type:"textarea",required:true}],
    initial:()=>({categoryId:"",amount:"",paymentMethodCode:"CARD",description:""}),body:(v,c)=>({branchId:c.branchId,categoryId:v.categoryId,amountMinor:String(Math.round(Number(v.amount)*100)),paymentMethodCode:v.paymentMethodCode,description:v.description,occurredAt:new Date().toISOString()}),
  },
  scheduleEmployeeShift: {
    title: "جدولة مناوبة", description: "اختر الموظف وحدد بداية ونهاية المناوبة في الفرع الحالي.", submitLabel: "حفظ المناوبة", successMessage: "تمت جدولة المناوبة بنجاح.",
    fields: [{ name: "employeeId", label: "الموظف", type: "reference", source: employees, required: true }, { name: "startsAt", label: "بداية المناوبة", type: "datetime-local", required: true }, { name: "endsAt", label: "نهاية المناوبة", type: "datetime-local", required: true }, { name: "notes", label: "ملاحظات", type: "textarea" }],
    initial: () => { const startsAt=nowLocal();const end=new Date(new Date(startsAt).getTime()+8*60*60_000);return{employeeId:"",startsAt,endsAt:new Date(end.getTime()-end.getTimezoneOffset()*60_000).toISOString().slice(0,16),notes:""} },
    body: (v,c) => ({branchId:c.branchId,employeeId:v.employeeId,startsAt:new Date(String(v.startsAt)).toISOString(),endsAt:new Date(String(v.endsAt)).toISOString(),notes:v.notes||undefined}),
  },
  registerMember: {
    title: "تسجيل عضو جديد", description: "أدخل البيانات الأساسية، ويمكنك إرفاق صورة العضو وصورة الهوية اختياريًا في الخطوة نفسها.", submitLabel: "تسجيل العضو", successMessage: "تم تسجيل العضو بنجاح.",
    fields: [
      { name: "fullNameAr", label: "الاسم الكامل", required: true, placeholder: "مثال: أحمد محمد العتيبي" },
      { name: "phoneE164", label: "رقم الجوال", type: "tel", required: true, placeholder: "+966 5X XXX XXXX" },
      { name: "nationalId", label: "رقم الهوية", required: true, placeholder: "أدخل رقم الهوية أو الإقامة" },
      { name: "gender", label: "الجنس", type: "select", required: true, options: [{ value: "MALE", label: "ذكر" }, { value: "FEMALE", label: "أنثى" }] },
      { name: "birthDate", label: "تاريخ الميلاد", type: "date", required: true },
      { name: "nationality", label: "الجنسية", placeholder: "مثال: سعودي" },
      { name: "identityImage", label: "صورة الهوية (اختياري)", type: "file", hint: "JPG أو PNG أو PDF، حتى 10 ميجابايت." },
      { name: "profileImage", label: "صورة العضو (اختياري)", type: "file", hint: "JPG أو PNG، حتى 10 ميجابايت." },
      { name: "notes", label: "ملاحظات", type: "textarea", placeholder: "أي معلومات مهمة لفريق الاستقبال" },
    ],
    initial: () => ({ fullNameAr: "", phoneE164: "", nationalId: "", gender: "MALE", birthDate: "", nationality: "سعودي", identityImage: undefined, profileImage: undefined, notes: "" }),
    body: (v, c) => ({ registrationBranchId: c.branchId, name: v.fullNameAr, nationalId: v.nationalId, gender: v.gender, birthDate: v.birthDate || undefined, nationalityCode: v.nationality || undefined, contacts: normalizedOptionalPhone(v.phoneE164) ? [{ type: "PHONE", value: normalizedOptionalPhone(v.phoneE164), isPrimary: true }] : [], notes: v.notes || undefined }),
  },
  createSubscription: {
    title: "بيع باقة وإصدار فاتورة", description: "اختر العضو والباقة وتاريخ البداية. سيُنشئ النظام طلب بيع وفاتورة معلّقة، ويُفعّل الاشتراك تلقائيًا فور تحصيلها.", submitLabel: "إنشاء الاشتراك والفاتورة", successMessage: "تم إنشاء الاشتراك والفاتورة المعلّقة. يمكن تحصيلها من نقطة البيع.",
    fields: [
      { name: "memberId", label: "العضو", type: "reference", source: members, required: true, placeholder: "اختر عضوًا" },
      { name: "packageId", label: "الباقة", type: "reference", source: packages, required: true, placeholder: "اختر باقة" },
      { name: "startAt", label: "تاريخ ووقت البداية", type: "datetime-local", required: true },
    ], initial: () => ({ memberId: "", packageId: "", startAt: nowLocal() }),
    body: (v, c) => ({ memberId: v.memberId, packageId: v.packageId, sellingBranchId: c.branchId, startAt: new Date(String(v.startAt)).toISOString() }),
  },
  recordManualAttendance: {
    title: "تسجيل دخول", description: "امسح بطاقة العضو أو اكتب الرقم الموجود عليها. ستظهر نتيجة السماح بالدخول فورًا.", submitLabel: "التحقق وتسجيل الدخول", successMessage: "تم تسجيل محاولة الدخول.",
    fields: [{ name: "memberId", label: "العضو", type: "reference", source: members, required: true, placeholder: "اختر العضو بالاسم أو رقم العضوية" }],
    initial: () => ({ memberId: "" }), body: (v, c) => ({ branchId: c.branchId, memberId: v.memberId }),
  },
  createManualReservation: {
    title: "حجز جديد", description: "اختر العضو والمرفق المناسب، وسيتم التحقق من التوفر قبل تأكيد الحجز.", submitLabel: "تأكيد الحجز", successMessage: "تم إنشاء الحجز بنجاح.",
    fields: [
      { name: "customerType", label: "نوع العميل", type: "select", required: true, options: [{ value: "MEMBER", label: "عضو" }, { value: "VISITOR", label: "زائر" }] },
      { name: "memberId", label: "العضو", type: "reference", source: members, required: true },
      { name: "guestName", label: "اسم الزائر", required: true, placeholder: "الاسم الكامل" },
      { name: "guestPhoneE164", label: "جوال الزائر", type: "tel", required: true, placeholder: "+966 5X XXX XXXX" },
      { name: "guestEmail", label: "البريد الإلكتروني للزائر (اختياري)", type: "email", placeholder: "name@example.com" },
      { name: "serviceId", label: "الخدمة", type: "reference", source: services, required: true },
      { name: "resourceId", label: "الحصة أو المرفق", type: "reference", source: resources, required: true },
      { name: "startsAt", label: "بداية الحجز", type: "datetime-local", required: true },
      { name: "endsAt", label: "نهاية الحجز", type: "datetime-local", required: true },
      { name: "seats", label: "عدد المقاعد", type: "number", min: "1", required: true },
    ], initial: () => { const startsAt=nowLocal(); const ends=new Date(new Date(startsAt).getTime()+60*60_000); return { customerType: "MEMBER", memberId: "", guestName: "", guestPhoneE164: "", guestEmail: "", serviceId: "", resourceId: "", startsAt, endsAt: new Date(ends.getTime()-ends.getTimezoneOffset()*60_000).toISOString().slice(0,16), seats: "1" } },
    body: (v, c) => ({ branchId: c.branchId, ...(v.customerType === "VISITOR" ? { guestName: v.guestName, guestPhoneE164: normalizedOptionalPhone(v.guestPhoneE164), guestEmail: v.guestEmail || undefined } : { memberId: v.memberId }), serviceId: v.serviceId, resourceId: v.resourceId, type: "COURT", startsAt: new Date(String(v.startsAt)).toISOString(), endsAt: new Date(String(v.endsAt)).toISOString(), seats: Number(v.seats) }),
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
    ], initial: () => ({ fullName: "", phoneE164: "", email: "", originType: "WALK_IN", interestType: "GENERAL", notes: "" }),
    body: (v, c) => ({ branchId: c.branchId, fullName: String(v.fullName).trim(), phone: normalizedOptionalPhone(v.phoneE164), email: String(v.email ?? "").trim().toLowerCase() || undefined, originType: v.originType, interestType: v.interestType, notes: String(v.notes ?? "").trim() || undefined }),
  },
  checkoutOrder: {
    title: "طلب مطعم جديد", description: "اختر العضو والصنف والكمية. سيُحتسب السعر المعتمد تلقائيًا.", submitLabel: "إنشاء الطلب", successMessage: "تم إنشاء الطلب وإرساله للمتابعة.",
    fields: [
      { name: "memberId", label: "العضو", type: "reference", source: members, required: true },
      { name: "mealId", label: "الصنف", type: "reference", source: meals, required: true },
      { name: "quantity", label: "الكمية", type: "number", min: "1", required: true },
    ], initial: () => ({ memberId: "", mealId: "", quantity: "1" }),
    body: (v, c) => ({ sellingBranchId: c.branchId, memberId: v.memberId, memberSegment: "OTHER", lines: [{ type: "RESTAURANT", targetId: v.mealId, quantity: Number(v.quantity) }] }),
  },
  createEmployee: {
    title: "إضافة موظف وحساب دخول", description: "أنشئ الموظف وحسابه في خطوة واحدة. سيدخل بالرقم الوظيفي وكلمة المرور، وتُطبق صلاحيات المسمى داخل فرع عمله تلقائيًا.", submitLabel: "إنشاء الموظف وحسابه", successMessage: "تم إنشاء الموظف وربط الحساب والمسمى والصلاحيات بنجاح.",
    fields: [
      { name: "employeeNumber", label: "الرقم الوظيفي", required: true, placeholder: "EMP001", hint: "يبدأ بـ EMP ثم من 3 إلى 10 أرقام، ويُستخدم في تسجيل الدخول." },
      { name: "password", label: "كلمة المرور", type: "password", required: true, placeholder: `${MIN_PASSWORD_LENGTH} محارف على الأقل`, hint: "يمكن استخدام أرقام فقط أو حروف فقط أو خليط منهما. لا تُحفظ كلمة المرور داخل قاعدة بيانات النظام ولا تظهر بعد الإرسال." },
      { name: "confirmPassword", label: "تأكيد كلمة المرور", type: "password", required: true, placeholder: "أعد كتابة كلمة المرور" },
      { name: "fullNameAr", label: "اسم الموظف", required: true }, { name: "phoneE164", label: "رقم الجوال", type: "tel", placeholder: "+966 5X XXX XXXX" },
      { name: "email", label: "البريد الإلكتروني (اختياري)", type: "email", placeholder: "name@example.com" },
      { name: "positionId", label: "المسمى الوظيفي والصلاحيات", type: "reference", source: positions, required: true }, { name: "startsOn", label: "تاريخ بدء العمل", type: "date", required: true },
      { name: "identityImage", label: "صورة الهوية", type: "file", required: true, hint: "JPG أو PNG أو PDF، حتى 10 ميجابايت." },
      { name: "profileImage", label: "صورة الموظف (اختياري)", type: "file", hint: "JPG أو PNG، حتى 10 ميجابايت." },
    ], initial: () => ({ employeeNumber: "", password: "", confirmPassword: "", fullNameAr: "", phoneE164: "", email: "", positionId: "", startsOn: today() }),
    body: (v, c) => ({ employeeNumber: String(v.employeeNumber ?? "").trim().toUpperCase(), password: v.password, name: String(v.fullNameAr ?? "").trim(), phone: normalizedOptionalPhone(v.phoneE164), email: String(v.email ?? "").trim().toLowerCase() || undefined, hireDate: v.startsOn, initialBranchId: c.branchId, initialPositionId: v.positionId }),
  },
  requestReportingRebuild: {
    title: "تحديث بيانات التقارير", description: "استخدم هذا الإجراء فقط إذا كانت أرقام التقارير لا تعكس آخر العمليات.", submitLabel: "بدء التحديث", successMessage: "بدأ تحديث بيانات التقارير. يمكنك متابعة العمل وسيكتمل في الخلفية.", confirm: "قد يستغرق تحديث التقارير عدة دقائق. هل تريد المتابعة؟",
    fields: [{ name: "reason", label: "سبب التحديث", type: "textarea", required: true, placeholder: "اكتب سبب طلب التحديث" }], initial: () => ({ reason: "" }), body: v => ({ reason: v.reason }),
  },
}
