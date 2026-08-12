import { ApiError } from "@/lib/api-client"

const messages: Record<string, string> = {
  permission_denied: "لا تملك الصلاحية اللازمة لإتمام هذا الإجراء.",
  account_profile_conflict: "تم تحديث الحساب من مكان آخر. حدّث الصفحة ثم حاول مجددًا.",
  crm_lead_contact_required: "أدخل رقم جوال أو بريدًا إلكترونيًا على الأقل.",
  crm_interest_reference_invalid: "اختر اهتمامًا متاحًا من القائمة.",
  crm_lead_reason_required: "اكتب سبب تغيير الحالة للمتابعة.",
  crm_converted_member_required: "اختر العضو الذي تم تحويله.",
  crm_follow_up_outcome_required: "اختر نتيجة المتابعة.",
  idempotency_conflict: "تغيّرت بيانات الطلب. أغلق النافذة وحاول مرة أخرى.",
}

export function humanError(error: unknown, fallback = "تعذر إكمال الإجراء. حاول مرة أخرى.") {
  if (error instanceof ApiError) {
    if (messages[error.problem.code]) return messages[error.problem.code]
    if (error.problem.status === 401) return "انتهت جلستك. سجّل الدخول مرة أخرى."
    if (error.problem.status === 403) return "لا تملك الصلاحية اللازمة لإتمام هذا الإجراء."
    if (error.problem.status === 404) return "لم يعد هذا السجل متاحًا. حدّث الصفحة وحاول مجددًا."
    if (error.problem.status === 409) return "تم تحديث البيانات من مكان آخر. حدّث الصفحة ثم حاول مجددًا."
    if (error.problem.status === 429) return "عدد المحاولات كبير. انتظر قليلًا ثم حاول مجددًا."
    if (error.problem.status >= 500) return "الخدمة غير متاحة مؤقتًا. حاول بعد قليل."
    return error.problem.detail || fallback
  }
  return fallback
}
