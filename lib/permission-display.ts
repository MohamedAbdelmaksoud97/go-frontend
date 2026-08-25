export const permissionGroups = [
  { title: "إدارة النادي والفروع", prefixes: ["organization.", "branch.", "iam."] },
  { title: "الأعضاء والموظفون", prefixes: ["members.", "workforce.", "files."] },
  { title: "الخدمات والاشتراكات والمبيعات", prefixes: ["catalog.", "commercial.", "pricing.", "promotions.", "policies.", "subscriptions.", "sales."] },
  { title: "المالية والصندوق", prefixes: ["finance."] },
  { title: "التشغيل اليومي والحجوزات", prefixes: ["attendance.", "bookings.", "access-credentials.", "lockers."] },
  { title: "المطعم", prefixes: ["restaurant."] },
  { title: "المتجر والمخزون", prefixes: ["retail."] },
  { title: "التدريب والقياسات", prefixes: ["coaching.", "measurements.", "measurement-types."] },
  { title: "العملاء والتواصل", prefixes: ["crm.", "notifications.", "notification-templates.", "online-requests.", "feedback."] },
  { title: "التقارير وترحيل البيانات", prefixes: ["reporting.", "legacy."] },
] as const;

export const permissionSubjects: Record<string, string> = {
  organization: "النادي", branch: "الفروع", "iam.accounts": "حسابات الموظفين", "iam.roles": "الأدوار", "iam.assignments": "تعيين الأدوار", "iam.audit": "سجل المراجعة",
  members: "الأعضاء", "members.sensitive": "بيانات الأعضاء الحساسة", "members.accounts": "حسابات الأعضاء", workforce: "الموظفين", "workforce.assignments": "تعيينات الموظفين", "workforce.accounts": "حسابات الموظفين", "workforce.shifts": "المناوبات", "workforce.attendance": "حضور الموظفين", files: "الملفات",
  catalog: "الخدمات والأنشطة", "catalog.availability": "توفر الخدمات", commercial: "الباقات التجارية", pricing: "الأسعار", promotions: "العروض", policies: "السياسات", subscriptions: "الاشتراكات", "subscriptions.adjustments": "تعديلات الاشتراكات", sales: "المبيعات",
  "finance.invoices": "الفواتير", "finance.payments": "المدفوعات", "finance.refunds": "الاسترجاعات", "finance.expenses": "المصروفات", "finance.cash-points": "نقاط التحصيل", "finance.cash-shifts": "ورديات الصندوق", "finance.cash-shifts.audit": "السجل المالي التفصيلي للورديات", "finance.other-income": "الإيرادات الأخرى",
  attendance: "دخول الأعضاء", bookings: "الحجوزات", "bookings.facilities": "المرافق", "access-credentials": "بطاقات الدخول", lockers: "الخزائن",
  "restaurant.catalog": "كتالوج المطعم", "restaurant.pricing": "أسعار المطعم", "restaurant.menu": "قائمة المطعم", "restaurant.orders": "طلبات المطعم", "restaurant.meal-plans": "خطط الوجبات",
  "retail.catalog": "كتالوج المتجر", "retail.pricing": "أسعار المتجر", "retail.inventory": "مخزون المتجر",
  coaching: "التدريب", "coaching.assignments": "تعيينات المدربين", "coaching.schedule": "جداول التدريب", "coaching.commissions": "عمولات المدربين", "coaching.training-plans": "خطط التدريب", measurements: "القياسات", "measurement-types": "أنواع القياسات",
  notifications: "الإشعارات", "notifications.whatsapp": "واتساب", "notification-templates": "قوالب الإشعارات", crm: "العملاء المحتملون", "crm.leads": "العملاء المحتملون", "crm.follow-ups": "متابعات العملاء", "online-requests": "الطلبات الإلكترونية", feedback: "الشكاوى والاقتراحات", reporting: "التقارير", "legacy.import": "ترحيل البيانات القديمة",
};

export const permissionActions: Record<string, string> = {
  read: "الاطلاع على", reply: "الرد على", manage: "إدارة", create: "إنشاء", activate: "تفعيل", freeze: "تجميد", cancel: "إلغاء", renew: "تجديد", block: "حظر", checkout: "إتمام البيع", record: "تسجيل", issue: "إصدار", approve: "اعتماد", pay: "دفع", "check-in": "تسجيل دخول", prepare: "تحضير", redeem: "استبدال", send: "إرسال", rebuild: "إعادة بناء", execute: "تنفيذ", operations: "اعتماد تشغيلي", commercial: "اعتماد تجاري", finance: "اعتماد مالي",
};

const permissionLabelOverrides: Record<string, string> = {
  "members.block": "حظر الأعضاء ورفع الحظر",
  "members.contacts.read": "عرض أرقام هواتف الأعضاء وبريدهم كاملًا",
  "sales.checkout": "إتمام عمليات البيع",
  "attendance.check-in": "تسجيل دخول الأعضاء",
  "finance.refunds.issue": "تنفيذ الاسترجاعات المالية",
  "restaurant.meal-plans.redeem": "استخدام استحقاقات خطط الوجبات",
  "workforce.attendance.record": "تسجيل حضور الموظفين",
};

export type PermissionPresentation = {
  code: string;
  label: string;
  group: string;
  groupOrder: number;
  subject: string;
  subjectKey: string;
  action: string;
};

export function permissionPresentation(code: string): PermissionPresentation {
  const parts = code.split(".");
  const action = parts.at(-1) ?? code;
  const subjectKey = parts.slice(0, -1).join(".");
  const subject = permissionSubjects[subjectKey] ?? permissionSubjects[parts[0]] ?? "الجزء المرتبط بهذه الصلاحية";
  const groupOrder = permissionGroups.findIndex((group) =>
    group.prefixes.some((prefix) => code.startsWith(prefix)),
  );
  const actionLabel = permissionActions[action] ?? "تنفيذ إجراء على";

  return {
    code,
    label: permissionLabelOverrides[code] ?? `${actionLabel} ${subject}`,
    group: permissionGroups[groupOrder]?.title ?? "صلاحيات أخرى",
    groupOrder: groupOrder < 0 ? permissionGroups.length : groupOrder,
    subject,
    subjectKey,
    action,
  };
}

export function permissionArabicLabel(code: string): string {
  return permissionPresentation(code).label;
}
