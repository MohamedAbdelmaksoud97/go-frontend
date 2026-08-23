import { ApiError } from "@/lib/api-client";

const messages: Record<string, string> = {
  self_trainer_not_found:
    "حساب الموظف غير مرتبط بملف مدرب نشط. أنشئ ملف المدرب واربطه بالموظف ثم عيّنه إلى الفرع.",
  trainer_not_found:
    "ملف المدرب المحدد غير موجود أو لم يعد متاحًا في هذا النادي.",
  trainer_not_active:
    "ملف المدرب غير نشط. فعّله أولًا قبل إنشاء أي تعيين جديد.",
  trainer_branch_assignment_missing:
    "المدرب غير معيّن إلى الفرع خلال الفترة المحددة. عيّنه إلى الفرع أولًا ثم أعد المحاولة.",
  coaching_conflict:
    "يوجد تعيين متداخل أو مكرر بالفعل. راجع تعيينات المدرب والعضو والفترة المحددة.",
  invalid_credentials: "الرقم الوظيفي أو البريد أو كلمة المرور غير صحيحة.",
  invalid_auth_response: "تعذر إنشاء جلسة الدخول. حاول مرة أخرى.",
  feedback_not_found:
    "لم تعد هذه التذكرة متاحة. حدّث القائمة ثم اختر التذكرة مرة أخرى.",
  feedback_transition_conflict:
    "تغيّرت حالة التذكرة أثناء عرضها. حدّث التذكرة وراجع حالتها ثم حاول مجددًا.",
  feedback_ticket_closed:
    "هذه التذكرة مغلقة ولا تقبل رسائل جديدة. أعد فتحها أولًا إذا احتجت إلى متابعة جديدة.",
  auth_provider_failed:
    "تعذر الاتصال بخدمة حسابات الموظفين. لم يتم إنشاء الموظف أو حفظ أي بيانات؛ انتظر لحظات ثم أعد المحاولة.",
  auth_password_update_failed:
    "تعذر تحديث كلمة المرور لدى خدمة حسابات الموظفين. لم تتغير كلمة المرور الحالية.",
  employee_login_address_rejected:
    "تعذر تجهيز معرّف الدخول الداخلي للموظف. راجع الرقم الوظيفي ثم حاول مجددًا.",
  employee_number_exists:
    "الرقم الوظيفي مستخدم بالفعل لموظف آخر. افتح سجل الموظف الموجود لتعديل بياناته أو تغيير كلمة مروره.",
  employee_conflict:
    "يوجد موظف مسجل بالفعل بنفس الرقم الوظيفي أو البيانات الأساسية.",
  auth_identity_exists:
    "يوجد حساب دخول مرتبط بهذا الرقم بالفعل. افتح سجل الموظف الموجود واستخدم تغيير كلمة المرور.",
  member_activation_phone_required:
    "لا يمكن إصدار رمز التفعيل قبل إضافة رقم جوال أساسي إلى ملف العضو.",
  member_account_already_linked:
    "هذا العضو مرتبط بالفعل بحساب دخول ولا يحتاج إلى رمز تفعيل جديد.",
  member_phone_account_exists:
    "رقم جوال العضو مرتبط بحساب دخول آخر. راجع الحسابات المرتبطة قبل المتابعة.",
  invalid_member_activation:
    "بيانات التفعيل غير صحيحة، أو انتهت صلاحية الرمز، أو سبق استخدامه. اطلب رمزًا جديدًا من الاستقبال.",
  member_activation_conflict:
    "تم استخدام رمز التفعيل أو انتهت صلاحيته أثناء العملية. اطلب رمزًا جديدًا من الاستقبال.",
  user_account_exists: "يوجد حساب دخول مسجل بالفعل بهذا الرقم.",
  system_role_immutable:
    "دور مسؤول النظام محمي ولا يمكن تعديل صلاحياته. أنشئ دورًا مخصصًا أو عدّل دورًا آخر.",
  permission_denied: "لا تملك الصلاحية اللازمة لإتمام هذا الإجراء.",
  account_profile_conflict:
    "تم تحديث الحساب من مكان آخر. حدّث الصفحة ثم حاول مجددًا.",
  crm_lead_contact_required: "أدخل رقم جوال أو بريدًا إلكترونيًا على الأقل.",
  crm_interest_reference_invalid: "اختر اهتمامًا متاحًا من القائمة.",
  crm_branch_inactive:
    "الفرع المختار غير متاح أو متوقف. اختر فرعًا نشطًا ثم حاول مجددًا.",
  crm_lead_source_inactive:
    "مصدر العميل المحتمل لم يعد متاحًا. اختر مصدرًا نشطًا.",
  crm_assignee_not_available: "الموظف المختار غير متاح للمتابعة في هذا الفرع.",
  crm_lead_duplicate:
    "يوجد عميل محتمل مسجل بالفعل من نفس المصدر. ابحث عنه في القائمة قبل إنشاء سجل جديد.",
  crm_lead_idempotency_conflict:
    "تم إرسال طلب إنشاء مختلف بنفس مرجع العملية. أغلق النافذة ثم أعد المحاولة.",
  crm_lead_not_found:
    "لم يعد سجل العميل المحتمل موجودًا. حدّث القائمة ثم حاول مجددًا.",
  crm_lead_update_conflict:
    "تغيّرت بيانات العميل المحتمل أثناء التعديل. حدّث السجل وراجع البيانات قبل الحفظ.",
  crm_lead_transition_conflict:
    "تغيّرت حالة العميل المحتمل أثناء عرضها. حدّث السجل ثم أعد الإجراء.",
  crm_lead_transition_invalid:
    "لا يمكن نقل العميل المحتمل مباشرةً إلى هذه الحالة من حالته الحالية.",
  crm_converted_lead_follow_up_forbidden:
    "تم تحويل العميل إلى عضو بالفعل، لذلك لا يمكن إضافة متابعة جديدة كسجل عميل محتمل.",
  crm_follow_up_not_found:
    "لم تعد المتابعة موجودة. حدّث القائمة ثم حاول مجددًا.",
  crm_follow_up_update_conflict:
    "تغيّرت بيانات المتابعة أثناء التعديل. حدّثها ثم أعد المحاولة.",
  crm_follow_up_transition_conflict:
    "تغيّرت حالة المتابعة أثناء عرضها. حدّثها ثم أعد الإجراء.",
  crm_follow_up_transition_invalid:
    "لا يمكن تطبيق هذه الحالة على المتابعة في وضعها الحالي.",
  crm_follow_up_idempotency_conflict:
    "تم إنشاء هذه المتابعة بالفعل أو تغيّرت بيانات طلبها. حدّث القائمة قبل المحاولة.",
  crm_lead_reason_required: "اكتب سبب تغيير الحالة للمتابعة.",
  crm_converted_member_required: "اختر العضو الذي تم تحويله.",
  crm_follow_up_outcome_required: "اختر نتيجة المتابعة.",
  idempotency_conflict: "تغيّرت بيانات الطلب. أغلق النافذة وحاول مرة أخرى.",
  idempotency_key_required:
    "تعذر تجهيز مرجع آمن للعملية. أغلق النافذة ثم افتحها وحاول مرة أخرى.",
  request_validation_failed:
    "راجع البيانات المدخلة؛ يوجد حقل مطلوب أو قيمة غير صحيحة.",
  price_not_found:
    "لا يوجد سعر ساري لهذه الباقة في الفرع الحالي. أضف سعرًا للفرع من إعداد النظام ثم أعد المحاولة.",
  package_not_published:
    "هذه الباقة ما زالت مسودة وغير متاحة للبيع. انشرها أولًا من إعداد النظام.",
  package_not_found:
    "الباقة المختارة لم تعد موجودة أو لا تنتمي إلى النادي الحالي. حدّث قائمة الباقات واخترها مجددًا.",
  package_branch_not_allowed:
    "هذه الباقة غير متاحة للبيع في الفرع الحالي. راجع فروع الباقة.",
  member_not_found:
    "العضو المختار لم يعد موجودًا أو لا ينتمي إلى النادي الحالي. ابحث عنه مجددًا بالاسم أو رقم العضوية.",
  order_not_found:
    "طلب البيع المطلوب غير موجود أو لم يعد متاحًا في نطاق الفرع الحالي.",
  member_not_active: "لا يمكن إنشاء الاشتراك لأن حالة العضو غير نشطة.",
  branch_not_active: "الفرع الحالي غير نشط ولا يقبل عمليات جديدة.",
  package_snapshot_missing:
    "بيانات الباقة غير مكتملة. راجع الباقة وسعرها وسياساتها ثم حاول مجددًا.",
  daily_menu_price_missing:
    "لا يمكن نشر القائمة: توجد وجبة بلا سعر ساري في هذا الفرع. أضف سعر الوجبة أولًا ثم أعد النشر.",
  subscription_conflict:
    "تعذر إنشاء الاشتراك بسبب تعارض في رقم أو دورة اشتراك سابقة. حدّث القائمة ثم أعد المحاولة؛ لن ينشئ النظام اشتراكًا مكررًا.",
  subscription_reference_invalid:
    "بيانات العضو أو الباقة أو الفرع لم تعد صالحة. أعد اختيار العضو والباقة من القوائم المحدثة.",
  retail_category_update_conflict:
    "تغير تصنيف المنتج أثناء التعديل. حدّث القائمة ثم أعد المحاولة.",
  retail_product_update_conflict:
    "تغير المنتج أثناء التعديل. حدّث القائمة ثم أعد المحاولة.",
  retail_price_update_conflict:
    "تغير السعر أثناء التعديل. حدّث القائمة ثم أعد المحاولة.",
};

export function humanError(
  error: unknown,
  fallback = "تعذر إكمال الإجراء. حاول مرة أخرى.",
) {
  if (error instanceof ApiError) {
    const isGenericServerError =
      error.problem.code === "internal_error" ||
      error.problem.code === "unexpected_error";
    if (error.problem.code === "request_validation_failed")
      return requestValidationMessage(error.problem);
    if (!isGenericServerError && messages[error.problem.code])
      return messages[error.problem.code];
    if (error.problem.status === 401)
      return "انتهت جلستك. سجّل الدخول مرة أخرى.  ";
    if (error.problem.status === 403)
      return "لا تملك الصلاحية اللازمة لإتمام هذا الإجراء.";
    if (error.problem.status === 404)
      return "لم يعد هذا السجل متاحًا. حدّث الصفحة وحاول مجددًا.";
    if (error.problem.status === 409)
      return "تم تحديث البيانات من مكان آخر. حدّث الصفحة ثم حاول مجددًا.";
    if (error.problem.status === 429)
      return "عدد المحاولات كبير. انتظر قليلًا ثم حاول مجددًا.";
    if (error.problem.status >= 500) {
      const tracking = error.problem.correlationId
        ? ` رقم التتبع: ${error.problem.correlationId}`
        : "";
      return `${fallback} حاول مجددًا، وإذا تكرر الخطأ أرسل رقم التتبع لمسؤول النظام.${tracking}`;
    }
    return error.problem.detail || fallback;
  }
  return fallback;
}

const fieldLabels: Record<string, string> = {
  branchId: "الفرع",
  fullName: "الاسم الكامل",
  name: "الاسم",
  phone: "رقم الجوال",
  phoneE164: "رقم الجوال",
  email: "البريد الإلكتروني",
  sourceId: "مصدر العميل",
  originType: "طريقة التعرف علينا",
  interestType: "الاهتمام",
  interestId: "تفصيل الاهتمام",
  assignedToUserAccountId: "الموظف المسؤول",
  memberId: "العضو",
  packageId: "الباقة",
  serviceId: "الخدمة",
  resourceId: "الحصة أو المرفق",
  expectedVersion: "نسخة السجل",
  status: "الحالة",
  notes: "الملاحظات",
};

function requestValidationMessage(problem: ApiError["problem"]) {
  const issue = problem.errors?.[0];
  const rawMessage = issue?.message?.toLowerCase() ?? "";
  if (rawMessage.includes("phone or email"))
    return "أدخل رقم جوال أو بريدًا إلكترونيًا واحدًا على الأقل.";
  if (rawMessage.includes("general interest"))
    return "اختر تصنيف الاهتمام دون ربطه بعنصر محدد.";
  const path = [...(issue?.path ?? [])]
    .reverse()
    .find((value) => typeof value === "string");
  const label = typeof path === "string" ? fieldLabels[path] : undefined;
  if (label === "الفرع") return "اختر فرعًا صحيحًا ومتاحًا ثم حاول مجددًا.";
  if (label === "رقم الجوال")
    return "أدخل رقم الجوال بالصيغة الدولية، مثل +9665… أو +2010…";
  if (label === "البريد الإلكتروني")
    return "أدخل بريدًا إلكترونيًا صحيحًا، مثل name@example.com.";
  if (label)
    return `راجع قيمة «${label}»؛ الحقل غير مكتمل أو لا يطابق الصيغة المطلوبة.`;
  return messages.request_validation_failed;
}
