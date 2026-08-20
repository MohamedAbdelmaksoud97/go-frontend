"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Eye, EyeOff, FileCheck2, Loader2, Search, UploadCloud, X } from "lucide-react"
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
  const [options, setOptions] = useState<Record<string, Choice[]>>({})
  const [referenceQueries, setReferenceQueries] = useState<Record<string, string>>({})
  const [loadingOptions, setLoadingOptions] = useState(() => Boolean(hasRuntimeApi() && workflow?.fields.some(field => field.type === "reference")))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const [completionNote, setCompletionNote] = useState("")

  useEffect(() => {
    if (!workflow || !hasRuntimeApi()) return
    const referenceFields = workflow.fields.filter(field => field.type === "reference" && field.source)
    if (!referenceFields.length) return
    let cancelled = false
    const timer = window.setTimeout(() => { if (!cancelled) setLoadingOptions(true); void Promise.all(referenceFields.map(async field => {
      try {
        const path = referencePath(field.source!.path(context), field.source!.searchParam, referenceQueries[field.name])
        const response = await apiRequest<unknown>(path)
        const payload = response.data
        const list = Array.isArray(payload) ? payload : payload && typeof payload === "object" && "items" in payload ? (payload as { items: unknown[] }).items : []
        const available = field.name === "packageId" ? list.filter(item => item && typeof item === "object" && (item as Record<string, unknown>).status === "PUBLISHED") : list
        return [field.name, available.flatMap(item => toChoice(item, field.source!.labelKeys, field.source!.subtitleKeys))] as const
      } catch { return [field.name, []] as const }
    })).then(entries => { if (!cancelled) setOptions(Object.fromEntries(entries)) }).finally(() => { if (!cancelled) setLoadingOptions(false) }) }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [context, referenceQueries, workflow])

  if (!workflow) return null
  const operation = endpoints.find(item => item.operationId === operationId)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!operation || !organizationId || !branchId) { setError("اختر الفرع أولًا ثم أعد المحاولة."); return }
    const validationError = validateValues(operationId, values)
    if (validationError) { setError(validationError); return }
    setSaving(true); setError("")
    try {
      const path = operation.path.replace("{organizationId}", organizationId).replace("{branchId}", branchId)
      const response = hasRuntimeApi() ? await executeOperation<Record<string, unknown>>(path, operation.method, {}, workflow.body(values, context), operation.idempotent ? createIdempotencyKey() : undefined) : undefined
      if (operationId === "createEmployee" && response?.data.id) {
        const employeeId = String(response.data.id)
        try {
          if (values.identityImage instanceof File) await uploadEmployeeFile(organizationId, employeeId, "IDENTITY", values.identityImage)
          if (values.profileImage instanceof File) await uploadEmployeeFile(organizationId, employeeId, "PROFILE", values.profileImage)
        } catch {
          setCompletionNote("تم إنشاء الموظف وحسابه بنجاح، لكن تعذّر رفع إحدى الصور. يمكنك رفعها لاحقًا من ملفات الموظف.")
        }
      }
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
      {done ? <div className="grid place-items-center px-6 py-16 text-center"><span className="grid size-16 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><CheckCircle2 className="size-8" /></span><h3 className="mt-5 text-lg font-black">تم بنجاح</h3><p className="mt-2 max-w-md text-sm leading-7 text-muted-foreground">{completionNote || workflow.successMessage}</p><Button size="lg" className="mt-7 min-w-40" onClick={onClose}>تم</Button></div> :
      <form onSubmit={submit} className="p-5 sm:p-6">
        {workflow.confirm && <div className="mb-5 flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 text-xs leading-6"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" /><p>{workflow.confirm}</p></div>}
        <div className="grid gap-5 sm:grid-cols-2">{workflow.fields.map(field => <Field key={field.name} field={field} value={values[field.name]} choices={options[field.name]} loading={loadingOptions} referenceQuery={referenceQueries[field.name] ?? ""} onReferenceSearch={query => setReferenceQueries(current => ({ ...current, [field.name]: query }))} onChange={value => setValues(current => ({ ...current, [field.name]: value }))} />)}</div>
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-500/10 p-3 text-xs font-semibold text-red-600">{error}</p>}
        <footer className="mt-6 flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row"><Button type="button" variant="outline" size="lg" onClick={onClose}>إلغاء</Button><Button type="submit" size="lg" className="sm:mr-auto sm:min-w-40" disabled={saving || loadingOptions}>{saving && <Loader2 className="animate-spin" />}{workflow.submitLabel}</Button></footer>
      </form>}
    </section>
  </div>
}

function Field({ field, value, choices = [], loading, referenceQuery, onReferenceSearch, onChange }: { field: (typeof workflows)[string]["fields"][number]; value: string | boolean | File | undefined; choices?: Choice[]; loading: boolean; referenceQuery: string; onReferenceSearch: (value: string) => void; onChange: (value: string | boolean | File | undefined) => void }) {
  const [showPassword, setShowPassword] = useState(false)
  if (field.type === "checkbox") return <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-xs font-bold sm:col-span-2"><input type="checkbox" className="size-4 accent-amber-500" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} /><span>{field.label}</span></label>
  const className = field.type === "textarea" ? "sm:col-span-2" : ""
  return <label className={`text-xs font-bold ${className}`}><span>{field.label}{field.required && <span className="mr-1 text-red-500">*</span>}</span>
    {field.type === "file" ? <span className="mt-2 flex min-h-24 cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-background px-4 py-3 transition hover:border-primary hover:bg-primary/5"><input className="sr-only" type="file" required={field.required} accept={field.name === "profileImage" ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,application/pdf"} onChange={event => onChange(event.target.files?.[0])} /><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${value instanceof File ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"}`}>{value instanceof File ? <FileCheck2 className="size-5" /> : <UploadCloud className="size-5" />}</span><span className="min-w-0"><span className="block truncate text-sm font-bold">{value instanceof File ? value.name : "اختر ملفًا من الجهاز"}</span><span className="mt-1 block text-[10px] font-normal text-muted-foreground">{value instanceof File ? `${(value.size / 1024 / 1024).toFixed(2)} ميجابايت · اضغط للاستبدال` : "اضغط هنا للاستعراض والاختيار"}</span></span></span> : field.type === "select" || field.type === "reference" ? <div className="mt-2 space-y-2">{field.type === "reference" && field.source?.searchParam && <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input value={referenceQuery} onChange={event => onReferenceSearch(event.target.value)} className="h-10 pr-10" placeholder="ابحث في قاعدة البيانات بالاسم أو الرقم..."/></div>}<select required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15"><option value="">{loading ? "جارٍ تجهيز الخيارات..." : field.placeholder ?? "اختر من القائمة"}</option>{(field.options ?? choices).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div> : field.type === "textarea" ? <textarea required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} placeholder={field.placeholder} rows={4} className="mt-2 w-full resize-none rounded-xl border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-primary/15" /> : field.type === "password" ? <span className="relative mt-2 block"><Input className="h-11 pl-11" type={showPassword ? "text" : "password"} required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} placeholder={field.placeholder} autoComplete="new-password" dir="ltr" /><button type="button" onClick={() => setShowPassword(current => !current)} className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span> : <Input className="mt-2 h-11" type={field.type ?? "text"} min={field.min} required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)} placeholder={field.placeholder} dir={field.type === "tel" || field.type === "email" || field.type === "number" ? "ltr" : undefined} />}
    {field.hint && <span className="mt-2 block text-[10px] font-normal leading-5 text-muted-foreground">{field.hint}</span>}
  </label>
}

function validateValues(operationId: string, values: FormValues): string {
  if (operationId !== "createEmployee") return ""
  const employeeNumber = String(values.employeeNumber ?? "").trim().toUpperCase()
  const password = String(values.password ?? "")
  if (!/^EMP\d{3,10}$/u.test(employeeNumber)) return "الرقم الوظيفي يجب أن يبدأ بـ EMP ثم من 3 إلى 10 أرقام، مثل EMP001."
  if (password.length < 12) return "كلمة المرور يجب ألا تقل عن 12 حرفًا."
  if (password !== String(values.confirmPassword ?? "")) return "كلمتا المرور غير متطابقتين."
  for (const key of ["identityImage", "profileImage"] as const) {
    const file = values[key]
    if (!(file instanceof File)) continue
    if (file.size > 10 * 1024 * 1024) return `${key === "identityImage" ? "صورة الهوية" : "صورة الموظف"} تتجاوز الحد الأقصى وهو 10 ميجابايت.`
    const allowed = key === "identityImage" ? ["image/jpeg", "image/png", "application/pdf"] : ["image/jpeg", "image/png", "image/webp"]
    if (!allowed.includes(file.type)) return `صيغة ${key === "identityImage" ? "صورة الهوية" : "صورة الموظف"} غير مدعومة.`
  }
  return ""
}

function referencePath(path: string, searchParam?: string, query?: string) {
  if (!searchParam || !query?.trim()) return path
  const url = new URL(path, "http://local")
  url.searchParams.set(searchParam, query.trim())
  return `${url.pathname}${url.search}`
}

function toChoice(item: unknown, labelKeys: string[], subtitleKeys: string[] = []): Choice[] {
  if (!item || typeof item !== "object") return []
  const record = item as Record<string, unknown>
  const id = String(record.id ?? record.memberId ?? record.measurementTypeId ?? record.resourceId ?? record.packageId ?? record.invoiceId ?? record.positionId ?? "")
  if (!id) return []
  const label = labelKeys.map(key => record[key]).find(Boolean)
  const subtitle = (subtitleKeys ?? []).map(key => record[key]).find(Boolean)
  return [{ value: id, label: [label, subtitle].filter(Boolean).join(" — ") || "سجل متاح" }]
}

async function uploadEmployeeFile(organizationId: string, employeeId: string, kind: "IDENTITY" | "PROFILE", file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error("file_too_large")
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))).map(byte => byte.toString(16).padStart(2, "0")).join("")
  const request = await apiRequest<{ fileId: string; uploadUrl: string; expectedVersion: number }>(`/organizations/${organizationId}/files/upload-requests`, {
    method: "POST",
    headers: { "Idempotency-Key": createIdempotencyKey() },
    body: JSON.stringify({ ownerModule: "workforce", ownerType: "EMPLOYEE", ownerId: employeeId, purpose: kind === "IDENTITY" ? "IDENTITY_DOCUMENT" : "PROFILE_PHOTO", originalFilename: file.name, mimeType: file.type, size: file.size, checksumSha256: sha256 }),
  })
  const upload = await fetch(request.data.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file })
  if (!upload.ok) throw new Error("employee_file_upload_failed")
  await apiRequest(`/organizations/${organizationId}/files/${request.data.fileId}/upload-completions`, {
    method: "POST",
    headers: { "Idempotency-Key": createIdempotencyKey() },
    body: JSON.stringify({ expectedVersion: request.data.expectedVersion }),
  })
}
