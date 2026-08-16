"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Building2, Check, ChevronLeft, Loader2, Pencil, Plus, RefreshCw, Search, Settings2, X } from "lucide-react"
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
type Field = {
  name: string
  label: string
  type?: "text" | "number" | "textarea" | "select" | "checkbox" | "multi"
  required?: boolean
  options?: Array<{ value: string; label: string }>
  source?: "activities" | "categories" | "services" | "packages" | "permissions" | "branches" | "meals"
  hint?: string
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
}

const isoNow = () => new Date().toISOString()
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
    id: "packages", label: "الباقات", description: "باقات العضوية ومدتها والخدمات المشمولة فيها.", permission: "commercial.read", managePermission: "commercial.manage", path: "/organizations/{organizationId}/packages", createPath: "/organizations/{organizationId}/packages",
    columns: [{ label: "الرمز", key: "code" }, { label: "الباقة", key: "name" }, { label: "المدة", key: "durationDays" }, { label: "حالة النشر", key: "status" }],
    createFields: [{ name: "code", label: "رمز الباقة", required: true }, { name: "name", label: "اسم الباقة", required: true }, { name: "durationDays", label: "المدة بالأيام", type: "number", required: true }, { name: "branchAccessPolicy", label: "سياسة الوصول للفروع", type: "select", options: [{ value: "SINGLE_BRANCH", label: "فرع واحد" }, { value: "SELECTED_BRANCHES", label: "فروع مختارة" }, { value: "ALL_ORGANIZATION_BRANCHES", label: "كل الفروع" }] }, { name: "branchIds", label: "الفروع المتاحة", type: "multi", source: "branches" }, { name: "serviceIds", label: "الخدمات المشمولة", type: "multi", source: "services", required: true }, { name: "visitAllowance", label: "عدد الزيارات (اختياري)", type: "number" }, { name: "description", label: "الوصف", type: "textarea" }],
    initial: { durationDays: "30", branchAccessPolicy: "SINGLE_BRANCH", fulfillmentKind: "FACILITY_ACCESS" },
    createBody: values => ({ code: values.code, name: values.name, description: values.description || undefined, durationDays: number(values.durationDays), visitAllowance: values.visitAllowance ? number(values.visitAllowance) : undefined, fulfillmentKind: "FACILITY_ACCESS", branchAccessPolicy: values.branchAccessPolicy || "SINGLE_BRANCH", branchIds: asArray(values.branchIds), entitlements: asArray(values.serviceIds).map(serviceId => ({ serviceId, visitAllowance: values.visitAllowance ? number(values.visitAllowance) : undefined })) }),
  },
  {
    id: "prices", label: "الأسعار", description: "الأسعار المعتمدة للخدمات والباقات مع الضريبة وتاريخ السريان.", permission: "commercial.read", managePermission: "pricing.manage", path: "/organizations/{organizationId}/prices", createPath: "/organizations/{organizationId}/prices",
    columns: [{ label: "الهدف", key: "targetType" }, { label: "القيمة", key: "amountMinor" }, { label: "الضريبة", key: "taxRateBps" }, { label: "ساري من", key: "validFrom" }],
    createFields: [{ name: "targetType", label: "نوع الهدف", type: "select", required: true, options: [{ value: "PACKAGE", label: "باقة" }, { value: "SERVICE", label: "خدمة" }] }, { name: "targetId", label: "الخدمة أو الباقة", type: "select", source: "packages", required: true, hint: "اختر الباقة، أو بدّل إلى الخدمات عند التسعير لخدمة." }, { name: "amount", label: "السعر بالريال", type: "number", required: true }, { name: "taxRate", label: "نسبة الضريبة %", type: "number", required: true }, { name: "taxInclusive", label: "السعر شامل الضريبة", type: "checkbox" }],
    initial: { targetType: "PACKAGE", taxRate: "15", taxInclusive: true },
    createBody: values => ({ branchId: undefined, targetType: values.targetType, targetId: values.targetId, amountMinor: String(Math.round(number(values.amount) * 100)), taxRateBps: Math.round(number(values.taxRate) * 100), taxInclusive: Boolean(values.taxInclusive), validFrom: isoNow() }),
  },
  {
    id: "roles", label: "الأدوار والصلاحيات", description: "الأدوار المخصصة وما تتيحه من صلاحيات للنظام.", permission: "iam.roles.read", managePermission: "iam.roles.manage", path: "/organizations/{organizationId}/roles", createPath: "/organizations/{organizationId}/roles", updatePath: id => `/organizations/{organizationId}/roles/${id}/permissions`,
    columns: [{ label: "الدور", key: "name" }, { label: "الوصف", key: "description" }, { label: "الصلاحيات", key: "permissions" }],
    createFields: [{ name: "name", label: "اسم الدور", required: true }, { name: "description", label: "الوصف", type: "textarea" }, { name: "permissions", label: "الصلاحيات", type: "multi", source: "permissions" }],
    editFields: [{ name: "permissions", label: "الصلاحيات", type: "multi", source: "permissions" }],
    createBody: values => ({ name: values.name, description: values.description || undefined, permissions: asArray(values.permissions) }), editBody: values => ({ permissions: asArray(values.permissions) }), updateMethod: "PUT",
  },
  {
    id: "positions", label: "المسميات الوظيفية", description: "المسميات المستخدمة عند إنشاء الموظفين وتعيينهم.", permission: "workforce.read", managePermission: "workforce.manage", path: "/organizations/{organizationId}/positions", createPath: "/organizations/{organizationId}/positions",
    columns: [{ label: "الرمز", key: "code" }, { label: "المسمى", key: "name" }], createFields: [{ name: "code", label: "رمز المسمى", required: true }, { name: "name", label: "المسمى الوظيفي", required: true }],
  },
  {
    id: "facilities", label: "المرافق", description: "القاعات والملاعب والمسابح ومناطق التدريب.", permission: "bookings.read", managePermission: "bookings.facilities.manage", path: "/organizations/{organizationId}/facilities", createPath: "/organizations/{organizationId}/facilities",
    columns: [{ label: "الرمز", key: "code" }, { label: "المرفق", key: "name" }, { label: "النوع", key: "type" }, { label: "الفرع", key: "branchId" }],
    createFields: [{ name: "code", label: "رمز المرفق", required: true }, { name: "name", label: "اسم المرفق", required: true }, { name: "type", label: "النوع", type: "select", required: true, options: [{ value: "COURT", label: "ملعب" }, { value: "ROOM", label: "غرفة" }, { value: "POOL", label: "مسبح" }, { value: "STUDIO", label: "استوديو" }, { value: "TRAINING_AREA", label: "منطقة تدريب" }] }, { name: "activityId", label: "النشاط المرتبط", type: "select", source: "activities" }],
    createBody: values => ({ ...values, branchId: undefined }),
  },
  {
    id: "meal-categories", label: "تصنيفات المطعم", description: "تصنيفات الوجبات والمنتجات في المطعم.", permission: "restaurant.catalog.read", managePermission: "restaurant.catalog.manage", path: "/organizations/{organizationId}/restaurant/meal-categories", createPath: "/organizations/{organizationId}/restaurant/meal-categories",
    columns: [{ label: "الرمز", key: "code" }, { label: "التصنيف", key: "name" }], createFields: [{ name: "code", label: "رمز التصنيف", required: true }, { name: "name", label: "اسم التصنيف", required: true }],
  },
]

function listOf(data: unknown): RecordItem[] { if (Array.isArray(data)) return data.filter((item): item is RecordItem => Boolean(item) && typeof item === "object"); if (data && typeof data === "object" && "items" in data && Array.isArray((data as { items?: unknown }).items)) return (data as { items: RecordItem[] }).items; return [] }
function itemId(item: RecordItem) { return String(item.id ?? item.roleId ?? item.activityId ?? item.branchId ?? "") }
function text(value: unknown, key?: string) { if (value === null || value === undefined || value === "") return "—"; if (key === "amountMinor") return money(value); if (key === "taxRateBps") return `${Number(value) / 100}%`; if (key === "durationDays") return `${value} يوم`; if (Array.isArray(value)) return `${value.length} صلاحية`; if (typeof value === "object") return "بيانات مرتبطة"; return String(value) }
function valueFrom(item: RecordItem, key: string): Value { const value = item[key]; if (Array.isArray(value)) return value.map(entry => typeof entry === "string" ? entry : String((entry as RecordItem).permission ?? (entry as RecordItem).id ?? "")).filter(Boolean); return typeof value === "boolean" ? value : value === null || value === undefined ? "" : String(value) }

export function MasterDataPage() {
  const context = useAppContext()
  const allowed = useMemo(() => configs.filter(config => context.canAccess([config.permission])), [context])
  const [activeId, setActiveId] = useState("branches")
  const active = allowed.find(config => config.id === activeId) ?? allowed[0]
  const [items, setItems] = useState<RecordItem[]>([])
  const [references, setReferences] = useState<Record<string, RecordItem[]>>({})
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState<{ mode: "create" | "edit"; item?: RecordItem }>()

  const load = useCallback(async () => {
    if (!active || !context.organizationId || !hasRuntimeApi()) { setItems([]); return }
    setLoading(true); setError("")
    try { const response = await apiRequest<unknown>(active.path.replace("{organizationId}", context.organizationId)); setItems(listOf(response.data)) }
    catch (reason) { setError(humanError(reason, "تعذر تحميل بيانات الإدارة.")) }
    finally { setLoading(false) }
  }, [active, context.organizationId])
  useEffect(() => { const frame = requestAnimationFrame(() => { void load() }); return () => cancelAnimationFrame(frame) }, [load])

  const filtered = items.filter(item => Object.values(item).some(value => String(value ?? "").toLowerCase().includes(query.toLowerCase())))
  if (!active) return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا تملك صلاحية الوصول إلى بيانات الإدارة.</CardContent></Card>

  return <div className="fade-up" dir="rtl">
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Badge variant="outline" className="mb-3 border-primary/30 bg-primary/10 text-amber-700">إدارة النظام</Badge><h1 className="text-2xl font-black tracking-tight sm:text-3xl">البيانات الرئيسية</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">إدارة الفروع والكتالوج والأسعار والأدوار وباقي البيانات المرجعية من مصدر واحد.</p></div><Button size="lg" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />تحديث البيانات</Button></div>
    <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]"><Card className="h-fit"><CardContent className="p-2"><p className="px-3 pb-2 pt-3 text-[10px] font-bold text-muted-foreground">مجموعات الإدارة</p><div className="space-y-1">{allowed.map(config => <button key={config.id} onClick={() => { setActiveId(config.id); setQuery("") }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right text-xs font-bold transition ${active.id === config.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}><Settings2 className="size-4" />{config.label}<ChevronLeft className="mr-auto size-3 opacity-60" /></button>)}</div></CardContent></Card>
      <Card className="overflow-hidden"><div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-amber-700"><Building2 className="size-4" /></span><div><h2 className="font-black">{active.label}</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{active.description}</p></div></div></div>{active.createFields && context.canAccess([active.managePermission]) && <Button onClick={() => setForm({ mode: "create" })}><Plus />إضافة جديد</Button>}</div><div className="border-b p-4"><div className="relative max-w-md"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} className="pr-10" placeholder={`ابحث في ${active.label}...`} /></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-right text-xs"><thead className="bg-secondary/45"><tr>{active.columns.map(column => <th key={column.key} className="px-5 py-3 text-[10px] font-bold text-muted-foreground">{column.label}</th>)}<th className="w-20 px-5" /></tr></thead><tbody className="divide-y">{filtered.map(item => <tr key={itemId(item)} className="hover:bg-secondary/30">{active.columns.map(column => <td key={column.key} className="px-5 py-4">{column.key === "status" ? <StatusBadge status={String(item[column.key] ?? "—")} /> : <span className="max-w-64 truncate font-medium">{text(item[column.key], column.key)}</span>}</td>)}<td className="px-5">{active.updatePath && active.editFields && context.canAccess([active.managePermission]) && <Button variant="ghost" size="sm" onClick={() => setForm({ mode: "edit", item })}><Pencil />تعديل</Button>}</td></tr>)}</tbody></table>{loading ? <div className="grid place-items-center p-14"><Loader2 className="size-7 animate-spin text-primary" /></div> : error ? <div className="p-10 text-center"><p className="font-bold text-destructive">تعذر عرض البيانات</p><p className="mt-2 text-xs text-muted-foreground">{error}</p><Button className="mt-4" variant="outline" onClick={() => void load()}>إعادة المحاولة</Button></div> : !filtered.length && <div className="p-14 text-center text-sm text-muted-foreground">لا توجد سجلات مطابقة.</div>}</div></Card></div>
    {form && <MasterForm config={active} mode={form.mode} item={form.item} organizationId={context.organizationId} branchId={context.branchId} references={references} setReferences={setReferences} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); void load(); void context.reload() }} />}
  </div>
}

function MasterForm({ config, mode, item, organizationId, branchId, references, setReferences, onClose, onSaved }: { config: MasterConfig; mode: "create" | "edit"; item?: RecordItem; organizationId: string; branchId: string; references: Record<string, RecordItem[]>; setReferences: React.Dispatch<React.SetStateAction<Record<string, RecordItem[]>>>; onClose: () => void; onSaved: () => void }) {
  const fields = useMemo(() => mode === "create" ? config.createFields ?? [] : config.editFields ?? [], [config, mode])
  const [values, setValues] = useState<Values>(() => Object.fromEntries(fields.map(field => [field.name, item ? valueFrom(item, field.name) : config.initial?.[field.name] ?? (field.type === "checkbox" ? false : field.type === "multi" ? [] : "")])))
  const [saving, setSaving] = useState(false); const [error, setError] = useState("")
  const requiredSources = useMemo(() => [...new Set([...fields.map(field => field.source).filter((source): source is NonNullable<Field["source"]> => Boolean(source)), ...(config.id === "prices" ? ["services" as const] : [])])], [config.id, fields])
  useEffect(() => { if (!hasRuntimeApi() || !organizationId) return; const paths: Record<NonNullable<Field["source"]>, string> = { activities: "/organizations/{organizationId}/activities", categories: "/organizations/{organizationId}/service-categories", services: "/organizations/{organizationId}/services", packages: "/organizations/{organizationId}/packages", permissions: "/organizations/{organizationId}/permissions", branches: "/organizations/{organizationId}/branches", meals: "/organizations/{organizationId}/restaurant/meals" }; void Promise.all(requiredSources.filter(source => !references[source]).map(async source => { const response = await apiRequest<unknown>(paths[source].replace("{organizationId}", organizationId)); return [source, listOf(response.data)] as const })).then(entries => setReferences(current => ({ ...current, ...Object.fromEntries(entries) }))).catch(() => undefined) }, [organizationId, references, requiredSources, setReferences])
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!organizationId) return; setSaving(true); setError(""); try { let body: Record<string, unknown>; if (mode === "create") body = config.createBody ? config.createBody(values) : Object.fromEntries(Object.entries(values).filter(([, value]) => value !== "")); else body = config.editBody ? config.editBody(values, item ?? {}) : { ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== "")), expectedVersion: Number(item?.version ?? 1) }; if (config.id === "facilities") body = { ...body, branchId }; const path = (mode === "create" ? config.createPath : config.updatePath?.(itemId(item ?? {})))?.replace("{organizationId}", organizationId); if (!path) throw new Error("مسار الحفظ غير متاح"); await apiRequest(path, { method: mode === "create" ? "POST" : config.updateMethod ?? "PATCH", body: JSON.stringify(body), idempotencyKey: mode === "create" ? createIdempotencyKey() : undefined }); onSaved() } catch (reason) { setError(humanError(reason, "تعذر حفظ التغييرات.")) } finally { setSaving(false) } }
  return <div className="fixed inset-0 z-[80] grid place-items-end bg-black/60 backdrop-blur-sm sm:place-items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" aria-labelledby="master-form-title" className="max-h-[94vh] w-full overflow-y-auto rounded-t-[28px] border bg-card shadow-2xl sm:max-w-2xl sm:rounded-[28px]"><header className="sticky top-0 z-10 flex items-start border-b bg-card/95 p-5 backdrop-blur"><div><p className="text-[11px] font-bold text-amber-700">البيانات الرئيسية</p><h2 id="master-form-title" className="mt-1 text-xl font-black">{mode === "create" ? `إضافة ${config.label}` : `تعديل ${config.label}`}</h2></div><Button className="mr-auto" variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق"><X /></Button></header><form onSubmit={submit} className="p-5 sm:p-6"><div className="grid gap-5 sm:grid-cols-2">{fields.map(field => { const source = config.id === "prices" && field.name === "targetId" ? values.targetType === "SERVICE" ? "services" : "packages" : field.source; return <MasterField key={field.name} field={field} value={values[field.name]} choices={source ? references[source] ?? [] : []} onChange={value => setValues(current => ({ ...current, [field.name]: value }))} /> })}</div>{error && <p role="alert" className="mt-5 rounded-xl bg-destructive/10 p-3 text-xs font-bold text-destructive">{error}</p>}<footer className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row"><Button type="button" variant="outline" onClick={onClose}>إلغاء</Button><Button type="submit" className="sm:mr-auto" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Check />}حفظ التغييرات</Button></footer></form></section></div>
}

type PermissionChoice = { code: string; label: string; group: string; groupOrder: number }

const permissionGroups = [
  { title: "إدارة النادي والفروع", prefixes: ["organization.", "branch.", "iam."] },
  { title: "الأعضاء والموظفون", prefixes: ["members.", "workforce.", "files."] },
  { title: "الخدمات والاشتراكات والمبيعات", prefixes: ["catalog.", "commercial.", "pricing.", "promotions.", "policies.", "subscriptions.", "sales."] },
  { title: "المالية والصندوق", prefixes: ["finance."] },
  { title: "التشغيل اليومي والحجوزات", prefixes: ["attendance.", "bookings.", "access-credentials.", "lockers."] },
  { title: "المطعم", prefixes: ["restaurant."] },
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
  const choicesFor = choices.map(choice => ({ value: itemId(choice) || String(choice.code ?? choice.permission ?? ""), label: String(choice.name ?? choice.code ?? choice.permission ?? choice.id ?? "سجل") })).filter(choice => choice.value)
  if (field.type === "checkbox") return <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-xs font-bold sm:col-span-2"><input type="checkbox" className="size-4 accent-amber-500" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} />{field.label}</label>
  if (field.source === "permissions") return <PermissionPicker field={field} value={value} choices={choices} onChange={onChange} />
  if (field.type === "multi") { const selected = asArray(value); return <fieldset className="sm:col-span-2"><legend className="text-xs font-bold">{field.label}{field.required && <span className="mr-1 text-destructive">*</span>}</legend><div className="mt-2 grid max-h-44 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">{choicesFor.length ? choicesFor.map(choice => <label key={choice.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-secondary"><input type="checkbox" className="accent-amber-500" checked={selected.includes(choice.value)} onChange={event => onChange(event.target.checked ? [...selected, choice.value] : selected.filter(id => id !== choice.value))} />{choice.label}</label>) : <p className="text-xs text-muted-foreground">لا توجد خيارات متاحة بعد.</p>}</div>{field.hint && <span className="mt-2 block text-[10px] text-muted-foreground">{field.hint}</span>}</fieldset> }
  if (field.type === "textarea") return <label className="text-xs font-bold sm:col-span-2"><span>{field.label}{field.required && <span className="mr-1 text-destructive">*</span>}</span><textarea required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" />{field.hint && <span className="mt-2 block text-[10px] font-normal text-muted-foreground">{field.hint}</span>}</label>
  if (field.type === "select" || field.source) return <label className="text-xs font-bold"><span>{field.label}{field.required && <span className="mr-1 text-destructive">*</span>}</span><select required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"><option value="">اختر من القائمة</option>{(field.options ?? choicesFor).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{field.hint && <span className="mt-2 block text-[10px] font-normal text-muted-foreground">{field.hint}</span>}</label>
  return <label className="text-xs font-bold"><span>{field.label}{field.required && <span className="mr-1 text-destructive">*</span>}</span><Input required={field.required} type={field.type === "number" ? "number" : "text"} min={field.type === "number" ? "0" : undefined} value={String(value ?? "")} onChange={event => onChange(event.target.value)} className="mt-2 h-11" />{field.hint && <span className="mt-2 block text-[10px] font-normal text-muted-foreground">{field.hint}</span>}</label>
}
