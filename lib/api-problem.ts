export type ApiProblem = {
  type: string
  title: string
  status: number
  detail: string
  code: string
  correlationId?: string
  errors?: Array<{ path?: (string | number)[]; message: string; code?: string }>
}

type UnknownRecord = Record<string, unknown>

const publicCopy: Record<number, { title: string; detail: string }> = {
  400: { title: "بيانات تحتاج إلى مراجعة", detail: "راجع البيانات المدخلة ثم حاول مرة أخرى." },
  401: { title: "يلزم تسجيل الدخول", detail: "انتهت الجلسة أو لم تعد صالحة. سجّل الدخول ثم أعد المحاولة." },
  403: { title: "لا يمكن تنفيذ الإجراء", detail: "لا تملك الصلاحية اللازمة لإتمام هذا الإجراء." },
  404: { title: "العنصر غير متاح", detail: "لم يعد العنصر المطلوب متاحًا. حدّث الصفحة ثم حاول مرة أخرى." },
  409: { title: "تعارض في تحديث البيانات", detail: "تغيّرت البيانات أثناء العمل عليها. حدّث الصفحة ثم أعد المحاولة." },
  413: { title: "حجم الطلب أكبر من المسموح", detail: "قلّل حجم البيانات أو الملف المرسل ثم حاول مرة أخرى." },
  415: { title: "نوع المحتوى غير مدعوم", detail: "أرسل البيانات أو الملف بصيغة مدعومة ثم حاول مرة أخرى." },
  422: { title: "تعذر تنفيذ الإجراء", detail: "لا يمكن تنفيذ الإجراء بالبيانات أو الحالة الحالية. راجع المدخلات ثم حاول مرة أخرى." },
  429: { title: "محاولات كثيرة", detail: "تم تنفيذ محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى." },
  500: { title: "تعذر إكمال الطلب", detail: "حدث عطل غير متوقع. حاول مرة أخرى بعد قليل." },
  502: { title: "تعذر الاتصال بالخدمة", detail: "تعذر الحصول على استجابة صحيحة من إحدى خدمات النظام. حاول مرة أخرى بعد قليل." },
  503: { title: "الخدمة غير متاحة مؤقتًا", detail: "إحدى خدمات النظام غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل." },
  504: { title: "استغرقت الخدمة وقتًا طويلًا", detail: "لم تكتمل استجابة الخدمة في الوقت المتوقع. حاول مرة أخرى بعد قليل." },
}

export function toPublicApiProblem(payload: unknown, responseStatus: number, fallbackCorrelationId?: string): ApiProblem {
  const source = isRecord(payload) ? payload : {}
  const status = normalizeStatus(responseStatus)
  const copy = publicCopy[status] ?? (status >= 500
    ? publicCopy[500]
    : { title: "تعذر إكمال الطلب", detail: "تعذر إكمال الإجراء. راجع البيانات ثم حاول مرة أخرى." })
  const code = safeToken(source.code) ?? (status >= 500 ? "unexpected_error" : "request_failed")
  const correlationId = safeCorrelationId(source.correlationId) ?? safeCorrelationId(fallbackCorrelationId)
  const errors = code === "request_validation_failed" ? normalizeValidationErrors(source.errors) : undefined

  return {
    type: `https://gofitness.local/problems/${code}`,
    title: copy.title,
    status,
    detail: copy.detail,
    code,
    ...(correlationId ? { correlationId } : {}),
    ...(errors?.length ? { errors } : {}),
  }
}

function normalizeValidationErrors(value: unknown): ApiProblem["errors"] {
  if (!Array.isArray(value)) return undefined
  const errors: NonNullable<ApiProblem["errors"]> = []
  for (const item of value.slice(0, 20)) {
    if (!isRecord(item)) continue
    const path: (string | number)[] = []
    if (Array.isArray(item.path)) {
      for (const part of item.path.slice(0, 12)) {
        if (typeof part === "number" || (typeof part === "string" && part.length <= 80)) path.push(part)
      }
    }
    const code = safeToken(item.code)
    errors.push({
      ...(path?.length ? { path } : {}),
      ...(code ? { code } : {}),
      message: validationMessage(code),
    })
  }
  return errors
}

function validationMessage(code?: string) {
  const messages: Record<string, string> = {
    invalid_type: "أدخل قيمة من النوع المطلوب.",
    invalid_format: "أدخل قيمة بالصيغة المطلوبة.",
    too_small: "القيمة أقصر أو أقل من الحد المطلوب.",
    too_big: "القيمة أطول أو أكبر من الحد المسموح.",
    invalid_value: "اختر قيمة صحيحة من الخيارات المتاحة.",
    unrecognized_keys: "تحتوي البيانات على حقول غير مسموح بها.",
    invalid_union: "القيمة لا تطابق أيًا من الخيارات المتاحة.",
  }
  return code ? messages[code] ?? "راجع هذه القيمة ثم حاول مرة أخرى." : "راجع هذه القيمة ثم حاول مرة أخرى."
}

function normalizeStatus(value: number) {
  return Number.isInteger(value) && value >= 400 && value <= 599 ? value : 500
}

function safeToken(value: unknown) {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,79}$/u.test(value) ? value : undefined
}

function safeCorrelationId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9._:-]{1,128}$/u.test(value) ? value : undefined
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
