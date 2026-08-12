"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, Search, X } from "lucide-react"
import { endpoints } from "@/lib/endpoint-catalog"
import { apiRequest, createIdempotencyKey, executeOperation, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { type Choice, type FormValues, workflows } from "@/lib/workflows"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Props = { operationId: string; organizationId: string; branchId: string; onClose: () => void; onSaved?: () => void }

export function ActionDialog({ operationId, organizationId, branchId, onClose, onSaved }: Props) {
  const workflow = workflows[operationId]
  const context = useMemo(() => ({ organizationId, branchId }), [organizationId, branchId])
  const [values, setValues] = useState<FormValues>(() => workflow?.initial(context) ?? {})
  const [options, setOptions] = useState<Record<string, Choice[]>>(() => hasRuntimeApi() || !workflow ? {} : Object.fromEntries(workflow.fields.filter(field => field.type === "reference").map(field => [field.name, demoChoices(field.name)])))
  const [loadingOptions, setLoadingOptions] = useState(() => Boolean(hasRuntimeApi() && workflow?.fields.some(field => field.type === "reference")))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!workflow || !hasRuntimeApi()) return
    const referenceFields = workflow.fields.filter(field => field.type === "reference" && field.source)
    if (!referenceFields.length) return
    let cancelled = false
    Promise.all(referenceFields.map(async field => {
      try {
        const response = await apiRequest<unknown>(field.source!.path(context))
        const payload = response.data
        const list = Array.isArray(payload) ? payload : payload && typeof payload === "object" && "items" in payload ? (payload as { items: unknown[] }).items : []
        return [field.name, list.flatMap(item => toChoice(item, field.source!.labelKeys, field.source!.subtitleKeys))] as const
      } catch { return [field.name, []] as const }
    })).then(entries => { if (!cancelled) setOptions(Object.fromEntries(entries)) }).finally(() => { if (!cancelled) setLoadingOptions(false) })
    return () => { cancelled = true }
  }, [context, workflow])

  if (!workflow) return null
  const operation = endpoints.find(item => item.operationId === operationId)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!operation || !organizationId || !branchId) { setError("اختر الفرع أولًا ثم أعد المحاولة."); return }
    setSaving(true); setError("")
    try {
      const path = operation.path.replace("{organizationId}", organizationId).replace("{branchId}", branchId)
      if (hasRuntimeApi()) await executeOperation(path, operation.method, {}, workflow.body(values, context), operation.idempotent ? createIdempotencyKey() : undefined)
      setDone(true); onSaved?.()
    } catch (reason) { setError(humanError(reason)) }
    finally { setSaving(false) }
  }

  return <div className="fixed inset-0 z-[80] grid place-items-end bg-black/65 p-0 backdrop-blur-sm sm:place-items-center sm:p-5" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section dir="rtl" role="dialog" aria-modal="true" aria-labelledby="action-title" className="max-h-[94vh] w-full overflow-y-auto rounded-t-[28px] border bg-card shadow-2xl sm:max-w-2xl sm:rounded-[28px]">
      <header className="sticky top-0 z-10 flex items-start gap-4 border-b bg-card/95 p-5 backdrop-blur sm:p-6">
        <div className="min-w-0"><p className="text-[11px] font-bold text-amber-600 dark:text-primary">إجراء جديد</p><h2 id="action-title" className="mt-1 text-xl font-black">{workflow.title}</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">{workflow.description}</p></div>
        <Button variant="ghost" size="icon" className="mr-auto" onClick={onClose} aria-label="إغلاق"><X /></Button>
      </header>
      {done ? <div className="grid place-items-center px-6 py-16 text-center"><span className="grid size-16 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><CheckCircle2 className="size-8" /></span><h3 className="mt-5 text-lg font-black">تم بنجاح</h3><p className="mt-2 max-w-md text-sm leading-7 text-muted-foreground">{workflow.successMessage}</p><Button size="lg" className="mt-7 min-w-40" onClick={onClose}>تم</Button></div> :
      <form onSubmit={submit} className="p-5 sm:p-6">
        {workflow.confirm && <div className="mb-5 flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 text-xs leading-6"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" /><p>{workflow.confirm}</p></div>}
        <div className="grid gap-5 sm:grid-cols-2">{workflow.fields.map(field => <Field key={field.name} field={field} value={values[field.name]} choices={options[field.name]} loading={loadingOptions} onChange={value => setValues(current => ({ ...current, [field.name]: value }))} />)}</div>
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-500/10 p-3 text-xs font-semibold text-red-600">{error}</p>}
        <footer className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row"><Button type="button" variant="outline" size="lg" onClick={onClose}>إلغاء</Button><Button type="submit" size="lg" className="sm:mr-auto sm:min-w-40" disabled={saving || loadingOptions}>{saving && <Loader2 className="animate-spin" />}{workflow.submitLabel}</Button></footer>
      </form>}
    </section>
  </div>
}

function Field({ field, value, choices = [], loading, onChange }: { field: (typeof workflows)[string]["fields"][number]; value: string | boolean | undefined; choices?: Choice[]; loading: boolean; onChange: (value: string | boolean) => void }) {
  if (field.type === "checkbox") return <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-xs font-bold sm:col-span-2"><input type="checkbox" className="size-4 accent-amber-500" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} /><span>{field.label}</span></label>
  const className = field.type === "textarea" ? "sm:col-span-2" : ""
  return <label className={`text-xs font-bold ${className}`}><span>{field.label}{field.required && <span className="mr-1 text-red-500">*</span>}</span>
    {field.type === "select" || field.type === "reference" ? <div className="relative mt-2">{field.type === "reference" && <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />}<select required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} className={`h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15 ${field.type === "reference" ? "pr-10" : ""}`}><option value="">{loading ? "جارٍ تجهيز الخيارات..." : field.placeholder ?? "اختر من القائمة"}</option>{(field.options ?? choices).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div> : field.type === "textarea" ? <textarea required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} placeholder={field.placeholder} rows={4} className="mt-2 w-full resize-none rounded-xl border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" /> : <Input className="mt-2 h-11" type={field.type ?? "text"} min={field.min} required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} placeholder={field.placeholder} dir={field.type === "tel" || field.type === "email" || field.type === "number" ? "ltr" : undefined} />}
    {field.hint && <span className="mt-2 block text-[10px] font-normal leading-5 text-muted-foreground">{field.hint}</span>}
  </label>
}

function toChoice(item: unknown, labelKeys: string[], subtitleKeys: string[] = []): Choice[] {
  if (!item || typeof item !== "object") return []
  const record = item as Record<string, unknown>
  const id = String(record.id ?? record.memberId ?? record.resourceId ?? record.packageId ?? record.invoiceId ?? record.positionId ?? "")
  if (!id) return []
  const label = labelKeys.map(key => record[key]).find(Boolean)
  const subtitle = (subtitleKeys ?? []).map(key => record[key]).find(Boolean)
  return [{ value: id, label: [label, subtitle].filter(Boolean).join(" — ") || "سجل متاح" }]
}

function demoChoices(fieldName:string):Choice[]{
 const choices:Record<string,Choice[]>={
  memberId:[{value:"demo-member-1",label:"أحمد محمد — GF-2841"},{value:"demo-member-2",label:"نورة القحطاني — GF-1932"}],
  packageId:[{value:"demo-package-1",label:"باقة اللياقة — 3 أشهر"},{value:"demo-package-2",label:"الباقة الشاملة — سنة"}],
  resourceId:[{value:"demo-resource-1",label:"حصة كروس فت — القاعة الرئيسية"},{value:"demo-resource-2",label:"ملعب البادل 1"}],
  invoiceId:[{value:"demo-invoice-1",label:"فاتورة 10482 — أحمد محمد"},{value:"demo-invoice-2",label:"فاتورة 10479 — نورة القحطاني"}],
  mealId:[{value:"demo-meal-1",label:"وجبة الدجاج المشوي"},{value:"demo-meal-2",label:"مشروب البروتين"}],
  positionId:[{value:"demo-position-1",label:"موظف استقبال"},{value:"demo-position-2",label:"مدرب لياقة"}],
 }
 return choices[fieldName]??[]
}
