import { ApiError } from "@/lib/api-client"

const messages: Record<string, string> = {
  invalid_credentials: "الرقم الوظيفي أو البريد أو كلمة المرور غير صحيحة.",
  invalid_auth_response: "تعذر إنشاء جلسة الدخول. حاول مرة أخرى.",
  internal_error: "خدمة تسجيل الدخول غير متاحة مؤقتًا. حاول بعد قليل.",
  unexpected_error: "خدمة تسجيل الدخول غير متاحة مؤقتًا. حاول بعد قليل.",
  system_role_immutable: "دور مسؤول النظام محمي ولا يمكن تعديل صلاحياته. أنشئ دورًا مخصصًا أو عدّل دورًا آخر.",
  permission_denied: "لا تملك الصلاحية اللازمة لإتمام هذا الإجراء.",
  account_profile_conflict: "تم تحديث الحساب من مكان آخر. حدّث الصفحة ثم حاول مجددًا.",
  crm_lead_contact_required: "أدخل رقم جوال أو بريدًا إلكترونيًا على الأقل.",
  crm_interest_reference_invalid: "اختر اهتمامًا متاحًا من القائمة.",
  crm_lead_reason_required: "اكتب سبب تغيير الحالة للمتابعة.",
  crm_converted_member_required: "اختر العضو الذي تم تحويله.",
  crm_follow_up_outcome_required: "اختر نتيجة المتابعة.",
  idempotency_conflict: "تغيّرت بيانات الطلب. أغلق النافذة وحاول مرة أخرى.",
  request_validation_failed: "تعذر حفظ التعديل لأن بيانات القائمة تغيّرت بصورة غير متوقعة. حدّث الصفحة ثم حاول مرة أخرى.",
  price_not_found: "لا يوجد سعر ساري لهذه الباقة في الفرع الحالي. أضف سعرًا للفرع من إعداد النظام ثم أعد المحاولة.",
  package_not_published: "هذه الباقة ما زالت مسودة وغير متاحة للبيع. انشرها أولًا من إعداد النظام.",
  package_branch_not_allowed: "هذه الباقة غير متاحة للبيع في الفرع الحالي. راجع فروع الباقة.",
  member_not_active: "لا يمكن إنشاء الاشتراك لأن حالة العضو غير نشطة.",
  branch_not_active: "الفرع الحالي غير نشط ولا يقبل عمليات جديدة.",
  package_snapshot_missing: "بيانات الباقة غير مكتملة. راجع الباقة وسعرها وسياساتها ثم حاول مجددًا.",
  subscription_conflict: "تعذر إنشاء الاشتراك بسبب تعارض في رقم أو دورة اشتراك سابقة. حدّث القائمة ثم أعد المحاولة؛ لن ينشئ النظام اشتراكًا مكررًا.",
  subscription_reference_invalid: "بيانات العضو أو الباقة أو الفرع لم تعد صالحة. أعد اختيار العضو والباقة من القوائم المحدثة.",
  retail_category_update_conflict: "تغير تصنيف المنتج أثناء التعديل. حدّث القائمة ثم أعد المحاولة.",
  retail_product_update_conflict: "تغير المنتج أثناء التعديل. حدّث القائمة ثم أعد المحاولة.",
  retail_price_update_conflict: "تغير السعر أثناء التعديل. حدّث القائمة ثم أعد المحاولة.",
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
