"use client"

import { useEffect, useMemo, useState, type ComponentType } from "react"
import {
  Activity, Bot, ChevronDown, CircleAlert, Clock3, FileSearch, History,
  Loader2, MapPin, RefreshCw, Search, ShieldCheck, UserRound,
} from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { apiRequest } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

type AuditRecord = {
  id: string
  branchId?: string
  branchName?: string
  actorType: "user" | "member" | "system"
  actorId?: string
  actorName?: string
  action: string
  aggregateType: string
  aggregateId?: string
  aggregateDisplayName?: string
  aggregateReference?: string
  correlationId: string
  summary?: Record<string, unknown>
  reason?: string
  occurredAt: string
}

const aggregateTypes = [
  ["", "كل أجزاء النظام"], ["member", "الأعضاء"], ["subscription", "الاشتراكات"],
  ["employee", "الموظفون"], ["workforce-position", "المسميات الوظيفية"], ["role", "الصلاحيات"],
  ["payment", "المدفوعات"], ["invoice", "الفواتير"], ["reservation", "الحجوزات"],
  ["restaurant-order", "طلبات المطعم"], ["crm-lead", "العملاء المحتملون"], ["feedback-ticket", "الشكاوى والاقتراحات"],
] as const

const aggregateLabels: Record<string, string> = {
  member: "عضو", subscription: "اشتراك", employee: "موظف", role: "مجموعة صلاحيات",
  payment: "دفعة", invoice: "فاتورة", booking: "حجز", reservation: "حجز",
  "restaurant-order": "طلب مطعم", "role-assignment": "صلاحية إضافية",
  "workforce-position": "مسمى وظيفي", branch: "فرع", package: "باقة", service: "خدمة",
  facility: "مرفق", "bookable-resource": "مورد قابل للحجز", "crm-lead": "عميل محتمل",
  "feedback-ticket": "شكوى أو اقتراح", "cashier-shift": "وردية صندوق", "sales-order": "طلب بيع",
  attendance: "سجل حضور", notification: "إشعار", "training-plan": "خطة تدريب",
}

const exactActionLabels: Record<string, string> = {
  "subscription.expired": "انتهاء مدة اشتراك",
  "subscription.activated": "تفعيل اشتراك",
  "subscription.frozen": "تجميد اشتراك",
  "subscription.resumed": "استئناف اشتراك",
  "subscription.cancelled": "إلغاء اشتراك",
  "subscription.cancellation-requested": "طلب إلغاء اشتراك",
  "subscription.purchase-prepared": "إعداد بيع باقة",
  "subscription.purchase-fulfilled": "إتمام بيع باقة",
  "member.registered": "تسجيل عضو جديد",
  "member.updated": "تعديل بيانات عضو",
  "employee.created": "إضافة موظف جديد",
  "employee.updated": "تعديل بيانات موظف",
  "employee.deleted": "حذف موظف",
  "invoice.issued": "إصدار فاتورة",
  "invoice.paid": "سداد فاتورة",
  "payment.recorded": "تسجيل دفعة مالية",
  "reservation.created": "إنشاء حجز",
  "reservation.cancelled": "إلغاء حجز",
  "restaurant-order.created": "إنشاء طلب مطعم",
  "restaurant-order.cancelled": "إلغاء طلب مطعم",
  "cashier-shift.opened": "فتح وردية صندوق",
  "cashier-shift.closed": "إغلاق وردية صندوق",
  "feedback-ticket.created": "فتح شكوى أو اقتراح",
  "feedback-ticket.replied": "إضافة رد على شكوى أو اقتراح",
  "feedback-ticket.resolved": "حل شكوى أو اقتراح",
  "crm-lead.created": "إضافة عميل محتمل",
  "crm-lead.updated": "تحديث بيانات عميل محتمل",
}

const actionSuffixLabels: Record<string, string> = {
  created: "إنشاء سجل جديد", updated: "تعديل بيانات", deleted: "حذف سجل", revoked: "إلغاء صلاحية",
  assigned: "إسناد", activated: "تفعيل", cancelled: "إلغاء", recorded: "تسجيل عملية",
  approved: "اعتماد", rejected: "رفض", paid: "تسجيل سداد", sent: "إرسال", issued: "إصدار",
  opened: "فتح", closed: "إغلاق", resolved: "تحديد كمحلول", published: "نشر", hidden: "إخفاء",
  expired: "انتهاء المدة", uploaded: "رفع ملف", linked: "ربط حساب", unlinked: "إلغاء ربط حساب",
}

const fieldLabels: Record<string, string> = {
  name: "الاسم", status: "الحالة الجديدة", reason: "السبب", before: "القيمة السابقة", after: "القيمة الجديدة",
  permissions: "الصلاحيات", memberNumber: "رقم العضوية", employeeNumber: "الرقم الوظيفي",
  subscriptionNumber: "رقم الاشتراك", invoiceNumber: "رقم الفاتورة", termStart: "بداية الاشتراك",
  termEnd: "نهاية الاشتراك", startsAt: "تاريخ البداية", endsAt: "تاريخ النهاية", occurredAt: "وقت التنفيذ",
  effectiveAt: "تاريخ السريان", amountMinor: "المبلغ", grossMinor: "الإجمالي", paidMinor: "المبلغ المسدد",
  currency: "العملة", branchAccessPolicy: "نطاق دخول الفروع", visitsPerPeriod: "عدد الزيارات المسموحة",
  visitLimitPeriod: "فترة احتساب الزيارات", channel: "قناة الإرسال", audience: "المستلمون",
  category: "التصنيف", priority: "الأولوية", title: "العنوان", type: "النوع",
}

const valueLabels: Record<string, string> = {
  ACTIVE: "نشط", INACTIVE: "غير نشط", PENDING: "قيد المراجعة", PENDING_PAYMENT: "بانتظار السداد",
  ISSUED: "صادرة", PAID: "مسددة", PARTIALLY_PAID: "مسددة جزئيًا", CANCELLED: "ملغاة",
  EXPIRED: "منتهي", FROZEN: "مجمّد", SUSPENDED: "موقوف", APPROVED: "معتمد", REJECTED: "مرفوض",
  OPEN: "مفتوح", CLOSED: "مغلق", RESOLVED: "تم الحل", IN_PROGRESS: "قيد التنفيذ", DRAFT: "مسودة",
  PUBLISHED: "منشور", CASH: "نقدًا", CARD: "بطاقة", BANK_TRANSFER: "تحويل بنكي",
  CURRENT_BRANCH: "الفرع الحالي", ALL_BRANCHES: "كل الفروع", DAILY: "يوميًا", WEEKLY: "أسبوعيًا",
  MONTHLY: "شهريًا", SYSTEM: "داخل النظام", WHATSAPP: "واتساب", BOTH: "داخل النظام وواتساب",
  HIGH: "عالية", NORMAL: "عادية", LOW: "منخفضة", COMPLAINT: "شكوى", SUGGESTION: "اقتراح",
}

const technicalKeys = new Set([
  "id", "memberId", "employeeId", "userAccountId", "branchId", "organizationId", "packageId", "serviceId",
  "subscriptionId", "invoiceId", "orderId", "reservationId", "roleId", "version", "expectedVersion", "cashPointId",
])

export function SystemAuditLog() {
  const context = useAppContext()
  const [records, setRecords] = useState<AuditRecord[]>([])
  const [aggregateType, setAggregateType] = useState("")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  async function load() {
    if (!context.organizationId) return
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ limit: "100" })
      if (aggregateType) params.set("aggregateType", aggregateType)
      const response = await apiRequest<AuditRecord[]>(`/organizations/${context.organizationId}/audit-records?${params}`)
      setRecords(Array.isArray(response.data) ? response.data : [])
    } catch (reason) {
      setError(humanError(reason, "تعذر تحميل سجل نشاط النظام."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { const frame = requestAnimationFrame(() => void load()); return () => cancelAnimationFrame(frame) }, [context.organizationId, aggregateType]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ar")
    if (!normalized) return records
    return records.filter(record => [
      actionLabel(record.action), aggregateLabel(record.aggregateType), record.aggregateDisplayName,
      record.aggregateReference, record.actorName, record.branchName, record.reason, readableDetails(record.summary).map(item => `${item.label} ${item.value}`).join(" "),
    ].some(value => String(value ?? "").toLocaleLowerCase("ar").includes(normalized)))
  }, [query, records])

  const today = records.filter(record => isToday(record.occurredAt)).length
  const actors = new Set(records.filter(record => record.actorType !== "system").map(record => record.actorId ?? record.actorName).filter(Boolean)).size

  return <div className="fade-up space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
      <div>
        <Badge variant="outline"><ShieldCheck /> رقابة وإدارة</Badge>
        <h1 className="mt-3 text-3xl font-black">سجل نشاط النظام</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">تابع أهم التغييرات والإجراءات داخل النادي، واعرف من نفّذها وموعدها والفرع المرتبط بها.</p>
      </div>
      <Button className="lg:mr-auto" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> تحديث السجل</Button>
    </div>

    <div className="grid gap-4 sm:grid-cols-3">
      <Summary icon={History} label="العمليات المعروضة" value={records.length} />
      <Summary icon={Clock3} label="عمليات اليوم" value={today} />
      <Summary icon={Activity} label="موظفون نفّذوا عمليات" value={actors} />
    </div>

    <Card className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_280px]">
      <label className="space-y-2 text-sm font-bold"><span>ابحث داخل السجل</span><span className="flex items-center gap-2 rounded-xl border bg-background px-3"><Search className="size-4 text-muted-foreground" /><Input className="border-0 px-0 shadow-none focus-visible:ring-0" value={query} onChange={event => setQuery(event.target.value)} placeholder="اسم العضو أو الموظف، رقم السجل أو نوع العملية" /></span></label>
      <label className="space-y-2 text-sm font-bold"><span>قسم النظام</span><select className="h-10 w-full rounded-xl border bg-background px-3" value={aggregateType} onChange={event => setAggregateType(event.target.value)}>{aggregateTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </Card>

    {error && <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600">{error}</p>}
    {loading && <Card className="grid min-h-52 place-items-center"><Loader2 className="animate-spin text-primary" /></Card>}
    {!loading && !visible.length && !error && <Card className="grid min-h-52 place-items-center px-6 text-center"><div><FileSearch className="mx-auto mb-3 text-muted-foreground" /><p className="font-bold">لا توجد عمليات مطابقة</p><p className="mt-1 text-sm text-muted-foreground">غيّر القسم أو عبارة البحث لعرض نتائج أخرى.</p></div></Card>}
    {!loading && visible.length > 0 && <div className="space-y-4">{visible.map(record => <AuditRecordCard key={record.id} record={record} />)}</div>}
  </div>
}

function AuditRecordCard({ record }: { record: AuditRecord }) {
  const details = readableDetails(record.summary)
  return <Card className="overflow-hidden">
    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(260px,.9fr)_minmax(0,1.4fr)] lg:p-6">
      <section className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-primary/10 p-3 text-primary">{record.actorType === "system" ? <Bot /> : <Activity />}</span>
          <div><p className="text-lg font-black">{actionLabel(record.action)}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{actionDescription(record)}</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary"><Clock3 className="size-3.5" /> {dateTime(record.occurredAt)}</Badge>
          {record.branchName && <Badge variant="outline"><MapPin className="size-3.5" /> {record.branchName}</Badge>}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <InfoBlock icon={FileSearch} label="السجل المرتبط" value={record.aggregateDisplayName || aggregateLabel(record.aggregateType)} hint={record.aggregateReference ? `${aggregateLabel(record.aggregateType)} رقم ${record.aggregateReference}` : aggregateLabel(record.aggregateType)} />
        <InfoBlock icon={record.actorType === "system" ? Bot : UserRound} label="تم التنفيذ بواسطة" value={actorName(record)} hint={record.actorType === "system" ? "إجراء تلقائي وفق إعدادات النظام" : "مستخدم مخوّل داخل النظام"} />
      </section>
    </div>

    {(record.reason || details.length > 0) && <div className="border-t bg-secondary/20 p-5 lg:p-6">
      {record.reason && <div className="mb-4 flex gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4"><CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-500" /><div><p className="text-sm font-bold">سبب الإجراء</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{record.reason}</p></div></div>}
      {details.length > 0 && <div><p className="mb-3 text-sm font-bold">ملخص التغيير</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{details.map(item => <div key={item.key} className="rounded-2xl border bg-background/70 p-4"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-2 break-words text-sm font-bold">{item.value}</p></div>)}</div></div>}
    </div>}

    <details className="group border-t px-5 py-4 text-xs text-muted-foreground lg:px-6">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-bold"><ChevronDown className="size-4 transition-transform group-open:rotate-180" /> بيانات التتبع الفنية</summary>
      <div className="mt-3 grid gap-2 rounded-xl bg-secondary/30 p-3 sm:grid-cols-2"><span>مرجع السجل: <b className="font-mono" dir="ltr">{shortReference(record.aggregateId)}</b></span><span>رقم التتبع: <b className="font-mono" dir="ltr">{shortReference(record.correlationId)}</b></span></div>
    </details>
  </Card>
}

function Summary({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: number }) { return <Card className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div><span className="rounded-2xl bg-primary/10 p-3 text-primary"><Icon /></span></Card> }
function InfoBlock({ icon: Icon, label, value, hint }: { icon: ComponentType<{ className?: string }>; label: string; value: string; hint: string }) { return <div className="flex gap-3 rounded-2xl border bg-background/60 p-4"><Icon className="mt-0.5 size-5 shrink-0 text-primary" /><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div></div> }
function aggregateLabel(value: string) { return aggregateLabels[value] ?? "سجل بالنظام" }
function actorName(record: AuditRecord) { if (record.actorType === "system") return "النظام الآلي"; return record.actorName || (record.actorType === "member" ? "عضو بالنادي" : "موظف أو مسؤول") }
function shortReference(value?: string) { return value ? value.replaceAll("-", "").slice(0, 12).toUpperCase() : "غير متاح" }
function dateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "غير متاح" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date) }
function isToday(value: string) { const date = new Date(value); const today = new Date(); return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate() }
function actionLabel(value: string) { if (exactActionLabels[value]) return exactActionLabels[value]; const action = value.split(".").at(-1) ?? ""; return `${actionSuffixLabels[action] ?? "تنفيذ إجراء"} — ${aggregateLabel(value.split(".")[0] ?? "")}` }
function actionDescription(record: AuditRecord) {
  if (record.action === "subscription.expired") return `وصل ${record.aggregateReference ? `الاشتراك رقم ${record.aggregateReference}` : "الاشتراك"} إلى تاريخ نهايته وتم تحديث حالته تلقائيًا.`
  if (record.action === "invoice.issued") return `تم إصدار ${record.aggregateReference ? `الفاتورة رقم ${record.aggregateReference}` : "فاتورة جديدة"} وحفظها في السجل المالي.`
  if (record.aggregateDisplayName) return `تم تنفيذ الإجراء على ${aggregateLabel(record.aggregateType)} ${record.aggregateDisplayName}.`
  return `تم تنفيذ الإجراء على ${aggregateLabel(record.aggregateType)} وتسجيله للمراجعة.`
}
function readableDetails(summary?: Record<string, unknown>) {
  if (!summary) return []
  return Object.entries(summary)
    .filter(([key, value]) => fieldLabels[key] && !technicalKeys.has(key) && value !== undefined && value !== null && value !== "")
    .slice(0, 9)
    .map(([key, value]) => ({ key, label: fieldLabels[key] ?? "معلومة إضافية", value: displayValue(key, value) }))
}
function displayValue(key: string, value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.map(item => displayValue(key, item)).join("، ") : "لا يوجد"
  if (value && typeof value === "object") return "تم تحديث البيانات المرتبطة"
  if (typeof value === "boolean") return value ? "نعم" : "لا"
  const raw = String(value ?? "—")
  if (valueLabels[raw]) return valueLabels[raw]
  if (/At$|Date$|termStart|termEnd|startsAt|endsAt/u.test(key)) return dateTime(raw)
  if (/Minor$/u.test(key) && /^-?\d+$/u.test(raw)) return `${new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2 }).format(Number(raw) / 100)} ر.س.`
  return raw
}
