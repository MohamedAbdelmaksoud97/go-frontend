"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight, BriefcaseBusiness, CalendarDays, Camera, Clock3, Copy, FileBadge,
  FileText, Loader2, Mail, MapPin, Phone, RefreshCw, ShieldCheck, UploadCloud, UserRound,
} from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { StatusBadge } from "@/components/status-badge"
import { useToast } from "@/components/toast-provider"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { ownerFileValidationError, uploadOwnerFile, type OwnerFileKind } from "@/lib/owner-file-upload"
import { cn } from "@/lib/utils"

type Row = Record<string, unknown>
type ProfileData = {
  employee?: Row
  accounts: Row[]
  files: Row[]
  shifts: Row[]
  attendance: Row[]
  fileUrls: Record<string, string>
  sectionErrors: Record<string, string>
}

const emptyData: ProfileData = { accounts: [], files: [], shifts: [], attendance: [], fileUrls: {}, sectionErrors: {} }

export function EmployeeProfilePage({ employeeId }: { employeeId: string }) {
  const context = useAppContext()
  const toast = useToast()
  const [data, setData] = useState<ProfileData>(emptyData)
  const [loading, setLoading] = useState(hasRuntimeApi())
  const [fatalError, setFatalError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)
  const [uploading, setUploading] = useState<OwnerFileKind>()
  const organizationId = context.organizationId
  const branchIds = useMemo(() => [...new Set(context.branches.map(branch => branch.id).filter(Boolean))], [context.branches])
  const canReadFiles = context.canAccess(["files.read"])
  const canUploadFiles = context.canAccess(["files.manage"]) && context.canAccess(["workforce.manage"])
  const canReadAccounts = context.canAccess(["iam.accounts.read"])
  const canReadOperations = context.canAccess(["workforce.shifts.read"])

  useEffect(() => {
    if (context.loading || !organizationId || !employeeId || !hasRuntimeApi()) return
    let cancelled = false

    async function optional(key: string, operation: () => Promise<Row[]>) {
      try { return { key, rows: await operation() } }
      catch (reason) { return { key, rows: [] as Row[], error: humanError(reason, "تعذر تحميل هذا الجزء من ملف الموظف.") } }
    }

    async function acrossBranches(path: (branchId: string) => string) {
      const ids = branchIds.length ? branchIds : context.branchId ? [context.branchId] : []
      const settled = await Promise.allSettled(ids.map(branchId => apiRequest<Row[] | { items: Row[] }>(path(branchId))))
      const success = settled.filter((item): item is PromiseFulfilledResult<{ data: Row[] | { items: Row[] } }> => item.status === "fulfilled")
      if (!success.length && settled.length) throw (settled[0] as PromiseRejectedResult).reason
      return unique(success.flatMap(item => rows(item.value.data)))
    }

    async function load() {
      setLoading(true); setFatalError("")
      try {
        const employee = await apiRequest<Row>(`/organizations/${organizationId}/employees/${employeeId}`)
        const end = new Date()
        const start = new Date(end); start.setFullYear(start.getFullYear() - 1)
        const jobs: Promise<{ key: string; rows: Row[]; error?: string }>[] = []
        if (canReadAccounts) jobs.push(optional("accounts", async () => rows((await apiRequest<Row[] | { items: Row[] }>(`/organizations/${organizationId}/user-accounts?ownerType=EMPLOYEE&ownerId=${employeeId}&limit=100`)).data)))
        if (canReadFiles) jobs.push(optional("files", () => acrossBranches(branchId => `/organizations/${organizationId}/files?branchId=${branchId}&ownerType=EMPLOYEE&ownerId=${employeeId}&limit=100`)))
        if (canReadOperations) {
          const range = `from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}&employeeId=${employeeId}`
          jobs.push(optional("shifts", () => acrossBranches(branchId => `/organizations/${organizationId}/employee-shifts?branchId=${branchId}&${range}`)))
          jobs.push(optional("attendance", () => acrossBranches(branchId => `/organizations/${organizationId}/employee-attendance?branchId=${branchId}&${range}`)))
        }
        const results = await Promise.all(jobs)
        const next: ProfileData = { ...emptyData, employee: employee.data, sectionErrors: {} }
        for (const result of results) {
          if (result.error) next.sectionErrors[result.key] = result.error
          if (result.key === "accounts") next.accounts = result.rows
          if (result.key === "files") next.files = newest(result.rows, "createdAt")
          if (result.key === "shifts") next.shifts = newest(result.rows, "startsAt")
          if (result.key === "attendance") next.attendance = newest(result.rows, "occurredAt")
        }
        const visibleFiles = next.files.filter(file => text(file.uploadStatus) === "UPLOADED" && text(file.scanStatus) === "CLEAN")
        const urls = await Promise.allSettled(visibleFiles.slice(0, 20).map(async file => {
          const result = await apiRequest<{ downloadUrl?: string }>(`/organizations/${organizationId}/files/${text(file.id)}/download-url`)
          return [text(file.id), result.data.downloadUrl ?? ""] as const
        }))
        next.fileUrls = Object.fromEntries(urls.filter((item): item is PromiseFulfilledResult<readonly [string, string]> => item.status === "fulfilled").map(item => item.value).filter(([, url]) => url))
        if (!cancelled) setData(next)
      } catch (reason) {
        if (!cancelled) setFatalError(humanError(reason, "تعذر فتح ملف الموظف. تأكد أن الموظف تابع لسياق العمل المسموح لك."))
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [branchIds, canReadAccounts, canReadFiles, canReadOperations, context.branchId, context.loading, employeeId, organizationId, reloadKey])

  async function upload(kind: OwnerFileKind, file?: File) {
    if (!file || !organizationId) return
    const label = kind === "IDENTITY" ? "مستند الهوية" : "صورة الموظف"
    const validation = await ownerFileValidationError(file, kind, label)
    if (validation) { toast.error(validation); return }
    setUploading(kind)
    try {
      await uploadOwnerFile(organizationId, employeeId, { module: "workforce", type: "EMPLOYEE" }, kind, file)
      toast.success(`تم رفع ${label} وربطه بملف الموظف بنجاح.`)
      setReloadKey(value => value + 1)
    } catch (reason) { toast.error(humanError(reason, `تعذر رفع ${label} وربطه بملف الموظف.`)) }
    finally { setUploading(undefined) }
  }

  if (context.loading || loading) return <div className="grid min-h-[55vh] place-items-center"><Loader2 className="size-9 animate-spin text-primary"/></div>
  if (!context.canAccess(["workforce.read"])) return <Message title="لا تملك صلاحية عرض ملفات الموظفين" detail="اطلب صلاحية عرض القوى العاملة ثم حاول مجددًا."/>
  if (fatalError || !data.employee) return <Message title="تعذر فتح ملف الموظف" detail={fatalError || "لم يعد سجل الموظف متاحًا."} retry={() => setReloadKey(value => value + 1)}/>

  const employee = data.employee
  const assignments = Array.isArray(employee.assignments) ? employee.assignments.filter(isRow) : []
  const currentAssignment = assignments.find(item => text(item.status) === "ACTIVE") ?? assignments[0]
  const profilePhoto = data.files.find(file => text(file.purpose) === "PROFILE_PHOTO" && data.fileUrls[text(file.id)])
  const identity = data.files.find(file => text(file.purpose) === "IDENTITY_DOCUMENT")
  const photoUrl = profilePhoto ? data.fileUrls[text(profilePhoto.id)] : ""

  return <div className="mx-auto max-w-7xl space-y-6 fade-up" dir="rtl">
    <Link href="/staff" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-primary"><ArrowRight className="size-4"/>العودة إلى قائمة الموظفين</Link>
    <Card className="overflow-hidden border-primary/25">
      <div className="bg-gradient-to-l from-primary/15 via-primary/[.06] to-transparent p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <EmployeeAvatar name={text(employee.name, "موظف")} url={photoUrl}/>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black sm:text-3xl">{text(employee.name, "موظف")}</h1><StatusBadge status={text(employee.status, "ACTIVE")}/></div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-2" dir="ltr">الرقم الوظيفي: <strong className="text-foreground">{text(employee.employeeNumber)}</strong><button type="button" className="rounded-md p-1 transition hover:bg-secondary hover:text-primary" aria-label="نسخ الرقم الوظيفي" title="نسخ الرقم الوظيفي" onClick={() => void navigator.clipboard.writeText(text(employee.employeeNumber)).then(() => toast.success("تم نسخ الرقم الوظيفي.")).catch(() => toast.error("تعذر نسخ الرقم الوظيفي تلقائيًا."))}><Copy className="size-3.5"/></button></span>{currentAssignment && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5"/>{branchName(text(currentAssignment.branchId), context.branches)}</span>}</div>
          </div>
          <Button variant="outline" onClick={() => setReloadKey(value => value + 1)}><RefreshCw/>تحديث الملف</Button>
        </div>
      </div>
      <div className="grid gap-px border-t bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="التعيينات" value={String(assignments.length)} icon={BriefcaseBusiness}/>
        <Metric label="المناوبات خلال عام" value={String(data.shifts.length)} icon={CalendarDays}/>
        <Metric label="حركات الحضور خلال عام" value={String(data.attendance.length)} icon={Clock3}/>
        <Metric label="الملفات المرتبطة" value={String(data.files.length)} icon={FileBadge}/>
      </div>
    </Card>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="size-5 text-primary"/>البيانات الشخصية والوظيفية</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        <Info label="الاسم الكامل" value={text(employee.name)}/><Info label="الرقم الوظيفي" value={text(employee.employeeNumber)}/><Info label="تاريخ التوظيف" value={date(text(employee.hireDate))}/><Info label="الحالة" value={statusLabel(text(employee.status))}/><Info label="رقم الجوال" value={text(employee.phoneE164, "غير مسجل")} icon={Phone}/><Info label="البريد الإلكتروني" value={text(employee.email, "غير مسجل")} icon={Mail}/>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary"/>حساب الدخول</CardTitle></CardHeader><CardContent>{data.sectionErrors.accounts ? <ErrorLine value={data.sectionErrors.accounts}/> : data.accounts.length ? <div className="space-y-3">{data.accounts.map((account, index) => { const linked = Boolean(account.hasLoginAccount); return <div key={text(account.id, String(index))} className="rounded-2xl bg-secondary/55 p-4"><div className="flex items-center justify-between gap-3"><strong dir="ltr">{linked ? text(account.loginIdentifier, text(account.email, text(account.employeeNumber))) : "لا يوجد حساب دخول مرتبط"}</strong><StatusBadge status={linked ? text(account.status, "ACTIVE") : "NOT_LINKED"}/></div><p className="mt-2 text-xs text-muted-foreground">{linked ? "الحساب مرتبط بملف الموظف وقابل للإدارة من إعدادات الحسابات." : "يمكن إنشاء حساب الدخول من الإجراءات السريعة لهذا الموظف."}</p></div> })}</div> : <Empty text="لا يوجد حساب دخول مرتبط بهذا الموظف."/>}</CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="size-5 text-primary"/>سجل التعيينات والفروع</CardTitle></CardHeader><CardContent>{assignments.length ? <div className="grid gap-3 md:grid-cols-2">{assignments.map((assignment, index) => <div key={text(assignment.id, String(index))} className="rounded-2xl border p-4"><div className="flex items-center justify-between gap-3"><strong>{text(assignment.positionName, "مسمى وظيفي")}</strong><StatusBadge status={text(assignment.status)}/></div><p className="mt-2 text-sm text-muted-foreground">{branchName(text(assignment.branchId), context.branches)}</p><p className="mt-2 text-xs text-muted-foreground">من {dateTime(text(assignment.validFrom))}{assignment.validUntil ? ` إلى ${dateTime(text(assignment.validUntil))}` : " حتى الآن"}</p></div>)}</div> : <Empty text="لا توجد تعيينات وظيفية ظاهرة في نطاق صلاحيتك."/>}</CardContent></Card>

    <Card><CardHeader><div className="flex flex-wrap items-center gap-3"><CardTitle className="flex items-center gap-2"><FileBadge className="size-5 text-primary"/>ملفات الموظف</CardTitle>{canUploadFiles && <div className="mr-auto flex flex-wrap gap-2"><UploadButton label="رفع مستند هوية" kind="IDENTITY" accept="image/jpeg,image/png,application/pdf" busy={uploading === "IDENTITY"} onFile={file => void upload("IDENTITY", file)}/><UploadButton label="رفع صورة الموظف" kind="PROFILE" accept="image/jpeg,image/png" busy={uploading === "PROFILE"} onFile={file => void upload("PROFILE", file)}/></div>}</div></CardHeader><CardContent>
      {data.sectionErrors.files ? <ErrorLine value={data.sectionErrors.files}/> : data.files.length ? <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{data.files.map(file => { const url = data.fileUrls[text(file.id)]; return <div key={text(file.id)} className="rounded-2xl border p-4"><div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">{text(file.purpose) === "PROFILE_PHOTO" ? <Camera className="size-5"/> : <FileText className="size-5"/>}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{text(file.originalFilename, fileLabel(text(file.purpose)))}</p><p className="mt-1 text-xs text-muted-foreground">{fileLabel(text(file.purpose))} · {fileState(file)}</p></div></div>{url && <a href={url} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3 w-full")}>فتح الملف</a>}</div> })}</div> : <Empty text="لا توجد ملفات مرتبطة بملف الموظف بعد."/>}
      {identity && <p className="mt-4 text-xs text-muted-foreground">مستند الهوية الحالي: {text(identity.originalFilename, "مستند هوية")}</p>}
    </CardContent></Card>

    {canReadOperations && <div className="grid gap-6 lg:grid-cols-2"><OperationalCard title="آخر المناوبات خلال عام" rows={data.shifts} error={data.sectionErrors.shifts} dateKey="startsAt"/><OperationalCard title="آخر حركات الحضور خلال عام" rows={data.attendance} error={data.sectionErrors.attendance} dateKey="occurredAt"/></div>}
  </div>
}

function EmployeeAvatar({ name, url }: { name: string; url: string }) { return <div className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-3xl border-2 border-primary/40 bg-primary/10 text-3xl font-black text-primary">{url ? <Image src={url} alt={`صورة ${name}`} fill sizes="96px" unoptimized className="object-cover"/> : name.trim().charAt(0) || "م"}</div> }
function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof UserRound }) { return <div className="flex items-center gap-3 bg-card p-5"><span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5"/></span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div></div> }
function Info({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof UserRound }) { return <div className="rounded-2xl bg-secondary/55 p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground">{Icon && <Icon className="size-3.5"/>}{label}</p><p className="mt-2 break-words text-sm font-bold" dir={value.startsWith("+") ? "ltr" : undefined}>{value}</p></div> }
function Empty({ text: value }: { text: string }) { return <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{value}</div> }
function ErrorLine({ value }: { value: string }) { return <p role="alert" className="rounded-2xl bg-red-500/10 p-4 text-sm font-semibold text-red-600">{value}</p> }
function UploadButton({ label, kind, accept, busy, onFile }: { label: string; kind: string; accept: string; busy: boolean; onFile: (file?: File) => void }) { return <label className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer", busy && "pointer-events-none opacity-60")}><UploadCloud/>{busy ? "جارٍ الرفع…" : label}<input type="file" className="sr-only" accept={accept} aria-label={label} data-kind={kind} disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; onFile(file) }}/></label> }
function OperationalCard({ title, rows: values, error, dateKey }: { title: string; rows: Row[]; error?: string; dateKey: string }) { return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{error ? <ErrorLine value={error}/> : values.length ? <div className="space-y-2">{values.slice(0, 12).map((row, index) => <div key={text(row.id, String(index))} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/55 p-3 text-xs"><strong>{statusLabel(text(row.eventType, text(row.status, "سجل")))}</strong><span className="text-muted-foreground">{dateTime(text(row[dateKey]))}</span></div>)}</div> : <Empty text="لا توجد سجلات خلال الفترة المعروضة."/>}</CardContent></Card> }
function rows(value: Row[] | { items: Row[] }): Row[] { return Array.isArray(value) ? value.filter(isRow) : Array.isArray(value.items) ? value.items.filter(isRow) : [] }
function unique(values: Row[]): Row[] { const seen = new Set<string>(); return values.filter((value, index) => { const id = text(value.id, String(index)); if (seen.has(id)) return false; seen.add(id); return true }) }
function newest(values: Row[], key: string) { return [...values].sort((a, b) => new Date(text(b[key])).getTime() - new Date(text(a[key])).getTime()) }
function text(value: unknown, fallback = ""): string { return typeof value === "string" && value.trim() ? value : typeof value === "number" ? String(value) : fallback }
function isRow(value: unknown): value is Row { return typeof value === "object" && value !== null && !Array.isArray(value) }
function branchName(id: string, branches: { id: string; nameAr?: string; name?: string }[]) { const branch = branches.find(item => item.id === id); return branch?.nameAr ?? branch?.name ?? (id ? `فرع ${id.slice(0, 8)}` : "غير محدد") }
function date(value: string) { if (!value) return "غير مسجل"; const parsed = new Date(value.length === 10 ? `${value}T12:00:00Z` : value); return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(parsed) }
function dateTime(value: string) { if (!value) return "غير مسجل"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(parsed) }
function statusLabel(value: string) { return ({ ACTIVE: "نشط", INACTIVE: "غير نشط", ENDED: "منتهي", LINKED: "مرتبط", CLOCK_IN: "تسجيل حضور", CLOCK_OUT: "تسجيل انصراف", SCHEDULED: "مجدولة", IN_PROGRESS: "جارية", COMPLETED: "مكتملة", CANCELLED: "ملغاة" } as Record<string, string>)[value] ?? value }
function fileLabel(value: string) { return value === "PROFILE_PHOTO" ? "صورة الموظف" : value === "IDENTITY_DOCUMENT" ? "مستند الهوية" : "مستند وظيفي" }
function fileState(file: Row) { if (text(file.uploadStatus) !== "UPLOADED") return "بانتظار اكتمال الرفع"; if (text(file.scanStatus) === "CLEAN") return "جاهز"; if (text(file.scanStatus) === "REJECTED") return "مرفوض"; return "قيد الفحص" }
function Message({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) { return <div className="grid min-h-[55vh] place-items-center text-center" dir="rtl"><div><UserRound className="mx-auto size-12 text-muted-foreground"/><h1 className="mt-4 text-xl font-black">{title}</h1><p className="mt-2 max-w-xl text-sm text-muted-foreground">{detail}</p>{retry && <Button className="mt-5" onClick={retry}><RefreshCw/>إعادة المحاولة</Button>}</div></div> }
