"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Building2, Check, ChevronLeft, Loader2, Pencil, Plus, RefreshCw, Search, Settings2, ShieldAlert, X } from "lucide-react"
import { apiRequest, createIdempotencyKey, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { useAppContext } from "@/components/app-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/status-badge"

type Value = string | boolean | string[]
type Values = Record<string, Value>
type RecordItem = Record<string, unknown>
type BranchLookup = { id: string; nameAr?: string; name?: string }
type Field = {
  name: string
  label: string
  type?: "text" | "number" | "datetime-local" | "textarea" | "select" | "checkbox" | "multi"
  required?: boolean
  options?: Array<{ value: string; label: string }>
  source?: "activities" | "categories" | "services" | "packages" | "permissions" | "branches" | "meals" | "facilities" | "policies" | "accounts" | "roles" | "retailCategories" | "retailProducts"
  sourceFilter?: { key: string; value: string }
  hint?: string
  visibleWhen?: { field: string; values: string[] }
}
type MasterConfig = {
  id: string
  label: string
  description: string
  permission: string
  managePermission: string
  path: string
  createPath?: string
  updatePath?: (id: string) => string
  updateMethod?: "PATCH" | "PUT"
  createFields?: Field[]
  editFields?: Field[]
  columns: Array<{ label: string; key: string }>
  initial?: Values
  createBody?: (values: Values) => Record<string, unknown>
  editBody?: (values: Values, item: RecordItem) => Record<string, unknown>
  branchScoped?: boolean
  authorizationBranchScoped?: boolean
}

const isoNow = () => new Date().toISOString()
const dateTimeLocal = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
const number = (value: Value | undefined) => Number(value || 0)
const asArray = (value: Value | undefined) => Array.isArray(value) ? value : []
const money = (value: unknown) => typeof value === "string" || typeof value === "number" ? new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(Number(value) / 100) : "—"

const configs: MasterConfig[] = [
  {
    id: "branches", label: "الفروع", description: "الفروع، المناطق الزمنية وعناوين التشغيل.", permission: "organization.read", managePermission: "branch.manage", path: "/organizations/{organizationId}/branches", createPath: "/organizations/{organizationId}/branches", updatePath: id => `/organizations/{organizationId}/branches/${id}`,
    columns: [{ label: "الرمز", key: "code" }, { label: "الاسم", key: "name" }, { label: "المنطقة الزمنية", key: "timezone" }, { label: "العنوان", key: "address" }, { label: "الحالة", key: "status" }],
    createFields: [{ name: "code", label: "رمز الفرع", required: true }, { name: "name", label: "اسم الفرع", required: true }, { name: "timezone", label: "المنطقة الزمنية", hint: "مثال: Asia/Riyadh" }, { name: "address", label: "العنوان", type: "textarea" }],
    editFields: [{ name: "name", label: "اسم الفرع", required: true }, { name: "timezone", label: "المنطقة الزمنية" }, { name: "address", label: "العنوان", type: "textarea" }, { name: "status", label: "الحالة", type: "select", options: [{ value: "ACTIVE", label: "نشط" }, { value: "INACTIVE", label: "غير نشط" }] }],
  },
  {
    id: "activities", label: "الرياضات والأنشطة", description: "تعريف الأنشطة التي ترتبط بالخدمات والمرافق.", permission: "catalog.read", managePermission: "catalog.manage", path: "/organizations/{organizationId}/activities", createPath: "/organizations/{organizationId}/activities", updatePath: id => `/organizations/{organizationId}/activities/${id}`,
    columns: [{ label: "الرمز", key: "code" }, { label: "الاسم", key: "name" }, { label: "الحالة", key: "status" }],
    createFields: [{ name: "code", label: "رمز النشاط", required: true }, { name: "name", label: "اسم النشاط", required: true }],
    editFields: [{ name: "name", label: "اسم النشاط", required: true }, { name: "status", label: "الحالة", type: "select", options: [{ value: "ACTIVE", label: "نشط" }, { value: "INACTIVE", label: "غير نشط" }] }],
  },
  {
    id: "categories", label: "تصنيفات الخدمات", description: "تقسيم الخدمات إلى مجموعات قابلة للإدارة.", permission: "catalog.read", managePermission: "catalog.manage", path: "/organizations/{organizationId}/service-categories", createPath: "/organizations/{organizationId}/service-categories", updatePath: id => `/organizations/{organizationId}/service-categories/${id}`,
    columns: [{ label: "الرمز", key: "code" }, { label: "الاسم", key: "name" }, { label: "الحالة", key: "status" }],
    createFields: [{ name: "code", label: "رمز التصنيف", required: true }, { name: "name", label: "اسم التصنيف", required: true }],
    editFields: [{ name: "name", label: "اسم التصنيف", required: true }, { name: "status", label: "الحالة", type: "select", options: [{ value: "ACTIVE", label: "نشط" }, { value: "INACTIVE", label: "غير نشط" }] }],
  },
  {
    id: "services", label: "الخدمات", description: "الخدمات وما يرتبط بها من أنشطة وتصنيفات.", permission: "catalog.read", managePermission: "catalog.manage", path: "/organizations/{organizationId}/services", createPath: "/organizations/{organizationId}/services", updatePath: id => `/organizations/{organizationId}/services/${id}`,
    columns: [{ label: "الرمز", key: "code" }, { label: "الخدمة", key: "name" }, { label: "نوع التنفيذ", key: "fulfillmentKind" }, { label: "الحالة", key: "status" }],
    createFields: [{ name: "code", label: "رمز الخدمة", required: true }, { name: "name", label: "اسم الخدمة", required: true }, { name: "categoryId", label: "تصنيف الخدمة", type: "select", source: "categories", required: true }, { name: "activityIds", label: "الأنشطة", type: "multi", source: "activities", required: true }, { name: "fulfillmentKind", label: "نوع التنفيذ", type: "select", options: [{ value: "FACILITY_ACCESS", label: "دخول مرفق" }, { value: "SESSION", label: "جلسة" }, { value: "MEAL_PLAN", label: "خطة وجبات" }] }, { name: "description", label: "الوصف", type: "textarea" }],
    editFields: [{ name: "name", label: "اسم الخدمة", required: true }, { name: "categoryId", label: "تصنيف الخدمة", type: "select", source: "categories" }, { name: "activityIds", label: "الأنشطة", type: "multi", source: "activities" }, { name: "description", label: "الوصف", type: "textarea" }, { name: "status", label: "الحالة", type: "select", options: [{ value: "ACTIVE", label: "نشط" }, { value: "INACTIVE", label: "غير نشط" }] }],
  },
  {
    id: "packages", label: "الباقات", description: "باقات العضوية ومدتها والخدمات المشمولة فيها.", permission: "commercial.read", managePermission: "commercial.manage", path: "/organizations/{organizationId}/packages", createPath: "/organizations/{organizationId}/packages", updatePath: id => `/organizations/{organizationId}/packages/${id}`,
    columns: [{ label: "الرمز", key: "code" }, { label: "الباقة", key: "name" }, { label: "المدة", key: "durationDays" }, { label: "حالة النشر", key: "status" }],
    createFields: [{ name: "code", label: "رمز الباقة", required: true }, { name: "name", label: "اسم الباقة", required: true }, { name: "durationValue", label: "مدة الباقة", type: "number", required: true }, { name: "durationUnit", label: "وحدة المدة", type: "select", required: true, options: [{ value: "DAYS", label: "أيام" }, { value: "WEEKS", label: "أسابيع" }, { value: "MONTHS", label: "أشهر" }] }, { name: "accessFrequency", label: "نظام الحضور", type: "select", required: true, options: [{ value: "UNLIMITED", label: "حضور غير محدود طوال الباقة" }, { value: "TOTAL", label: "عدد إجمالي طوال الباقة" }, { value: "WEEK", label: "عدد محدد كل أسبوع" }, { value: "MONTH", label: "عدد محدد كل شهر" }] }, { name: "visitAllowance", label: "إجمالي مرات الحضور طوال الباقة", type: "number", required: true, visibleWhen: { field: "accessFrequency", values: ["TOTAL"] } }, { name: "visitsPerPeriod", label: "مرات الحضور في الفترة", type: "number", required: true, visibleWhen: { field: "accessFrequency", values: ["WEEK", "MONTH"] }, hint: "مثال: 3 مع «كل أسبوع»، أو 15 مع «كل شهر». يطبقها سجل الحضور تلقائيًا." }, { name: "branchAccessPolicy", label: "سياسة الوصول للفروع", type: "select", options: [{ value: "SINGLE_BRANCH", label: "فرع البيع فقط" }, { value: "SELECTED_BRANCHES", label: "فروع مختارة" }, { value: "ALL_ORGANIZATION_BRANCHES", label: "كل الفروع" }] }, { name: "branchIds", label: "الفروع المتاحة", type: "multi", source: "branches", visibleWhen: { field: "branchAccessPolicy", values: ["SELECTED_BRANCHES"] }, hint: "اختر الفروع التي يستطيع العضو استخدامها بعد الشراء." }, { name: "serviceIds", label: "الخدمات المشمولة", type: "multi", source: "services", required: true }, { name: "freezePolicyVersionId", label: "سياسة التجميد الخاصة بهذه الباقة", type: "select", source: "policies", sourceFilter: { key: "policyType", value: "FREEZE" }, required: true }, { name: "cancellationPolicyVersionId", label: "سياسة الإلغاء الخاصة بهذه الباقة", type: "select", source: "policies", sourceFilter: { key: "policyType", value: "CANCELLATION" }, required: true }, { name: "renewalPolicyVersionId", label: "سياسة التجديد الخاصة بهذه الباقة", type: "select", source: "policies", sourceFilter: { key: "policyType", value: "RENEWAL" }, required: true }, { name: "description", label: "الوصف", type: "textarea" }],
    editFields: [{ name: "name", label: "اسم الباقة", required: true }, { name: "durationDays", label: "المدة الفعلية بالأيام", type: "number", required: true }, { name: "accessFrequency", label: "نظام الحضور", type: "select", required: true, options: [{ value: "UNLIMITED", label: "غير محدود" }, { value: "TOTAL", label: "إجمالي طوال الباقة" }, { value: "WEEK", label: "حد أسبوعي" }, { value: "MONTH", label: "حد شهري" }] }, { name: "visitAllowance", label: "إجمالي مرات الحضور", type: "number", required: true, visibleWhen: { field: "accessFrequency", values: ["TOTAL"] } }, { name: "visitsPerPeriod", label: "مرات الحضور في الفترة", type: "number", required: true, visibleWhen: { field: "accessFrequency", values: ["WEEK", "MONTH"] } }, { name: "branchAccessPolicy", label: "سياسة الوصول للفروع", type: "select", required: true, options: [{ value: "SINGLE_BRANCH", label: "فرع البيع فقط" }, { value: "SELECTED_BRANCHES", label: "فروع مختارة" }, { value: "ALL_ORGANIZATION_BRANCHES", label: "كل الفروع" }] }, { name: "branchIds", label: "الفروع المتاحة", type: "multi", source: "branches", visibleWhen: { field: "branchAccessPolicy", values: ["SELECTED_BRANCHES"] } }, { name: "serviceIds", label: "الخدمات المشمولة", type: "multi", source: "services", required: true }, { name: "freezePolicyVersionId", label: "سياسة التجميد", type: "select", source: "policies", sourceFilter: { key: "policyType", value: "FREEZE" }, required: true }, { name: "cancellationPolicyVersionId", label: "سياسة الإلغاء", type: "select", source: "policies", sourceFilter: { key: "policyType", value: "CANCELLATION" }, required: true }, { name: "renewalPolicyVersionId", label: "سياسة التجديد", type: "select", source: "policies", sourceFilter: { key: "policyType", value: "RENEWAL" }, required: true }, { name: "description", label: "الوصف", type: "textarea" }, { name: "status", label: "الحالة", type: "select", required: true, options: [{ value: "DRAFT", label: "مسودة" }, { value: "PUBLISHED", label: "منشورة" }, { value: "INACTIVE", label: "محذوفة / مؤرشفة" }] }],
    initial: { durationValue: "1", durationUnit: "MONTHS", accessFrequency: "UNLIMITED", branchAccessPolicy: "SINGLE_BRANCH", fulfillmentKind: "FACILITY_ACCESS" },
    createBody: values => { const factor = values.durationUnit === "WEEKS" ? 7 : values.durationUnit === "MONTHS" ? 30 : 1; const periodic = values.accessFrequency === "WEEK" || values.accessFrequency === "MONTH"; return ({ code: values.code, name: values.name, description: values.description || undefined, durationDays: number(values.durationValue) * factor, visitAllowance: values.accessFrequency === "TOTAL" ? number(values.visitAllowance) : undefined, visitLimitPeriod: periodic ? values.accessFrequency : undefined, visitsPerPeriod: periodic ? number(values.visitsPerPeriod) : undefined, fulfillmentKind: "FACILITY_ACCESS", branchAccessPolicy: values.branchAccessPolicy || "SINGLE_BRANCH", branchIds: asArray(values.branchIds), entitlements: asArray(values.serviceIds).map(serviceId => ({ serviceId })), freezePolicyVersionId: values.freezePolicyVersionId, cancellationPolicyVersionId: values.cancellationPolicyVersionId, renewalPolicyVersionId: values.renewalPolicyVersionId }) },
    editBody: (values, item) => { const periodic = values.accessFrequency === "WEEK" || values.accessFrequency === "MONTH"; return ({ name: values.name, description: values.description || undefined, durationDays: number(values.durationDays), visitAllowance: values.accessFrequency === "TOTAL" ? number(values.visitAllowance) : null, visitLimitPeriod: periodic ? values.accessFrequency : null, visitsPerPeriod: periodic ? number(values.visitsPerPeriod) : null, fulfillmentKind: item.fulfillmentKind ?? "FACILITY_ACCESS", branchAccessPolicy: values.branchAccessPolicy, branchIds: asArray(values.branchIds), entitlements: asArray(values.serviceIds).map(serviceId => ({ serviceId })), freezePolicyVersionId: values.freezePolicyVersionId, cancellationPolicyVersionId: values.cancellationPolicyVersionId, renewalPolicyVersionId: values.renewalPolicyVersionId, status: values.status, expectedVersion: Number(item.version ?? 1) }) },
  },
  {
    id: "prices", label: "الأسعار", description: "الأسعار المعتمدة للخدمات والباقات مع الضريبة وتاريخ السريان.", permission: "commercial.read", managePermission: "pricing.manage", path: "/organizations/{organizationId}/prices", createPath: "/organizations/{organizationId}/prices",
    columns: [{ label: "الهدف", key: "targetType" }, { label: "القيمة", key: "amountMinor" }, { label: "النطاق", key: "branchId" }, { label: "الضريبة", key: "taxRateBps" }, { label: "ساري من", key: "validFrom" }],
    createFields: [{ name: "targetType", label: "نوع الهدف", type: "select", required: true, options: [{ value: "PACKAGE", label: "باقة" }, { value: "SERVICE", label: "خدمة" }] }, { name: "targetId", label: "الخدمة أو الباقة", type: "select", source: "packages", required: true, hint: "اختر الباقة، أو بدّل إلى الخدمات عند التسعير لخدمة." }, { name: "branchId", label: "فرع السعر", type: "select", source: "branches", hint: "اتركه دون اختيار ليكون السعر عامًا لكل الفروع." }, { name: "amount", label: "السعر بالريال", type: "number", required: true }, { name: "taxRate", label: "نسبة الضريبة %", type: "number", required: true }, { name: "taxInclusive", label: "السعر شامل الضريبة", type: "checkbox" }],
    initial: { targetType: "PACKAGE", taxRate: "15", taxInclusive: true },
    createBody: values => ({ branchId: values.branchId || undefined, targetType: values.targetType, targetId: values.targetId, amountMinor: String(Math.round(number(values.amount) * 100)), taxRateBps: Math.round(number(values.taxRate) * 100), taxInclusive: Boolean(values.taxInclusive), validFrom: isoNow() }),
  },
  {
    id: "promotions", label: "العروض والخصومات", description: "إنشاء عروض بفترة صلاحية وفروع وخدمات أو باقات مستهدفة.", permission: "commercial.read", managePermission: "promotions.manage", path: "/organizations/{organizationId}/promotions", createPath: "/organizations/{organizationId}/promotions",
    columns: [{ label: "الكود", key: "code" }, { label: "العرض", key: "name" }, { label: "الفائدة", key: "benefitType" }, { label: "القيمة", key: "benefitValue" }, { label: "الأهلية", key: "eligibility" }, { label: "الفروع", key: "branchIds" }, { label: "ينتهي", key: "validUntil" }],
    createFields: [{ name: "code", label: "كود العرض", required: true, hint: "استخدم أحرفًا إنجليزية كبيرة وأرقامًا فقط، مثل SUMMER25." }, { name: "name", label: "اسم العرض", required: true }, { name: "benefitType", label: "نوع الفائدة", type: "select", required: true, options: [{ value: "PERCENTAGE", label: "خصم بالنسبة المئوية" }, { value: "FIXED_DISCOUNT", label: "خصم مبلغ ثابت" }, { value: "FIXED_FINAL_PRICE", label: "سعر نهائي ثابت" }] }, { name: "benefitValue", label: "قيمة العرض", type: "number", required: true, hint: "للنسبة أدخل مثلًا 25 لخصم 25٪، وللمبلغ أدخل القيمة بالريال." }, { name: "eligibility", label: "من يحق له الاستفادة؟", type: "select", required: true, options: [{ value: "EVERYONE", label: "جميع الأعضاء" }, { value: "NEW_MEMBER", label: "الأعضاء الجدد" }, { value: "FORMER_MEMBER", label: "الأعضاء السابقون" }, { value: "PROMO_CODE", label: "عند استخدام كود العرض" }] }, { name: "validFrom", label: "يبدأ العرض", type: "datetime-local", required: true }, { name: "validUntil", label: "ينتهي العرض", type: "datetime-local", required: true }, { name: "branchIds", label: "الفروع المستهدفة", type: "multi", source: "branches", hint: "اتركها دون تحديد ليكون العرض متاحًا في كل الفروع." }, { name: "packageIds", label: "الباقات المشمولة", type: "multi", source: "packages" }, { name: "serviceIds", label: "الخدمات المشمولة", type: "multi", source: "services" }],
    initial: { benefitType: "PERCENTAGE", eligibility: "EVERYONE", validFrom: dateTimeLocal(new Date()), validUntil: dateTimeLocal(new Date(Date.now() + 30 * 86_400_000)) },
    createBody: values => ({ code: values.code, name: values.name, benefitType: values.benefitType, benefitValue: values.benefitType === "PERCENTAGE" ? Math.round(number(values.benefitValue) * 100) : Math.round(number(values.benefitValue) * 100), eligibility: values.eligibility, validFrom: new Date(String(values.validFrom)).toISOString(), validUntil: new Date(String(values.validUntil)).toISOString(), branchIds: asArray(values.branchIds), targets: [...asArray(values.packageIds).map(id => ({ type: "PACKAGE", id })), ...asArray(values.serviceIds).map(id => ({ type: "SERVICE", id }))] }),
  },
  {
    id: "commercial-policies", label: "سياسات الاشتراكات", description: "قواعد التجميد والإلغاء والتجديد وإلغاء الحجز. كل تعديل يُحفظ كإصدار جديد لحماية السجلات السابقة.", permission: "commercial.read", managePermission: "policies.manage", path: "/organizations/{organizationId}/commercial-policies", createPath: "/organizations/{organizationId}/commercial-policies",
    columns: [{ label: "اسم السياسة", key: "name" }, { label: "النوع", key: "policyType" }, { label: "المفتاح", key: "policyKey" }, { label: "الإصدار", key: "versionNumber" }],
    createFields: [{ name: "policyType", label: "نوع السياسة", type: "select", required: true, options: [{ value: "FREEZE", label: "تجميد الاشتراك" }, { value: "CANCELLATION", label: "إلغاء الاشتراك" }, { value: "RENEWAL", label: "تجديد الاشتراك" }, { value: "BOOKING_CANCELLATION", label: "إلغاء الحجز" }] }, { name: "policyKey", label: "رمز السياسة", required: true, hint: "رمز ثابت للإصدارات المتتالية، مثل STANDARD_FREEZE." }, { name: "versionNumber", label: "رقم الإصدار", type: "number", required: true }, { name: "name", label: "اسم واضح للسياسة", required: true }, { name: "maxDaysPerFreeze", label: "أقصى أيام للتجميد", type: "number", visibleWhen: { field: "policyType", values: ["FREEZE"] } }, { name: "maxFreezesPerTerm", label: "أقصى مرات تجميد للاشتراك", type: "number", visibleWhen: { field: "policyType", values: ["FREEZE"] } }, { name: "minimumActiveDaysBeforeFreeze", label: "أقل أيام نشاط قبل التجميد", type: "number", visibleWhen: { field: "policyType", values: ["FREEZE"] } }, { name: "cancellationMode", label: "موعد الإلغاء", type: "select", visibleWhen: { field: "policyType", values: ["CANCELLATION"] }, options: [{ value: "END_OF_TERM", label: "نهاية فترة الاشتراك" }, { value: "IMMEDIATE_PRORATED", label: "فوري مع استرداد نسبي" }], hint: "نهاية الفترة مناسبة للاشتراك الشهري؛ الفوري للباقات المدفوعة مقدماً فقط." }, { name: "noticeDays", label: "فترة الإشعار بالأيام", type: "number", visibleWhen: { field: "policyType", values: ["CANCELLATION"] } }, { name: "fee", label: "رسوم الإلغاء بالريال", type: "number", visibleWhen: { field: "policyType", values: ["CANCELLATION"] }, hint: "تُخصم من الاسترداد المقترح، ولا يتم صرفه إلا بصلاحية مالية مستقلة." }, { name: "graceDays", label: "فترة السماح بالأيام", type: "number", visibleWhen: { field: "policyType", values: ["RENEWAL"] } }, { name: "allowEarlyRenewalDays", label: "السماح بالتجديد المبكر قبل (أيام)", type: "number", visibleWhen: { field: "policyType", values: ["RENEWAL"] } }, { name: "cutoffHours", label: "آخر موعد للإلغاء قبل الحجز (ساعات)", type: "number", visibleWhen: { field: "policyType", values: ["BOOKING_CANCELLATION"] } }, { name: "refundPercentage", label: "نسبة الاسترداد %", type: "number", visibleWhen: { field: "policyType", values: ["BOOKING_CANCELLATION"] } }],
    initial: { policyType: "FREEZE", versionNumber: "1", cancellationMode: "END_OF_TERM" },
    createBody: values => ({ policyKey: values.policyKey, versionNumber: number(values.versionNumber), policyType: values.policyType, name: values.name, configuration: values.policyType === "FREEZE" ? { maxDaysPerFreeze: number(values.maxDaysPerFreeze), maxFreezesPerTerm: number(values.maxFreezesPerTerm), minimumActiveDaysBeforeFreeze: number(values.minimumActiveDaysBeforeFreeze) } : values.policyType === "CANCELLATION" ? { noticeDays: number(values.noticeDays), refundable: values.cancellationMode === "IMMEDIATE_PRORATED", feeMinor: Math.round(number(values.fee) * 100), cancellationMode: values.cancellationMode || "END_OF_TERM" } : values.policyType === "RENEWAL" ? { graceDays: number(values.graceDays), allowEarlyRenewalDays: number(values.allowEarlyRenewalDays) } : { cutoffHours: number(values.cutoffHours), refundPercentageBps: Math.round(number(values.refundPercentage) * 100) } }),
  },
  {
    id: "roles", label: "مجموعات الصلاحيات الإضافية", description: "جهّز مجموعة صلاحيات يمكن إضافتها لموظف عند الحاجة، فوق صلاحيات مسماه الوظيفي.", permission: "iam.roles.read", managePermission: "iam.roles.manage", path: "/organizations/{organizationId}/roles", createPath: "/organizations/{organizationId}/roles", updatePath: id => `/organizations/{organizationId}/roles/${id}/permissions`,
    columns: [{ label: "مجموعة الصلاحيات", key: "name" }, { label: "متى تُستخدم؟", key: "description" }, { label: "الصلاحيات الإضافية", key: "permissions" }],
    createFields: [{ name: "name", label: "اسم مجموعة الصلاحيات", required: true, hint: "مثال: مدير إقليمي أو مراجع مالي مؤقت." }, { name: "description", label: "سبب ومجال الاستخدام", type: "textarea", hint: "وضّح لمن تُمنح هذه المجموعة ومتى، حتى لا تُستخدم بدل المسمى الوظيفي." }, { name: "permissions", label: "الصلاحيات الإضافية", type: "multi", source: "permissions" }],
    editFields: [{ name: "permissions", label: "الصلاحيات", type: "multi", source: "permissions" }],
    createBody: values => ({ name: values.name, description: values.description || undefined, permissions: asArray(values.permissions) }), editBody: values => ({ permissions: asArray(values.permissions) }), updateMethod: "PUT",
  },
  {
    id: "role-assignments", label: "صلاحيات إضافية لموظف", description: "اختر موظفًا وأضف له صلاحيات لا يوفرها مسماه الوظيفي، ثم حدد الفروع التي تعمل فيها.", permission: "iam.roles.read", managePermission: "iam.assignments.manage", path: "/organizations/{organizationId}/role-assignments", createPath: "/organizations/{organizationId}/role-assignments",
    columns: [{ label: "الحساب الإداري", key: "accountName" }, { label: "مجموعة الصلاحيات", key: "roleName" }, { label: "النطاق", key: "scopeType" }, { label: "الفروع المشمولة", key: "branchNames" }, { label: "الحالة", key: "status" }],
    createFields: [{ name: "userAccountId", label: "الموظف", type: "select", source: "accounts", required: true, hint: "تعرض القائمة جميع الموظفين. إذا ظهر «لا يوجد حساب دخول»، أنشئ له كلمة مرور أولًا من صفحة الموظفين." }, { name: "roleId", label: "مجموعة الصلاحيات الإضافية", type: "select", source: "roles", required: true }, { name: "scopeType", label: "أين تعمل هذه الصلاحيات؟", type: "select", required: true, options: [{ value: "SELECTED_BRANCHES", label: "في فروع محددة فقط" }, { value: "ORGANIZATION", label: "في جميع الفروع — لمسؤول النظام فقط" }] }, { name: "branchIds", label: "الفروع المشمولة", type: "multi", source: "branches", visibleWhen: { field: "scopeType", values: ["SELECTED_BRANCHES"] }, hint: "اختر فقط الفروع التي يحتاج الموظف إلى هذه الصلاحيات الإضافية فيها." }],
    initial: { scopeType: "SELECTED_BRANCHES" }, createBody: values => ({ userAccountId: values.userAccountId, roleId: values.roleId, scopeType: values.scopeType, branchIds: asArray(values.branchIds) }),
  },
  {
    id: "cash-points", label: "نقاط التحصيل", description: "الصناديق ونقاط البيع الخاصة بالفرع المحدد حاليًا.", permission: "finance.cash-points.manage", managePermission: "finance.cash-points.manage", path: "/organizations/{organizationId}/cash-points", createPath: "/organizations/{organizationId}/cash-points", branchScoped: true,
    columns: [{ label: "الرمز", key: "code" }, { label: "اسم نقطة التحصيل", key: "name" }, { label: "الحالة", key: "status" }],
    createFields: [{ name: "code", label: "رمز نقطة التحصيل", required: true }, { name: "name", label: "اسم نقطة التحصيل", required: true }],
  },
  {
    id: "lockers", label: "الخزائن", description: "الخزائن المتاحة والمخصصة للفرع المحدد حاليًا.", permission: "lockers.read", managePermission: "lockers.manage", path: "/organizations/{organizationId}/lockers", createPath: "/organizations/{organizationId}/lockers", branchScoped: true,
    columns: [{ label: "الرمز", key: "code" }, { label: "النوع", key: "lockerType" }, { label: "الحالة", key: "status" }, { label: "ملاحظات", key: "notes" }],
    createFields: [{ name: "code", label: "رمز الخزانة", required: true }, { name: "lockerType", label: "نوع الخزانة", type: "select", required: true, options: [{ value: "STANDARD", label: "عادية" }, { value: "LARGE", label: "كبيرة" }, { value: "VALUABLES", label: "مقتنيات ثمينة" }] }, { name: "notes", label: "ملاحظات", type: "textarea" }],
  },
  {
    id: "measurement-types", label: "أنواع القياسات", description: "القياسات المتاحة للمدربين مثل الوزن والطول ونسبة الدهون.", permission: "measurements.read", managePermission: "measurement-types.manage", path: "/organizations/{organizationId}/measurement-types", createPath: "/organizations/{organizationId}/measurement-types", updatePath: id => `/organizations/{organizationId}/measurement-types/${id}`,
    columns: [{ label: "الرمز", key: "code" }, { label: "القياس", key: "name" }, { label: "الوحدة", key: "unit" }, { label: "نوع الرقم", key: "dataKind" }, { label: "الحالة", key: "status" }],
    createFields: [{ name: "code", label: "رمز القياس", required: true }, { name: "name", label: "اسم القياس", required: true }, { name: "unit", label: "الوحدة", required: true, hint: "مثل: كجم، سم، ٪." }, { name: "dataKind", label: "نوع الرقم", type: "select", required: true, options: [{ value: "DECIMAL", label: "عشري" }, { value: "INTEGER", label: "عدد صحيح" }] }, { name: "minimumValue", label: "أقل قيمة مقبولة", type: "number" }, { name: "maximumValue", label: "أعلى قيمة مقبولة", type: "number" }],
    editFields: [{ name: "name", label: "اسم القياس" }, { name: "unit", label: "الوحدة" }, { name: "minimumValue", label: "أقل قيمة مقبولة", type: "number" }, { name: "maximumValue", label: "أعلى قيمة مقبولة", type: "number" }, { name: "status", label: "الحالة", type: "select", options: [{ value: "ACTIVE", label: "نشط" }, { value: "INACTIVE", label: "غير نشط" }] }],
  },
  {
    id: "positions", label: "المسميات الوظيفية والصلاحيات", description: "حدّد صلاحيات كل مسمى مرة واحدة؛ كل موظف يشغل هذا المسمى يطبقها النظام تلقائيًا داخل فرعه.", permission: "workforce.read", managePermission: "workforce.manage", path: "/organizations/{organizationId}/positions", createPath: "/organizations/{organizationId}/positions", updatePath: id => `/organizations/{organizationId}/positions/${id}`,
    columns: [{ label: "الرمز", key: "code" }, { label: "المسمى", key: "name" }, { label: "الصلاحيات", key: "permissions" }, { label: "الحالة", key: "status" }], createFields: [{ name: "code", label: "رمز المسمى", required: true }, { name: "name", label: "المسمى الوظيفي", required: true }, { name: "permissions", label: "صلاحيات هذا المسمى", type: "multi", source: "permissions", required: true, hint: "تظهر الواجهة المناسبة تلقائيًا للموظف، وتتحقق الواجهة الخلفية من نفس الصلاحيات." }],
    editFields: [{ name: "name", label: "المسمى الوظيفي", required: true }, { name: "permissions", label: "صلاحيات هذا المسمى", type: "multi", source: "permissions", required: true }, { name: "status", label: "الحالة", type: "select", options: [{ value: "ACTIVE", label: "نشط" }, { value: "INACTIVE", label: "محذوف / مؤرشف" }] }],
    createBody: values => ({ code: values.code, name: values.name, permissions: asArray(values.permissions) }), editBody: (values, item) => ({ name: values.name, status: values.status, permissions: asArray(values.permissions), expectedVersion: Number(item.version ?? 1) }),
  },
  {
    id: "facilities", label: "المرافق", description: "القاعات والملاعب والمسابح ومناطق التدريب للفرع المحدد حاليًا.", permission: "bookings.read", managePermission: "bookings.facilities.manage", path: "/organizations/{organizationId}/facilities", createPath: "/organizations/{organizationId}/facilities", branchScoped: true,
    columns: [{ label: "الرمز", key: "code" }, { label: "المرفق", key: "name" }, { label: "النوع", key: "type" }, { label: "الفرع", key: "branchId" }],
    createFields: [{ name: "code", label: "رمز المرفق", required: true }, { name: "name", label: "اسم المرفق", required: true }, { name: "type", label: "النوع", type: "select", required: true, options: [{ value: "COURT", label: "ملعب" }, { value: "ROOM", label: "غرفة" }, { value: "POOL", label: "مسبح" }, { value: "STUDIO", label: "استوديو" }, { value: "TRAINING_AREA", label: "منطقة تدريب" }] }, { name: "activityId", label: "النشاط المرتبط", type: "select", source: "activities" }],
    createBody: values => ({ ...values, branchId: undefined }),
  },
  {
    id: "bookable-resources", label: "موارد الحجز", description: "الملاعب والحصص والتدريب الشخصي المتاح للحجز في الفرع المحدد.", permission: "bookings.read", managePermission: "bookings.facilities.manage", path: "/organizations/{organizationId}/bookable-resources", createPath: "/organizations/{organizationId}/bookable-resources", branchScoped: true,
    columns: [{ label: "الرمز", key: "code" }, { label: "المورد", key: "name" }, { label: "النوع", key: "type" }, { label: "السعة", key: "capacity" }, { label: "الحالة", key: "status" }],
    createFields: [{ name: "facilityId", label: "المرفق", type: "select", source: "facilities", required: true }, { name: "serviceId", label: "الخدمة المرتبطة", type: "select", source: "services", required: true }, { name: "cancellationPolicyVersionId", label: "سياسة إلغاء الحجز", type: "select", source: "policies", sourceFilter: { key: "policyType", value: "BOOKING_CANCELLATION" }, required: true, hint: "تُلتقط هذه السياسة مع كل حجز حتى لا تتغير شروطه لاحقًا." }, { name: "code", label: "رمز المورد", required: true }, { name: "name", label: "اسم المورد", required: true }, { name: "type", label: "نوع الحجز", type: "select", required: true, options: [{ value: "COURT", label: "ملعب" }, { value: "CLASS", label: "حصة جماعية" }, { value: "PERSONAL_TRAINING", label: "تدريب شخصي" }] }, { name: "capacity", label: "السعة", type: "number", required: true }],
  },
  {
    id: "notification-templates", label: "قوالب الرسائل", description: "قوالب عربية للرسائل النصية الآن، وجاهزة لإعادة الاستخدام عند ربط واتساب لاحقًا دون إرسال فعلي من هنا.", permission: "notification-templates.read", managePermission: "notification-templates.manage", path: "/organizations/{organizationId}/notification-templates", createPath: "/organizations/{organizationId}/notification-templates",
    columns: [{ label: "المفتاح", key: "templateKey" }, { label: "اللغة", key: "language" }, { label: "نص الرسالة", key: "body" }, { label: "المتغيرات", key: "allowedVariables" }],
    createFields: [{ name: "templateKey", label: "مفتاح القالب", required: true, hint: "مثل: membership_reminder أو booking_confirmation." }, { name: "language", label: "اللغة", type: "select", required: true, options: [{ value: "ar", label: "العربية" }, { value: "en", label: "English" }] }, { name: "body", label: "نص الرسالة", type: "textarea", required: true, hint: "يمكنك كتابة متغيرات مثل {{memberName}} بعد إضافتها أدناه." }, { name: "variables", label: "المتغيرات المسموحة", hint: "اكتبها مفصولة بفواصل، مثل memberName, renewalDate." }],
    initial: { language: "ar" },
    createBody: values => ({ templateKey: values.templateKey, language: values.language, body: values.body, allowedVariables: String(values.variables ?? "").split(",").map(value => value.trim()).filter(Boolean) }),
  },
  {
    id: "retail-categories", label: "تصنيفات المتجر", description: "تصنيفات مستقلة لمنتجات البيع مثل الملابس والمكملات والمشروبات.", permission: "retail.catalog.read", managePermission: "retail.catalog.manage", path: "/organizations/{organizationId}/retail/categories", createPath: "/organizations/{organizationId}/retail/categories", updatePath: id => `/organizations/{organizationId}/retail/categories/${id}`,
    columns: [{ label: "الرمز", key: "code" }, { label: "التصنيف", key: "name" }, { label: "الحالة", key: "status" }],
    createFields: [{ name: "code", label: "رمز التصنيف", required: true }, { name: "name", label: "اسم التصنيف", required: true }],
    editFields: [{ name: "name", label: "اسم التصنيف", required: true }, { name: "status", label: "الحالة", type: "select", required: true, options: [{ value: "ACTIVE", label: "نشط" }, { value: "INACTIVE", label: "محذوف / مؤرشف" }] }],
  },
  {
    id: "retail-products", label: "منتجات المتجر", description: "تعريف المنتجات والباركود ووحدة البيع مرة واحدة على مستوى النادي.", permission: "retail.catalog.read", managePermission: "retail.catalog.manage", path: "/organizations/{organizationId}/retail/products", createPath: "/organizations/{organizationId}/retail/products", updatePath: id => `/organizations/{organizationId}/retail/products/${id}`,
    columns: [{ label: "الرمز", key: "code" }, { label: "الباركود", key: "barcode" }, { label: "المنتج", key: "name" }, { label: "التصنيف", key: "categoryName" }, { label: "الوحدة", key: "unit" }, { label: "الحالة", key: "status" }],
    createFields: [{ name: "categoryId", label: "التصنيف", type: "select", source: "retailCategories", required: true }, { name: "code", label: "رمز المنتج", required: true }, { name: "barcode", label: "الباركود", hint: "يمكن مسحه بقارئ الباركود في نقطة البيع." }, { name: "name", label: "اسم المنتج", required: true }, { name: "unit", label: "وحدة البيع", type: "select", required: true, options: [{ value: "UNIT", label: "قطعة" }, { value: "PAIR", label: "زوج" }, { value: "BOTTLE", label: "زجاجة" }, { value: "CAN", label: "علبة" }, { value: "PACK", label: "عبوة" }, { value: "BOX", label: "صندوق" }, { value: "KG", label: "كيلوجرام" }] }, { name: "description", label: "الوصف", type: "textarea" }],
    editFields: [{ name: "categoryId", label: "التصنيف", type: "select", source: "retailCategories", required: true }, { name: "barcode", label: "الباركود" }, { name: "name", label: "اسم المنتج", required: true }, { name: "unit", label: "وحدة البيع", type: "select", required: true, options: [{ value: "UNIT", label: "قطعة" }, { value: "PAIR", label: "زوج" }, { value: "BOTTLE", label: "زجاجة" }, { value: "CAN", label: "علبة" }, { value: "PACK", label: "عبوة" }, { value: "BOX", label: "صندوق" }, { value: "KG", label: "كيلوجرام" }] }, { name: "description", label: "الوصف", type: "textarea" }, { name: "status", label: "الحالة", type: "select", required: true, options: [{ value: "ACTIVE", label: "نشط" }, { value: "INACTIVE", label: "محذوف / مؤرشف" }] }],
    initial: { unit: "UNIT" },
  },
  {
    id: "retail-prices", label: "أسعار منتجات المتجر", description: "سعر بيع مستقل لكل فرع مع بيان الضريبة وتاريخ بدء التطبيق.", permission: "retail.catalog.read", managePermission: "retail.pricing.manage", path: "/organizations/{organizationId}/retail/prices", createPath: "/organizations/{organizationId}/retail/prices", updatePath: id => `/organizations/{organizationId}/retail/prices/${id}`, branchScoped: true,
    columns: [{ label: "المنتج", key: "productName" }, { label: "السعر", key: "amountMinor" }, { label: "الضريبة", key: "taxRateBps" }, { label: "شامل الضريبة", key: "taxInclusive" }, { label: "ساري من", key: "validFrom" }],
    createFields: [{ name: "productId", label: "المنتج", type: "select", source: "retailProducts", required: true }, { name: "amount", label: "سعر البيع بالريال", type: "number", required: true }, { name: "taxRate", label: "نسبة الضريبة %", type: "number", required: true }, { name: "taxInclusive", label: "السعر المدخل شامل الضريبة", type: "checkbox" }],
    editFields: [{ name: "amount", label: "سعر البيع الجديد بالريال", type: "number", required: true }, { name: "taxRate", label: "نسبة الضريبة %", type: "number", required: true }, { name: "taxInclusive", label: "السعر شامل الضريبة", type: "checkbox" }, { name: "validUntil", label: "نهاية السريان (اختياري)", type: "datetime-local" }, { name: "status", label: "الحالة", type: "select", required: true, options: [{ value: "ACTIVE", label: "ساري" }, { value: "INACTIVE", label: "محذوف / منتهي" }] }],
    initial: { taxRate: "15", taxInclusive: true },
    createBody: values => ({ productId: values.productId, amountMinor: String(Math.round(number(values.amount) * 100)), taxRateBps: Math.round(number(values.taxRate) * 100), taxInclusive: Boolean(values.taxInclusive), validFrom: isoNow() }),
    editBody: (values, item) => ({ amountMinor: String(Math.round(number(values.amount || String(Number(item.amountMinor ?? 0) / 100)) * 100)), taxRateBps: Math.round(number(values.taxRate || String(Number(item.taxRateBps ?? 0) / 100)) * 100), taxInclusive: Boolean(values.taxInclusive), validUntil: values.validUntil ? new Date(String(values.validUntil)).toISOString() : undefined, status: values.status, expectedVersion: Number(item.version ?? 1) }),
  },
  {
    id: "retail-inventory", label: "مخزون المتجر", description: "استلام وتسوية مخزون المنتجات في الفرع الحالي مع منع البيع فوق الرصيد المتاح.", permission: "retail.inventory.read", managePermission: "retail.inventory.manage", path: "/organizations/{organizationId}/retail/inventory", createPath: "/organizations/{organizationId}/retail/stock-adjustments", branchScoped: true,
    columns: [{ label: "المنتج", key: "productName" }, { label: "الرصيد الفعلي", key: "quantityOnHand" }, { label: "محجوز", key: "quantityReserved" }, { label: "متاح للبيع", key: "quantityAvailable" }, { label: "حد إعادة الطلب", key: "reorderLevel" }, { label: "حالة المخزون", key: "stockStatus" }],
    createFields: [{ name: "productId", label: "المنتج", type: "select", source: "retailProducts", required: true }, { name: "movementType", label: "نوع الحركة", type: "select", required: true, options: [{ value: "RECEIPT", label: "استلام بضاعة" }, { value: "RETURN", label: "مرتجع عميل سليم" }, { value: "ADJUSTMENT_IN", label: "تسوية بالزيادة" }, { value: "ADJUSTMENT_OUT", label: "تسوية بالنقص" }] }, { name: "quantity", label: "الكمية", type: "number", required: true }, { name: "reorderLevel", label: "حد إعادة الطلب", type: "number" }, { name: "notes", label: "سبب الحركة / رقم المستند", type: "textarea", required: true }],
    initial: { movementType: "RECEIPT", quantity: "1" },
    createBody: values => ({ productId: values.productId, movementType: values.movementType, quantity: number(values.quantity), reorderLevel: values.reorderLevel === "" ? undefined : number(values.reorderLevel), notes: values.notes }),
  },
  {
    id: "expense-categories", label: "تصنيفات المصروفات", description: "تصنيف المصروفات وتحديد الحد الذي يستلزم اعتمادًا إداريًا قبل السداد.", permission: "finance.expenses.read", managePermission: "finance.expenses.manage", path: "/organizations/{organizationId}/expense-categories", createPath: "/organizations/{organizationId}/expense-categories",
    columns: [{ label: "الرمز", key: "code" }, { label: "التصنيف", key: "name" }, { label: "حد طلب الاعتماد", key: "approvalThresholdMinor" }, { label: "الحالة", key: "status" }],
    createFields: [{ name: "code", label: "رمز التصنيف", required: true }, { name: "name", label: "اسم التصنيف", required: true }, { name: "approvalThreshold", label: "يتطلب اعتمادًا من مبلغ (ر.س)", type: "number", required: true }],
    initial: { approvalThreshold: "0" },
    createBody: values => ({ code: values.code, name: values.name, approvalThresholdMinor: String(Math.round(number(values.approvalThreshold) * 100)) }),
  },
  {
    id: "meal-categories", label: "تصنيفات المطعم", description: "تصنيفات الوجبات والمنتجات في المطعم على مستوى النادي.", permission: "restaurant.catalog.read", managePermission: "restaurant.catalog.manage", path: "/organizations/{organizationId}/restaurant/meal-categories", createPath: "/organizations/{organizationId}/restaurant/meal-categories", authorizationBranchScoped: true,
    columns: [{ label: "الرمز", key: "code" }, { label: "التصنيف", key: "name" }], createFields: [{ name: "code", label: "رمز التصنيف", required: true }, { name: "name", label: "اسم التصنيف", required: true }],
  },
]

const navigationGroups = [
  { label: "النادي والموظفون", ids: ["branches", "positions"] },
  { label: "الصلاحيات الإضافية", ids: ["roles", "role-assignments"] },
  { label: "الخدمات والتسعير", ids: ["activities", "categories", "services", "packages", "prices", "promotions", "commercial-policies"] },
  { label: "المرافق والتشغيل", ids: ["facilities", "bookable-resources", "cash-points", "lockers"] },
  { label: "التدريب", ids: ["measurement-types"] },
  { label: "المطعم", ids: ["meal-categories"] },
  { label: "المتجر والمخزون", ids: ["retail-categories", "retail-products", "retail-prices", "retail-inventory"] },
  { label: "المالية", ids: ["expense-categories"] },
  { label: "التواصل", ids: ["notification-templates"] },
] as const

function listOf(data: unknown): RecordItem[] { if (Array.isArray(data)) return data.filter((item): item is RecordItem => Boolean(item) && typeof item === "object"); if (data && typeof data === "object" && "items" in data && Array.isArray((data as { items?: unknown }).items)) return (data as { items: RecordItem[] }).items; return [] }
function itemId(item: RecordItem) { return String(item.id ?? item.roleId ?? item.activityId ?? item.branchId ?? "") }
function text(value: unknown, key?: string) {
  if (value === null || value === undefined || value === "") return "—"
  if (key === "amountMinor") return money(value)
  if (key === "taxRateBps") return `${Number(value) / 100}%`
  if (key === "taxInclusive") return value === true ? "نعم — السعر النهائي شامل الضريبة" : "لا — تُضاف الضريبة عند البيع"
  if (key === "stockStatus") return String(value) === "LOW_STOCK" ? "وصل حد إعادة الطلب" : "متاح"
  if (key === "unit") return ({ UNIT: "قطعة", PAIR: "زوج", BOTTLE: "زجاجة", CAN: "علبة", PACK: "عبوة", BOX: "صندوق", KG: "كيلوجرام" } as Record<string,string>)[String(value)] ?? String(value)
  if (key === "durationDays") return `${value} يوم`
  if (key === "benefitValue") return money(value)
  if (key === "benefitType") return ({ PERCENTAGE: "خصم نسبة", FIXED_DISCOUNT: "خصم مبلغ", FIXED_FINAL_PRICE: "سعر نهائي" } as Record<string, string>)[String(value)] ?? String(value)
  if (key === "scopeType") return ({ ORGANIZATION: "كل النادي", SELECTED_BRANCHES: "فروع محددة" } as Record<string, string>)[String(value)] ?? String(value)
  if (key === "eligibility") return ({ EVERYONE: "الجميع", NEW_MEMBER: "أعضاء جدد", FORMER_MEMBER: "أعضاء سابقون", PROMO_CODE: "بكود العرض" } as Record<string, string>)[String(value)] ?? String(value)
  if (key === "policyType") return ({ FREEZE: "تجميد الاشتراك", CANCELLATION: "إلغاء الاشتراك", RENEWAL: "تجديد الاشتراك", BOOKING_CANCELLATION: "إلغاء الحجز" } as Record<string, string>)[String(value)] ?? String(value)
  if (key === "type") return ({ COURT: "ملعب", CLASS: "حصة جماعية", PERSONAL_TRAINING: "تدريب شخصي" } as Record<string, string>)[String(value)] ?? String(value)
  if (key === "validFrom" || key === "validUntil") { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date) }
  if (Array.isArray(value)) return key === "branchNames" ? (value.length ? value.join("، ") : "كل فروع النادي") : key === "branchIds" ? (value.length ? `${value.length} فروع` : "كل الفروع") : key === "targets" ? `${value.length} خدمات / باقات` : key === "allowedVariables" ? `${value.length} متغيرات` : `${value.length} صلاحية`
  if (typeof value === "object") return "بيانات مرتبطة"
  if (key?.toLowerCase().endsWith("id") && isUuid(String(value))) return "بيانات مرتبطة"
  return String(value)
}
function itemText(item: RecordItem, key: string, branches: BranchLookup[] = []) { if (key === "benefitValue" && item.benefitType === "PERCENTAGE") return `${Number(item[key]) / 100}%`; if (key === "branchId") { const branch = branches.find(candidate => candidate.id === item[key]); return branch?.nameAr ?? branch?.name ?? (item[key] ? "فرع محدد" : "جميع الفروع") } return text(item[key], key) }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value) }
function valueFrom(item: RecordItem, key: string): Value { const value = item[key]; if (Array.isArray(value)) return value.map(entry => typeof entry === "string" ? entry : String((entry as RecordItem).permission ?? (entry as RecordItem).id ?? "")).filter(Boolean); return typeof value === "boolean" ? value : value === null || value === undefined ? "" : String(value) }
function formValueFrom(configId: string, item: RecordItem, key: string): Value { if (configId === "retail-prices" && key === "amount") return String(Number(item.amountMinor ?? 0) / 100); if (configId === "retail-prices" && key === "taxRate") return String(Number(item.taxRateBps ?? 0) / 100); if(configId==="packages"&&key==="accessFrequency")return item.visitLimitPeriod?String(item.visitLimitPeriod):item.visitAllowance?"TOTAL":"UNLIMITED";if(configId==="packages"&&key==="serviceIds"&&Array.isArray(item.entitlements))return item.entitlements.map(entry=>String((entry as RecordItem).serviceId??"")).filter(Boolean); return valueFrom(item, key) }

export function MasterDataPage({ initialSection = "branches" }: { initialSection?: string }) {
  const context = useAppContext()
  const allowed = useMemo(() => configs.filter(config => context.canAccess([config.permission])), [context])
  const [activeId, setActiveId] = useState(initialSection)
  const active = allowed.find(config => config.id === activeId) ?? allowed[0]
  const selectedBranch = context.branches.find(branch => branch.id === context.branchId)
  const [items, setItems] = useState<RecordItem[]>([])
  const [references, setReferences] = useState<Record<string, RecordItem[]>>({})
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState<{ mode: "create" | "edit"; item?: RecordItem }>()
  const [availabilityResource, setAvailabilityResource] = useState<RecordItem>()
  const [availabilityService, setAvailabilityService] = useState<RecordItem>()
  const [publishingPackageId, setPublishingPackageId] = useState("")

  const load = useCallback(async () => {
    if (!active || !context.organizationId || !hasRuntimeApi()) { setItems([]); return }
    setLoading(true); setError(""); setItems([])
    try {
      const path = new URL(active.path.replace("{organizationId}", context.organizationId), "http://local")
      if ((active.branchScoped || active.authorizationBranchScoped) && context.branchId) path.searchParams.set("branchId", context.branchId)
      const response = await apiRequest<unknown>(`${path.pathname}${path.search}`)
      setItems(listOf(response.data))
    }
    catch (reason) { setItems([]); setError(humanError(reason, "تعذر تحميل بيانات الإدارة.")) }
    finally { setLoading(false) }
  }, [active, context.branchId, context.organizationId])
  useEffect(() => { const frame = requestAnimationFrame(() => { void load() }); return () => cancelAnimationFrame(frame) }, [load])

  async function publishPackage(item: RecordItem) {
    const id = itemId(item)
    if (!id || !context.organizationId) return
    setPublishingPackageId(id); setError("")
    try {
      await apiRequest(`/organizations/${context.organizationId}/packages/${id}/publications`, { method: "POST", body: JSON.stringify({ expectedVersion: Number(item.version ?? 1) }), idempotencyKey: createIdempotencyKey() })
      await load()
    } catch (reason) { setError(humanError(reason, "تعذر نشر الباقة.")) }
    finally { setPublishingPackageId("") }
  }

  const filtered = items.filter(item => Object.values(item).some(value => String(value ?? "").toLowerCase().includes(query.toLowerCase())))
  if (!active) return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا تملك صلاحية الوصول إلى بيانات الإدارة.</CardContent></Card>
  const exceptionalPermissions = active.id === "roles" || active.id === "role-assignments"
  const createLabel = active.id === "roles" ? "إنشاء مجموعة صلاحيات" : active.id === "role-assignments" ? "إضافة صلاحيات لموظف" : "إضافة جديد"

  return <div className="fade-up" dir="rtl">
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Badge variant="outline" className="mb-3 border-primary/30 bg-primary/10 text-amber-700">إدارة النظام</Badge><h1 className="text-2xl font-black tracking-tight sm:text-3xl">إعداد النظام</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">إدارة الفروع والكتالوج والأسعار والمسميات الوظيفية وباقي إعدادات التشغيل من مصدر واحد.</p></div><Button size="lg" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />تحديث البيانات</Button></div>
    <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]"><Card className="h-fit"><CardContent className="p-2"><p className="px-3 pb-2 pt-3 text-[10px] font-bold text-muted-foreground">مجموعات الإدارة</p><div className="space-y-4">{navigationGroups.map(group => { const groupConfigs = group.ids.map(id => allowed.find(config => config.id === id)).filter((config): config is MasterConfig => Boolean(config)); return groupConfigs.length ? <section key={group.label}><p className="px-3 pb-1 text-[10px] font-bold text-muted-foreground">{group.label}</p><div className="space-y-1">{groupConfigs.map(config => <Link key={config.id} href={`/system-settings/${config.id}`} onClick={() => { setActiveId(config.id); setQuery("") }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right text-xs font-bold transition ${active.id === config.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}><Settings2 className="size-4" />{config.label}<ChevronLeft className="mr-auto size-3 opacity-60" /></Link>)}</div></section> : null })}</div></CardContent></Card>
      <Card className="overflow-hidden"><div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-amber-700"><Building2 className="size-4" /></span><div><h2 className="font-black">{active.label}</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{active.description}</p></div></div></div>{active.createFields && context.canAccess([active.managePermission]) && <Button onClick={() => setForm({ mode: "create" })}><Plus />{createLabel}</Button>}</div>{exceptionalPermissions && <div className="flex items-start gap-3 border-b border-amber-500/20 bg-amber-500/10 px-5 py-4 text-xs leading-6"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700" /><div><p className="font-black">{active.id === "role-assignments" ? "هذه ليست قائمة كل الموظفين" : "هذه المجموعات ليست بديلًا عن المسمى الوظيفي"}</p><p className="text-muted-foreground">{active.id === "role-assignments" ? "يعرض الجدول فقط الموظفين الذين لديهم صلاحيات إضافية بالفعل. لإضافة موظف آخر اضغط «إضافة صلاحيات لموظف»؛ وستظهر جميع حسابات الموظفين في القائمة." : "الموظف يحصل تلقائيًا على صلاحيات مسماه الوظيفي وفرعه. أنشئ هنا فقط مجموعة إضافية لحاجة إدارية خاصة أو لإدارة أكثر من فرع."}</p></div></div>}{active.branchScoped && <div className="flex items-center gap-2 border-b bg-amber-500/8 px-5 py-3 text-xs"><Building2 className="size-4 text-amber-700" /><span className="font-bold">نطاق هذه البيانات:</span><span>{selectedBranch?.nameAr ?? selectedBranch?.name ?? "الفرع الحالي"}</span><span className="text-muted-foreground">— غيّر الفرع من الشريط العلوي لعرض أو إدارة فرع آخر.</span></div>}<div className="border-b p-4"><div className="relative max-w-md"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} className="pr-10" placeholder={`ابحث في ${active.label}...`} /></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-right text-xs"><thead className="bg-secondary/45"><tr>{active.columns.map(column => <th key={column.key} className="px-5 py-3 text-[10px] font-bold text-muted-foreground">{column.label}</th>)}<th className="w-20 px-5" /></tr></thead><tbody className="divide-y">{filtered.map(item => <tr key={itemId(item)} className="hover:bg-secondary/30">{active.columns.map(column => <td key={column.key} className="px-5 py-4">{column.key === "status" ? <StatusBadge status={String(item[column.key] ?? "—")} /> : <span className="max-w-64 truncate font-medium">{itemText(item, column.key, context.branches)}</span>}</td>)}<td className="px-5">{active.id === "packages" && item.status === "DRAFT" && context.canAccess([active.managePermission]) && <Button variant="ghost" size="sm" disabled={publishingPackageId === itemId(item)} onClick={() => void publishPackage(item)}>{publishingPackageId === itemId(item) ? <Loader2 className="animate-spin" /> : "نشر"}</Button>}{active.id === "services" && context.canAccess(["catalog.availability.manage"]) && <Button variant="ghost" size="sm" onClick={() => setAvailabilityService(item)}>تفعيل بالفرع</Button>}{active.id === "bookable-resources" && context.canAccess([active.managePermission]) && <Button variant="ghost" size="sm" onClick={() => setAvailabilityResource(item)}>الإتاحة</Button>}{active.updatePath && active.editFields && context.canAccess([active.managePermission]) && <Button variant="ghost" size="sm" onClick={() => setForm({ mode: "edit", item })}><Pencil />{active.editFields.some(field => field.name === "status") ? "تعديل أو أرشفة" : "تعديل"}</Button>}</td></tr>)}</tbody></table>{loading ? <div className="grid place-items-center p-14"><Loader2 className="size-7 animate-spin text-primary" /></div> : error ? <div className="p-10 text-center"><p className="font-bold text-destructive">تعذر عرض البيانات</p><p className="mt-2 text-xs text-muted-foreground">{error}</p><Button className="mt-4" variant="outline" onClick={() => void load()}>إعادة المحاولة</Button></div> : !filtered.length && <div className="p-14 text-center text-sm text-muted-foreground">لا توجد سجلات مطابقة.</div>}</div></Card></div>
    {form && <MasterForm config={active} mode={form.mode} item={form.item} organizationId={context.organizationId} branchId={context.branchId} references={references} setReferences={setReferences} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); void load(); void context.reload() }} />}
    {availabilityResource && <ResourceAvailabilityDialog resource={availabilityResource} organizationId={context.organizationId} branchId={context.branchId} onClose={() => setAvailabilityResource(undefined)} />}
    {availabilityService && <ServiceAvailabilityDialog service={availabilityService} organizationId={context.organizationId} branchId={context.branchId} branchName={selectedBranch?.nameAr ?? selectedBranch?.name ?? "الفرع الحالي"} onClose={() => setAvailabilityService(undefined)} />}
  </div>
}

function ServiceAvailabilityDialog({ service, organizationId, branchId, branchName, onClose }: { service: RecordItem; organizationId: string; branchId: string; branchName: string; onClose: () => void }) {
  const [enabled, setEnabled] = useState(true)
  const [validFrom, setValidFrom] = useState(dateTimeLocal(new Date()))
  const [validUntil, setValidUntil] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("")
    try {
      await apiRequest(`/organizations/${organizationId}/services/${itemId(service)}/availabilities`, { method: "POST", idempotencyKey: createIdempotencyKey(), body: JSON.stringify({ branchId, enabled, validFrom: new Date(validFrom).toISOString(), validUntil: validUntil ? new Date(validUntil).toISOString() : undefined }) })
      onClose()
    } catch (reason) { setError(humanError(reason, "تعذر حفظ إتاحة الخدمة لهذا الفرع.")) }
    finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-[85] grid place-items-end bg-black/60 backdrop-blur-sm sm:place-items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" aria-labelledby="service-availability-title" className="w-full rounded-t-[28px] border bg-card shadow-2xl sm:max-w-lg sm:rounded-[28px]"><header className="flex items-start border-b p-5"><div><p className="text-[11px] font-bold text-amber-700">إتاحة الخدمة</p><h2 id="service-availability-title" className="mt-1 text-lg font-black">{String(service.name ?? service.code ?? "الخدمة")}</h2><p className="mt-1 text-[11px] text-muted-foreground">ستظهر هذه الخدمة في {branchName} وفق الفترة المحددة.</p></div><Button className="mr-auto" variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق"><X /></Button></header><form onSubmit={submit} className="grid gap-4 p-5"><label className="flex cursor-pointer items-center justify-between rounded-xl border p-4 text-xs font-bold"><span>الخدمة متاحة في هذا الفرع</span><input type="checkbox" className="size-4 accent-amber-500" checked={enabled} onChange={event => setEnabled(event.target.checked)} /></label><label className="text-xs font-bold">سارية من<Input type="datetime-local" value={validFrom} onChange={event => setValidFrom(event.target.value)} className="mt-2 h-11" /></label><label className="text-xs font-bold">تنتهي في (اختياري)<Input type="datetime-local" value={validUntil} onChange={event => setValidUntil(event.target.value)} className="mt-2 h-11" /></label>{error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-xs font-bold text-destructive">{error}</p>}<footer className="flex gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={onClose}>إلغاء</Button><Button type="submit" className="mr-auto" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Check />}حفظ الإتاحة</Button></footer></form></section></div>
}

const weekdayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]

function ResourceAvailabilityDialog({ resource, organizationId, branchId, onClose }: { resource: RecordItem; organizationId: string; branchId: string; onClose: () => void }) {
  const resourceId = itemId(resource)
  const [rules, setRules] = useState<RecordItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [values, setValues] = useState({ dayOfWeek: "0", startLocal: "08:00", endLocal: "22:00", validFrom: new Date().toISOString().slice(0, 10), validUntil: "" })
  const path = `/organizations/${organizationId}/bookable-resources/${resourceId}/availability-rules`

  const loadRules = useCallback(async () => {
    if (!resourceId) return
    setLoading(true)
    try { const response = await apiRequest<unknown>(path); setRules(listOf(response.data)); setError("") }
    catch (reason) { setError(humanError(reason, "تعذر تحميل قواعد الإتاحة.")) }
    finally { setLoading(false) }
  }, [path, resourceId])
  useEffect(() => { const frame = requestAnimationFrame(() => { void loadRules() }); return () => cancelAnimationFrame(frame) }, [loadRules])
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("")
    try {
      await apiRequest(path, { method: "POST", idempotencyKey: createIdempotencyKey(), body: JSON.stringify({ branchId, dayOfWeek: Number(values.dayOfWeek), startLocal: values.startLocal, endLocal: values.endLocal, validFrom: values.validFrom, validUntil: values.validUntil || undefined }) })
      await loadRules()
    } catch (reason) { setError(humanError(reason, "تعذر حفظ وقت الإتاحة.")) }
    finally { setSaving(false) }
  }

  return <div className="fixed inset-0 z-[85] grid place-items-end bg-black/60 backdrop-blur-sm sm:place-items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" aria-labelledby="availability-title" className="max-h-[94vh] w-full overflow-y-auto rounded-t-[28px] border bg-card shadow-2xl sm:max-w-2xl sm:rounded-[28px]"><header className="sticky top-0 z-10 flex items-start border-b bg-card/95 p-5 backdrop-blur"><div><p className="text-[11px] font-bold text-amber-700">موارد الحجز</p><h2 id="availability-title" className="mt-1 text-xl font-black">أوقات إتاحة {String(resource.name ?? resource.code ?? "المورد")}</h2><p className="mt-1 text-[11px] text-muted-foreground">أضف المواعيد الأسبوعية التي يقبل النظام الحجز خلالها في الفرع الحالي.</p></div><Button className="mr-auto" variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق"><X /></Button></header><div className="p-5 sm:p-6"><form onSubmit={submit} className="grid gap-4 rounded-2xl border bg-secondary/25 p-4 sm:grid-cols-2"><label className="text-xs font-bold">اليوم<select value={values.dayOfWeek} onChange={event => setValues(current => ({ ...current, dayOfWeek: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm">{weekdayNames.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label><label className="text-xs font-bold">يبدأ من<Input type="time" value={values.startLocal} onChange={event => setValues(current => ({ ...current, startLocal: event.target.value }))} className="mt-2 h-11" /></label><label className="text-xs font-bold">ينتهي في<Input type="time" value={values.endLocal} onChange={event => setValues(current => ({ ...current, endLocal: event.target.value }))} className="mt-2 h-11" /></label><label className="text-xs font-bold">سارية من<Input type="date" value={values.validFrom} onChange={event => setValues(current => ({ ...current, validFrom: event.target.value }))} className="mt-2 h-11" /></label><label className="text-xs font-bold">تنتهي في (اختياري)<Input type="date" value={values.validUntil} onChange={event => setValues(current => ({ ...current, validUntil: event.target.value }))} className="mt-2 h-11" /></label><div className="flex items-end"><Button type="submit" className="w-full" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Check />}إضافة وقت الإتاحة</Button></div></form>{error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-xs font-bold text-destructive">{error}</p>}<section className="mt-6"><h3 className="text-sm font-black">الأوقات الحالية</h3>{loading ? <div className="grid place-items-center p-8"><Loader2 className="animate-spin text-primary" /></div> : rules.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{rules.map(rule => <div key={itemId(rule)} className="rounded-xl border p-3"><p className="text-xs font-bold">{weekdayNames[Number(rule.dayOfWeek)] ?? "يوم غير محدد"}</p><p className="mt-1 text-[11px] text-muted-foreground">{String(rule.startLocal)} — {String(rule.endLocal)}</p><p className="mt-1 text-[10px] text-muted-foreground">من {String(rule.validFrom)}{rule.validUntil ? ` إلى ${String(rule.validUntil)}` : ""}</p></div>)}</div> : <p className="mt-3 rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">لا توجد أوقات إتاحة بعد.</p>}</section></div></section></div>
}

function MasterForm({ config, mode, item, organizationId, branchId, references, setReferences, onClose, onSaved }: { config: MasterConfig; mode: "create" | "edit"; item?: RecordItem; organizationId: string; branchId: string; references: Record<string, RecordItem[]>; setReferences: React.Dispatch<React.SetStateAction<Record<string, RecordItem[]>>>; onClose: () => void; onSaved: () => void }) {
  const fields = useMemo(() => mode === "create" ? config.createFields ?? [] : config.editFields ?? [], [config, mode])
  const [values, setValues] = useState<Values>(() => Object.fromEntries(fields.map(field => [field.name, item ? formValueFrom(config.id, item, field.name) : config.initial?.[field.name] ?? (field.type === "checkbox" ? false : field.type === "multi" ? [] : "")])))
  const visibleFields = useMemo(() => fields.filter(field => !field.visibleWhen || field.visibleWhen.values.includes(String(values[field.visibleWhen.field] ?? ""))), [fields, values])
  const [saving, setSaving] = useState(false); const [error, setError] = useState("")
  const requiredSources = useMemo(() => [...new Set([...fields.map(field => field.source).filter((source): source is NonNullable<Field["source"]> => Boolean(source)), ...(config.id === "prices" ? ["services" as const] : [])])], [config.id, fields])
  useEffect(() => {
    if (!hasRuntimeApi() || !organizationId) return
    const sourceKey = (source: NonNullable<Field["source"]>) => source === "facilities" ? `facilities:${branchId}` : source
    const missingSources = requiredSources.filter(source => !references[sourceKey(source)])
    if (missingSources.length === 0) return
    let cancelled = false
    const paths: Record<NonNullable<Field["source"]>, string> = { activities: "/organizations/{organizationId}/activities", categories: "/organizations/{organizationId}/service-categories", services: "/organizations/{organizationId}/services", packages: "/organizations/{organizationId}/packages", permissions: "/organizations/{organizationId}/permissions", branches: "/organizations/{organizationId}/branches", meals: "/organizations/{organizationId}/restaurant/meals", facilities: "/organizations/{organizationId}/facilities", policies: "/organizations/{organizationId}/commercial-policies", accounts: "/organizations/{organizationId}/user-accounts?ownerType=EMPLOYEE&limit=500", roles: "/organizations/{organizationId}/roles", retailCategories: "/organizations/{organizationId}/retail/categories", retailProducts: "/organizations/{organizationId}/retail/products" }
    void Promise.all(missingSources.map(async source => {
      const path = new URL(paths[source].replace("{organizationId}", organizationId), "http://local")
      if (source === "facilities" && branchId) path.searchParams.set("branchId", branchId)
      const response = await apiRequest<unknown>(`${path.pathname}${path.search}`)
      return [sourceKey(source), listOf(response.data)] as const
    })).then(entries => {
      if (entries.length && !cancelled) setReferences(current => ({ ...current, ...Object.fromEntries(entries) }))
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [branchId, organizationId, references, requiredSources, setReferences])
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!organizationId) return; if (config.id === "promotions" && asArray(values.packageIds).length + asArray(values.serviceIds).length === 0) { setError("اختر باقة واحدة أو خدمة واحدة على الأقل ليُطبق عليها العرض."); return } if (config.id === "role-assignments" && values.scopeType === "SELECTED_BRANCHES" && asArray(values.branchIds).length === 0) { setError("اختر فرع عمل واحدًا على الأقل للموظف."); return } setSaving(true); setError(""); try { let body: Record<string, unknown>; if (mode === "create") body = config.createBody ? config.createBody(values) : Object.fromEntries(Object.entries(values).filter(([, value]) => value !== "")); else body = config.editBody ? config.editBody(values, item ?? {}) : { ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== "")), expectedVersion: Number(item?.version ?? 1) }; if (config.branchScoped) body = { ...body, branchId }; const path = (mode === "create" ? config.createPath : config.updatePath?.(itemId(item ?? {})))?.replace("{organizationId}", organizationId); if (!path) throw new Error("مسار الحفظ غير متاح"); await apiRequest(path, { method: mode === "create" ? "POST" : config.updateMethod ?? "PATCH", body: JSON.stringify(body), idempotencyKey: mode === "create" ? createIdempotencyKey() : undefined }); onSaved() } catch (reason) { setError(humanError(reason, "تعذر حفظ التغييرات.")) } finally { setSaving(false) } }
  return <div className="fixed inset-0 z-[80] grid place-items-end bg-black/60 backdrop-blur-sm sm:place-items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" aria-labelledby="master-form-title" className="max-h-[94vh] w-full overflow-y-auto rounded-t-[28px] border bg-card shadow-2xl sm:max-w-2xl sm:rounded-[28px]"><header className="sticky top-0 z-10 flex items-start border-b bg-card/95 p-5 backdrop-blur"><div><p className="text-[11px] font-bold text-amber-700">البيانات الرئيسية</p><h2 id="master-form-title" className="mt-1 text-xl font-black">{mode === "create" ? `إضافة ${config.label}` : `تعديل ${config.label}`}</h2></div><Button className="mr-auto" variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق"><X /></Button></header><form onSubmit={submit} className="p-5 sm:p-6"><div className="grid gap-5 sm:grid-cols-2">{visibleFields.map(field => { const source = config.id === "prices" && field.name === "targetId" ? values.targetType === "SERVICE" ? "services" : "packages" : field.source; const referenceKey = source === "facilities" ? `facilities:${branchId}` : source; const choices = (referenceKey ? references[referenceKey] ?? [] : []).filter(choice => !field.sourceFilter || choice[field.sourceFilter.key] === field.sourceFilter.value); return <MasterField key={field.name} field={field} value={values[field.name]} choices={choices} onChange={value => setValues(current => ({ ...current, [field.name]: value }))} /> })}</div>{error && <p role="alert" className="mt-5 rounded-xl bg-destructive/10 p-3 text-xs font-bold text-destructive">{error}</p>}<footer className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row"><Button type="button" variant="outline" onClick={onClose}>إلغاء</Button><Button type="submit" className="sm:mr-auto" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Check />}حفظ التغييرات</Button></footer></form></section></div>
}

type PermissionChoice = { code: string; label: string; group: string; groupOrder: number }

const permissionGroups = [
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
] as const

const permissionSubjects: Record<string, string> = {
  organization: "النادي", branch: "الفروع", "iam.accounts": "حسابات الموظفين", "iam.roles": "الأدوار", "iam.assignments": "تعيين الأدوار", "iam.audit": "سجل المراجعة",
  members: "الأعضاء", "members.sensitive": "بيانات الأعضاء الحساسة", "members.accounts": "حسابات الأعضاء", workforce: "الموظفين", "workforce.assignments": "تعيينات الموظفين", "workforce.accounts": "حسابات الموظفين", "workforce.shifts": "المناوبات", "workforce.attendance": "حضور الموظفين", files: "الملفات",
  catalog: "الخدمات والأنشطة", "catalog.availability": "توفر الخدمات", commercial: "الباقات التجارية", pricing: "الأسعار", promotions: "العروض", policies: "السياسات", subscriptions: "الاشتراكات", "subscriptions.adjustments": "تعديلات الاشتراكات", sales: "المبيعات",
  "finance.invoices": "الفواتير", "finance.payments": "المدفوعات", "finance.refunds": "الاسترجاعات", "finance.expenses": "المصروفات", "finance.cash-points": "نقاط التحصيل", "finance.cash-shifts": "ورديات الصندوق", "finance.other-income": "الإيرادات الأخرى",
  attendance: "دخول الأعضاء", bookings: "الحجوزات", "bookings.facilities": "المرافق", "access-credentials": "بطاقات الدخول", lockers: "الخزائن",
  "restaurant.catalog": "كتالوج المطعم", "restaurant.pricing": "أسعار المطعم", "restaurant.menu": "قائمة المطعم", "restaurant.orders": "طلبات المطعم", "restaurant.meal-plans": "خطط الوجبات",
  "retail.catalog": "كتالوج المتجر", "retail.pricing": "أسعار المتجر", "retail.inventory": "مخزون المتجر",
  coaching: "التدريب", "coaching.assignments": "تعيينات المدربين", "coaching.schedule": "جداول التدريب", "coaching.commissions": "عمولات المدربين", "coaching.training-plans": "خطط التدريب", measurements: "القياسات", "measurement-types": "أنواع القياسات",
  notifications: "الإشعارات", "notifications.whatsapp": "واتساب", "notification-templates": "قوالب الإشعارات", crm: "العملاء المحتملون", "crm.leads": "العملاء المحتملون", "crm.follow-ups": "متابعات العملاء", "online-requests": "الطلبات الإلكترونية", feedback: "الآراء والملاحظات", reporting: "التقارير", "legacy.import": "ترحيل البيانات القديمة",
}

const permissionActions: Record<string, string> = { read: "عرض", manage: "إدارة", create: "إنشاء", activate: "تفعيل", freeze: "تجميد", cancel: "إلغاء", renew: "تجديد", checkout: "إتمام البيع", record: "تسجيل", issue: "إصدار", approve: "اعتماد", pay: "دفع", "check-in": "تسجيل دخول", prepare: "تحضير", redeem: "استبدال", send: "إرسال", rebuild: "إعادة بناء", execute: "تنفيذ", operations: "اعتماد تشغيلي", commercial: "اعتماد تجاري", finance: "اعتماد مالي" }

function permissionChoice(code: string): PermissionChoice {
  const parts = code.split(".")
  const action = parts.at(-1) ?? code
  const subjectKey = parts.slice(0, -1).join(".")
  const subject = permissionSubjects[subjectKey] ?? permissionSubjects[parts[0]] ?? subjectKey.replaceAll("-", " ")
  const groupOrder = permissionGroups.findIndex(group => group.prefixes.some(prefix => code.startsWith(prefix)))
  return { code, label: `${permissionActions[action] ?? action} ${subject}`, group: permissionGroups[groupOrder]?.title ?? "صلاحيات أخرى", groupOrder: groupOrder < 0 ? permissionGroups.length : groupOrder }
}

function PermissionPicker({ field, value, choices, onChange }: { field: Field; value: Value | undefined; choices: RecordItem[]; onChange: (value: Value) => void }) {
  const [query, setQuery] = useState("")
  const selected = asArray(value)
  const permissions = useMemo(() => choices.map(choice => String(choice.code ?? choice.permission ?? itemId(choice))).filter(Boolean).map(permissionChoice).sort((a, b) => a.groupOrder - b.groupOrder || a.label.localeCompare(b.label, "ar")), [choices])
  const grouped = useMemo(() => Array.from(new Map(permissions.filter(permission => `${permission.label} ${permission.code}`.toLowerCase().includes(query.toLowerCase())).map(permission => [permission.group, [] as PermissionChoice[]])).entries()).map(([group]) => ({ group, entries: permissions.filter(permission => permission.group === group && `${permission.label} ${permission.code}`.toLowerCase().includes(query.toLowerCase())) })), [permissions, query])
  const toggle = (code: string, checked: boolean) => onChange(checked ? [...selected, code] : selected.filter(value => value !== code))
  const toggleGroup = (codes: string[]) => { const allSelected = codes.every(code => selected.includes(code)); onChange(allSelected ? selected.filter(code => !codes.includes(code)) : [...new Set([...selected, ...codes])]) }

  return <fieldset className="sm:col-span-2"><legend className="text-sm font-black">{field.label}<span className="mr-1 text-destructive">*</span></legend><p className="mt-1 text-[11px] leading-6 text-muted-foreground">اختر ما يحتاجه هذا الدور فقط. جُمعت الصلاحيات المتقاربة لتسهيل المراجعة، ويمكنك تحديد أو إلغاء مجموعة كاملة.</p><div className="mt-3 flex items-center gap-3 rounded-xl border bg-secondary/30 px-3"><Search className="size-4 text-muted-foreground" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث: أعضاء، فواتير، حجز…" className="h-10 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground" /><span className="whitespace-nowrap text-[10px] font-bold text-muted-foreground">{selected.length} محددة</span></div><div className="mt-3 max-h-[52vh] space-y-3 overflow-y-auto pl-1"><div className="grid gap-3 lg:grid-cols-2">{grouped.map(({ group, entries }) => { const codes = entries.map(entry => entry.code); const selectedCount = codes.filter(code => selected.includes(code)).length; return <section key={group} className="overflow-hidden rounded-xl border bg-card"><header className="flex items-center justify-between gap-3 border-b bg-secondary/45 px-3 py-2.5"><div><h3 className="text-xs font-black">{group}</h3><p className="mt-0.5 text-[10px] text-muted-foreground">{selectedCount} من {entries.length} محددة</p></div><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => toggleGroup(codes)}>{selectedCount === entries.length ? "إلغاء الكل" : "تحديد الكل"}</Button></header><div className="divide-y">{entries.map(permission => <label key={permission.code} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-secondary/50"><input type="checkbox" className="size-4 shrink-0 accent-amber-500" checked={selected.includes(permission.code)} onChange={event => toggle(permission.code, event.target.checked)} /><span className="min-w-0"><span className="block text-xs font-bold">{permission.label}</span><code dir="ltr" className="mt-0.5 block text-left text-[9px] text-muted-foreground">{permission.code}</code></span></label>)}</div></section> })}</div>{!grouped.length && <p className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">لا توجد صلاحيات مطابقة للبحث.</p>}</div></fieldset>
}

function MasterField({ field, value, choices, onChange }: { field: Field; value: Value | undefined; choices: RecordItem[]; onChange: (value: Value) => void }) {
  const choicesFor = choices.map(choice => {
    const primaryLabel = String(
      choice.name ??
      choice.displayName ??
      choice.employeeName ??
      choice.memberName ??
      choice.email ??
      choice.phoneE164 ??
      choice.employeeNumber ??
      choice.memberNumber ??
      choice.roleName ??
      choice.code ??
      choice.permission ??
      "سجل متاح"
    )
    const employeeIdentifier = String(choice.employeeNumber ?? choice.email ?? "").trim()
    const missingLoginAccount = field.source === "accounts" && choice.hasLoginAccount === false
    return {
      value: itemId(choice) || (missingLoginAccount ? `missing-account:${String(choice.employeeId ?? "")}` : String(choice.code ?? choice.permission ?? "")),
      label: `${field.source === "accounts" && employeeIdentifier && employeeIdentifier !== primaryLabel ? `${primaryLabel} — ${employeeIdentifier}` : primaryLabel}${missingLoginAccount ? " — لا يوجد حساب دخول" : ""}`,
      disabled: missingLoginAccount,
    }
  }).filter(choice => choice.value)
  if (field.type === "checkbox") return <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-xs font-bold sm:col-span-2"><input type="checkbox" className="size-4 accent-amber-500" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} />{field.label}</label>
  if (field.source === "permissions") return <PermissionPicker field={field} value={value} choices={choices} onChange={onChange} />
  if (field.type === "multi") { const selected = asArray(value); return <fieldset className="sm:col-span-2"><legend className="text-xs font-bold">{field.label}{field.required && <span className="mr-1 text-destructive">*</span>}</legend><div className="mt-2 grid max-h-44 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">{choicesFor.length ? choicesFor.map(choice => <label key={choice.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-secondary"><input type="checkbox" className="accent-amber-500" checked={selected.includes(choice.value)} onChange={event => onChange(event.target.checked ? [...selected, choice.value] : selected.filter(id => id !== choice.value))} />{choice.label}</label>) : <p className="text-xs text-muted-foreground">لا توجد خيارات متاحة بعد.</p>}</div>{field.hint && <span className="mt-2 block text-[10px] text-muted-foreground">{field.hint}</span>}</fieldset> }
  if (field.type === "textarea") return <label className="text-xs font-bold sm:col-span-2"><span>{field.label}{field.required && <span className="mr-1 text-destructive">*</span>}</span><textarea required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />{field.hint && <span className="mt-2 block text-[10px] font-normal text-muted-foreground">{field.hint}</span>}</label>
  if (field.type === "select" || field.source) return <label className="text-xs font-bold"><span>{field.label}{field.required && <span className="mr-1 text-destructive">*</span>}</span><select required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"><option value="">اختر من القائمة</option>{(field.options ?? choicesFor).map(option => <option key={option.value} value={option.value} disabled={Boolean("disabled" in option && option.disabled)}>{option.label}</option>)}</select>{field.hint && <span className="mt-2 block text-[10px] font-normal text-muted-foreground">{field.hint}</span>}</label>
  return <label className="text-xs font-bold"><span>{field.label}{field.required && <span className="mr-1 text-destructive">*</span>}</span><Input required={field.required} type={field.type === "number" ? "number" : field.type === "datetime-local" ? "datetime-local" : "text"} min={field.type === "number" ? "0" : undefined} value={String(value ?? "")} onChange={event => onChange(event.target.value)} className="mt-2 h-11" />{field.hint && <span className="mt-2 block text-[10px] font-normal text-muted-foreground">{field.hint}</span>}</label>
}
