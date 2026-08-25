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
  employee_account_provisioning_unavailable:
    "خدمة إنشاء حسابات الموظفين غير مهيأة حاليًا. لم تُحفظ أي بيانات للموظف؛ راجع إعداد الاتصال بخدمة الحسابات ثم حاول مجددًا.",
  employee_account_unavailable:
    "خدمة إدارة حسابات الموظفين غير متاحة حاليًا. حاول مجددًا بعد التحقق من إعداد الخدمة.",
  employee_login_address_rejected:
    "تعذر تجهيز معرّف الدخول الداخلي للموظف. راجع الرقم الوظيفي ثم حاول مجددًا.",
  employee_number_invalid:
    "صيغة الرقم الوظيفي غير صحيحة. يجب أن يبدأ بـ EMP ثم يتبعه من 3 إلى 10 أرقام، مثل EMP001.",
  invalid_employee_number:
    "صيغة الرقم الوظيفي غير صحيحة. يجب أن يبدأ بـ EMP ثم يتبعه من 3 إلى 10 أرقام، مثل EMP001.",
  invalid_employee_email:
    "البريد الإلكتروني للموظف غير صالح. راجع كتابته أو اترك الحقل فارغًا إذا لم يكن مطلوبًا.",
  employee_login_exists:
    "يوجد حساب دخول لهذا الرقم الوظيفي بالفعل. افتح ملف الموظف الحالي لتغيير كلمة المرور أو بيانات الحساب.",
  employee_login_not_found:
    "لا يوجد حساب دخول مرتبط بهذا الموظف بعد. أنشئ حسابه من ملف الموظف ثم أعد المحاولة.",
  employee_account_link_conflict:
    "حساب الدخول مرتبط بالفعل بموظف آخر أو سبق ربط هذا الموظف بحساب. راجع ملف الموظف والحساب المرتبط به.",
  employee_assignment_conflict:
    "لدى الموظف تعيين وظيفي متداخل في الفترة نفسها. راجع الفرع والمسمى وتاريخ بداية العمل قبل الحفظ.",
  employee_not_active:
    "حساب الموظف غير نشط. فعّل الموظف أولًا قبل تعديل حسابه أو تعيينه الوظيفي.",
  auth_provider_unavailable:
    "خدمة حسابات الموظفين غير مهيأة حاليًا. لم تُحفظ العملية؛ راجع إعدادات خدمة الدخول ثم حاول مجددًا.",
  invalid_auth_provider_response:
    "أعادت خدمة حسابات الموظفين استجابة غير مكتملة؛ لم تُحفظ بيانات الموظف. حاول مجددًا ثم راجع إعدادات خدمة الحسابات إذا استمرت المشكلة.",
  invalid_employee_assignment_period:
    "تاريخ نهاية التعيين الوظيفي يجب أن يكون بعد تاريخ بدايته.",
  employee_number_exists:
    "الرقم الوظيفي مستخدم بالفعل لموظف آخر. افتح سجل الموظف الموجود لتعديل بياناته أو تغيير كلمة مروره.",
  employee_conflict:
    "يوجد موظف مسجل بالفعل بنفس الرقم الوظيفي أو البيانات الأساسية.",
  employee_not_found:
    "لم يعد ملف الموظف موجودًا. حدّث قائمة الموظفين ثم حاول مجددًا.",
  employee_active_assignment_required:
    "يجب أن يكون للموظف تعيين وظيفي نشط في فرع عمله قبل تنفيذ هذا الإجراء.",
  position_not_active:
    "المسمى الوظيفي المختار غير نشط. اختر مسمى نشطًا أو فعّله من إعداد النظام.",
  position_not_found:
    "المسمى الوظيفي المختار لم يعد موجودًا. حدّث قائمة المسميات واختر مسمى متاحًا ثم حاول مجددًا.",
  user_account_not_active:
    "حساب الدخول المحدد غير موجود أو غير نشط. راجع حسابات الموظفين ثم حاول مجددًا.",
  branch_not_found:
    "الفرع المختار لم يعد متاحًا. حدّث قائمة الفروع ثم اختر فرع العمل مجددًا.",
  position_permissions_required:
    "لا يمكن إنشاء حساب دخول على هذا المسمى لأنه لا يحتوي على صلاحيات. حدّد صلاحياته أولًا من إعداد النظام ← المسميات الوظيفية والصلاحيات.",
  auth_identity_exists:
    "يوجد حساب دخول مرتبط بهذا الرقم بالفعل. افتح سجل الموظف الموجود واستخدم تغيير كلمة المرور.",
  member_activation_phone_required:
    "لا يمكن إصدار رمز التفعيل قبل إضافة رقم جوال أساسي إلى ملف العضو.",
  member_account_already_linked:
    "هذا العضو مرتبط بالفعل بحساب دخول ولا يحتاج إلى رمز تفعيل جديد.",
  member_phone_account_exists:
    "رقم جوال العضو مرتبط بحساب دخول آخر. راجع الحسابات المرتبطة قبل المتابعة.",
  member_conflict:
    "يوجد عضو مسجل بالفعل بنفس رقم الهوية أو رقم العضوية. ابحث عنه في دليل الأعضاء قبل إنشاء سجل جديد.",
  invalid_member_activation:
    "بيانات التفعيل غير صحيحة، أو انتهت صلاحية الرمز، أو سبق استخدامه. اطلب رمزًا جديدًا من الاستقبال.",
  member_activation_conflict:
    "تم استخدام رمز التفعيل أو انتهت صلاحيته أثناء العملية. اطلب رمزًا جديدًا من الاستقبال.",
  user_account_exists: "يوجد حساب دخول مسجل بالفعل بهذا الرقم.",
  system_role_immutable:
    "دور مسؤول النظام محمي ولا يمكن تعديل صلاحياته. أنشئ دورًا مخصصًا أو عدّل دورًا آخر.",
  permission_denied: "لا تملك الصلاحية اللازمة لإتمام هذا الإجراء.",
  permission_delegation_denied:
    "لا يمكنك منح موظف أو دور صلاحيات أوسع من صلاحيات حسابك ونطاق فروعك.",
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
  invalid_entity_id:
    "أحد السجلات المختارة يحمل مرجعًا غير صالح. حدّث القوائم وأعد اختيار الفرع أو المسمى الوظيفي ثم حاول مجددًا.",
  invalid_nationality:
    "اكتب الجنسية كاسم دولة بالعربية أو الإنجليزية، مثل «مصري» أو «Egyptian»، دون أرقام أو رموز خاصة.",
  file_type_not_allowed:
    "صيغة الملف غير مدعومة. استخدم JPG أو PNG للصور، ويمكن استخدام PDF لمستند الهوية.",
  invalid_filename:
    "اسم الملف غير صالح. أعد تسمية الملف باسم واضح ينتهي بالامتداد الصحيح مثل photo.jpg ثم حاول مجددًا.",
  storage_operation_failed:
    "تعذر الاتصال بمساحة حفظ الملفات الآن. لم يُفقد سجل العضو؛ أعد رفع الملف من ملف العضو أو حاول مجددًا.",
  file_metadata_mismatch:
    "بيانات الملف المرفوع لا تطابق الملف المحدد. أعد اختيار الصورة الأصلية بصيغة JPG أو PNG ثم حاول مجددًا.",
  file_upload_conflict:
    "تغيّرت حالة رفع الملف أثناء العملية. أعد اختيار الملف وحاول مجددًا.",
  owner_file_upload_failed:
    "رفضت مساحة التخزين رفع الملف. تحقق من اتصال الإنترنت وأعد اختيار الملف ثم حاول مجددًا.",
  invalid_file_size:
    "حجم الملف غير صالح. يجب أن يكون الملف أصغر من 10 ميجابايت وألا يكون فارغًا.",
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
  member_already_blocked:
    "العضو محظور بالفعل. حدّث ملفه لمراجعة سبب الحظر وتاريخه.",
  member_not_blocked:
    "لا يوجد حظر نشط على هذا العضو يمكن رفعه.",
  member_cannot_be_blocked:
    "لا يمكن حظر هذا العضو لأن حالته غير نشطة بالفعل.",
  freeze_days_exceeded:
    "مدة التجميد المطلوبة تتجاوز الحد المسموح به في سياسة هذه الباقة. قلّل عدد الأيام ثم حاول مجددًا.",
  freeze_count_exceeded:
    "تم استخدام العدد الكامل لمرات التجميد المسموح بها خلال مدة هذا الاشتراك.",
  freeze_too_early:
    "لا يمكن تجميد الاشتراك الآن؛ لم تمضِ بعد مدة النشاط الدنيا المحددة في سياسة الباقة.",
  freeze_policy_missing:
    "لا توجد سياسة تجميد صالحة محفوظة مع هذا الاشتراك. راجع سياسة الباقة قبل تنفيذ التجميد.",
  package_freeze_policy_required:
    "يجب ربط الباقة بسياسة تجميد نشطة قبل نشرها أو إنشاء اشتراك منها.",
  package_cancellation_policy_required:
    "يجب ربط الباقة بسياسة إلغاء نشطة قبل نشرها أو إنشاء اشتراك منها.",
  package_renewal_policy_required:
    "يجب ربط الباقة بسياسة تجديد نشطة قبل نشرها أو إنشاء اشتراك منها.",
  cancellation_policy_missing:
    "لا توجد سياسة إلغاء صالحة محفوظة مع هذا الاشتراك. راجع سياسة الباقة قبل تنفيذ الإلغاء.",
  cancellation_policy_invalid:
    "إعدادات سياسة الإلغاء المحفوظة مع الاشتراك غير صالحة. راجع مهلة الإشعار والرسم وطريقة الإلغاء.",
  cancellation_notice_not_met:
    "انتهت مهلة تقديم طلب الإلغاء قبل نهاية الاشتراك وفق سياسة الباقة.",
  cancellation_already_requested:
    "يوجد طلب إلغاء مسجل بالفعل لهذا الاشتراك. راجع سجل الإلغاء في ملف العضو.",
  subscription_refund_service_unavailable:
    "تتطلب سياسة الإلغاء إنشاء طلب استرداد، لكن خدمة الاسترداد غير متاحة حاليًا. لم يُنفذ الإلغاء.",
  renewal_policy_missing:
    "لا توجد سياسة تجديد صالحة محفوظة مع هذا الاشتراك. راجع سياسة الباقة قبل تنفيذ التجديد.",
  renewal_too_early:
    "لم تبدأ بعد فترة التجديد المبكر المحددة في سياسة الباقة.",
  renewal_window_ended:
    "انتهت مهلة التجديد بعد نهاية الاشتراك وفق سياسة الباقة.",
  renewal_start_in_past:
    "لا يمكن أن يبدأ الاشتراك المجدد في تاريخ سابق. اختر الوقت الحالي أو تاريخًا لاحقًا.",
  invalid_subscription_transition:
    "حالة الاشتراك الحالية لا تسمح بتنفيذ هذا الإجراء.",
  open_freeze_not_found:
    "لا توجد فترة تجميد مفتوحة يمكن استئنافها لهذا الاشتراك.",
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
      return "انتهت جلستك. سجّل الدخول مرة أخرى. ";
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
  employeeNumber: "الرقم الوظيفي",
  password: "كلمة المرور",
  initialBranchId: "فرع العمل",
  initialPositionId: "المسمى الوظيفي",
  positionId: "المسمى الوظيفي",
  hireDate: "تاريخ بدء العمل",
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
