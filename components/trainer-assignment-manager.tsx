"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarRange, CheckCircle2, Dumbbell, Loader2, Plus, RefreshCw, Search, UserPlus, Users, X } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/toast-provider"
import { apiRequest } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

type Row = Record<string, unknown>
type BranchAssignment = { id: string; branchId: string; validFrom: string; validUntil?: string; status: "ACTIVE" | "ENDED" }
type Trainer = { id: string; displayName: string; status: "ACTIVE" | "INACTIVE"; assignments?: BranchAssignment[] }
type Member = { id: string; name: string; memberNumber: string; status: string }
type MemberAssignment = { id: string; memberId: string; memberName?: string; memberNumber?: string; memberStatus?: string; branchId: string; branchName?: string; validFrom: string; validUntil?: string; status: string }

export function TrainerAssignmentManager() {
  const context = useAppContext()
  const toast = useToast()
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [assignments, setAssignments] = useState<MemberAssignment[]>([])
  const [selectedTrainerId, setSelectedTrainerId] = useState("")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [error, setError] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [memberId, setMemberId] = useState("")
  const [validFrom, setValidFrom] = useState(() => localDateTime(new Date()))
  const [validUntil, setValidUntil] = useState("")

  const branch = context.branches.find(item => item.id === context.branchId)
  const selectedTrainer = trainers.find(item => item.id === selectedTrainerId)
  const isAssignedToBranch = Boolean(selectedTrainer?.assignments?.some(item => item.branchId === context.branchId && item.status === "ACTIVE" && isCurrent(item)))
  const activeAssignments = assignments.filter(item => item.status === "ACTIVE" && isCurrent(item))
  const filteredMembers = useMemo(() => members.filter(item => normalize(`${item.name} ${item.memberNumber}`).includes(normalize(query))), [members, query])

  async function load() {
    if (!context.organizationId || !context.branchId) return
    setLoading(true); setError("")
    try {
      const [trainerResponse, memberResponse] = await Promise.all([
        apiRequest<unknown>(`/organizations/${context.organizationId}/trainers?branchId=${encodeURIComponent(context.branchId)}&limit=100`),
        apiRequest<unknown>(`/organizations/${context.organizationId}/members?branchId=${context.branchId}&limit=100`),
      ])
      const nextTrainers = list(trainerResponse.data).map(trainer)
      const nextMembers = list(memberResponse.data).map(member).filter(item => item.status === "ACTIVE")
      setTrainers(nextTrainers)
      setMembers(nextMembers)
      setSelectedTrainerId(current => nextTrainers.some(item => item.id === current) ? current : nextTrainers[0]?.id ?? "")
    } catch (reason) {
      setTrainers([]); setMembers([])
      setError(humanError(reason, "تعذر تحميل المدربين والأعضاء في الفرع الحالي."))
    } finally { setLoading(false) }
  }

  async function loadAssignments(trainerId: string) {
    if (!trainerId || !context.organizationId || !context.branchId) { setAssignments([]); return }
    setAssignmentsLoading(true)
    try {
      const response = await apiRequest<unknown>(`/organizations/${context.organizationId}/trainers/${trainerId}/member-assignments?branchId=${context.branchId}&limit=100`)
      setAssignments(list(response.data).map(memberAssignment))
    } catch (reason) {
      setAssignments([])
      setError(humanError(reason, "تعذر تحميل تعيينات المدرب في الفرع الحالي."))
    } finally { setAssignmentsLoading(false) }
  }

  useEffect(() => { const frame = requestAnimationFrame(() => void load()); return () => cancelAnimationFrame(frame) }, [context.organizationId, context.branchId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const frame = requestAnimationFrame(() => void loadAssignments(selectedTrainerId)); return () => cancelAnimationFrame(frame) }, [selectedTrainerId, context.branchId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function assignTrainerToBranch() {
    if (!selectedTrainerId || !context.branchId) return
    setBusy(true)
    try {
      await apiRequest(`/organizations/${context.organizationId}/trainers/${selectedTrainerId}/branch-assignments`, { method: "POST", body: JSON.stringify({ branchId: context.branchId }) })
      toast.success(`تم تعيين ${selectedTrainer?.displayName ?? "المدرب"} إلى الفرع الحالي.`)
      await load()
    } catch (reason) { toast.error(humanError(reason, "تعذر تعيين المدرب إلى الفرع الحالي.")) } finally { setBusy(false) }
  }

  async function assignMember() {
    if (!selectedTrainerId || !memberId || !context.branchId) return
    if (validUntil && new Date(validUntil) <= new Date(validFrom)) { toast.error("تاريخ نهاية التعيين يجب أن يكون بعد تاريخ البداية."); return }
    setBusy(true)
    try {
      await apiRequest(`/organizations/${context.organizationId}/trainers/${selectedTrainerId}/member-assignments`, {
        method: "POST",
        body: JSON.stringify({ memberId, branchId: context.branchId, validFrom: new Date(validFrom).toISOString(), ...(validUntil ? { validUntil: new Date(validUntil).toISOString() } : {}) }),
      })
      const chosen = members.find(item => item.id === memberId)
      toast.success(`تم ربط ${chosen?.name ?? "العضو"} بالمدرب ${selectedTrainer?.displayName ?? "المحدد"}.`)
      setDialogOpen(false); setMemberId(""); setValidUntil("")
      await loadAssignments(selectedTrainerId)
    } catch (reason) { toast.error(humanError(reason, "تعذر ربط العضو بالمدرب.")) } finally { setBusy(false) }
  }

  return <div className="fade-up space-y-6">
    <section className="overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-l from-primary/[.14] via-card to-card p-6 sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="flex items-center gap-4"><span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><Dumbbell /></span><div><Badge variant="outline">إدارة التدريب</Badge><h1 className="mt-2 text-2xl font-black sm:text-3xl">تعيينات المدربين والمتدربين</h1><p className="mt-1 max-w-3xl text-sm leading-7 text-muted-foreground">اختر مدربًا، تأكد من تعيينه للفرع، ثم اربط به الأعضاء لفترة مفتوحة أو محددة. سيظهر العضو تلقائيًا في مساحة عمل المدرب.</p></div></div>
        <Button className="lg:mr-auto" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />تحديث البيانات</Button>
      </div>
    </section>

    {error && <p role="alert" className="rounded-2xl bg-red-500/10 p-4 font-semibold text-red-600">{error}</p>}
    {loading ? <div className="grid min-h-72 place-items-center rounded-3xl border bg-card"><Loader2 className="animate-spin text-primary" /></div> : <div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
      <Card><CardContent className="p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-black">مدربو الفرع</h2><p className="mt-1 text-xs text-muted-foreground">{branch?.nameAr ?? branch?.name ?? "الفرع الحالي"} · {trainers.length} مدرب</p></div><Badge>{activeAssignments.length} متدربون للمدرب المحدد</Badge></div><div className="mt-5 space-y-2">{trainers.map(item => { const assigned = item.assignments?.some(value => value.branchId === context.branchId && value.status === "ACTIVE" && isCurrent(value)); return <button key={item.id} onClick={() => setSelectedTrainerId(item.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-right transition ${selectedTrainerId === item.id ? "border-primary bg-primary/[.07]" : "hover:border-primary/40"}`}><span className="grid size-10 place-items-center rounded-xl bg-primary/10 font-black text-primary">{item.displayName.trim().charAt(0) || "م"}</span><div><p className="font-black">{item.displayName}</p><p className="mt-1 text-xs text-muted-foreground">{assigned ? "معيّن للفرع الحالي" : "غير معيّن للفرع الحالي"}</p></div><Badge className="mr-auto" variant={assigned ? "default" : "outline"}>{assigned ? "جاهز" : "يلزم تعيين"}</Badge></button>})}{!trainers.length && <Empty title="لا توجد ملفات مدربين متاحة" description="أنشئ ملف مدرب واربطه بموظف من إعدادات النظام، ثم عُد لإدارة التعيينات." />}</div></CardContent></Card>

      <Card><CardContent className="p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div><h2 className="text-lg font-black">{selectedTrainer?.displayName ?? "اختر مدربًا"}</h2><p className="mt-1 text-xs text-muted-foreground">الأعضاء المرتبطون بهذا المدرب داخل الفرع الحالي فقط.</p></div><div className="flex flex-wrap gap-2 sm:mr-auto">{selectedTrainer && !isAssignedToBranch && <Button onClick={() => void assignTrainerToBranch()} disabled={busy}>{busy && <Loader2 className="animate-spin" />}تعيين للفرع</Button>}<Button onClick={() => setDialogOpen(true)} disabled={!selectedTrainer || !isAssignedToBranch}><UserPlus />ربط عضو بالمدرب</Button></div></div>
        {!isAssignedToBranch && selectedTrainer && <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700">يجب تعيين المدرب إلى الفرع الحالي قبل ربط أعضاء به.</div>}
        <div className="mt-5 space-y-3">{assignmentsLoading ? <Loader2 className="mx-auto my-12 animate-spin text-primary" /> : assignments.map(item => <div key={item.id} className="rounded-2xl border p-4"><div className="flex flex-wrap items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-secondary font-black"><Users className="size-5" /></span><div><p className="font-black">{item.memberName ?? "عضو"}</p><p className="mt-1 text-xs text-muted-foreground">{item.memberNumber ?? item.memberId}</p></div><Badge className="mr-auto" variant={item.status === "ACTIVE" && isCurrent(item) ? "default" : "outline"}>{item.status === "ACTIVE" && isCurrent(item) ? "تعيين نشط" : "تعيين سابق"}</Badge></div><div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><CalendarRange className="size-4" />من {date(item.validFrom)}</span><span>إلى {item.validUntil ? date(item.validUntil) : "دون تاريخ نهاية"}</span></div></div>)}{!assignmentsLoading && selectedTrainer && !assignments.length && <Empty title="لا يوجد متدربون مرتبطون" description={isAssignedToBranch ? "ابدأ بربط عضو بالمدرب، وسيظهر فورًا في مساحة المدرب." : "عيّن المدرب للفرع أولًا، ثم أضف المتدربين."} />}</div>
      </CardContent></Card>
    </div>}

    {dialogOpen && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="ربط عضو بالمدرب"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border bg-card shadow-2xl"><div className="flex items-start gap-4 border-b p-6"><div><Badge variant="outline">تعيين جديد</Badge><h2 className="mt-2 text-2xl font-black">ربط عضو بـ {selectedTrainer?.displayName}</h2><p className="mt-2 text-sm text-muted-foreground">سيتمكن المدرب من متابعة العضو وخطته وقياساته خلال مدة التعيين.</p></div><Button className="mr-auto" size="icon" variant="ghost" onClick={() => setDialogOpen(false)} aria-label="إغلاق"><X /></Button></div><div className="space-y-5 p-6"><label className="block"><span className="mb-2 block font-bold">ابحث عن العضو</span><span className="relative block"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="الاسم أو رقم العضوية" className="pr-10" /></span></label><div className="max-h-56 space-y-2 overflow-y-auto rounded-2xl border p-2">{filteredMembers.map(item => <button key={item.id} type="button" onClick={() => setMemberId(item.id)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-right ${memberId === item.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}><span className="font-black">{item.name}</span><span className="mr-auto text-xs opacity-75">{item.memberNumber}</span>{memberId === item.id && <CheckCircle2 className="size-4" />}</button>)}{!filteredMembers.length && <p className="p-5 text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة في الفرع الحالي.</p>}</div><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block font-bold">بداية التعيين</span><Input type="datetime-local" value={validFrom} onChange={event => setValidFrom(event.target.value)} /></label><label><span className="mb-2 block font-bold">نهاية التعيين (اختياري)</span><Input type="datetime-local" value={validUntil} min={validFrom} onChange={event => setValidUntil(event.target.value)} /></label></div></div><div className="flex flex-wrap gap-2 border-t p-6"><Button onClick={() => void assignMember()} disabled={busy || !memberId}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}اعتماد التعيين</Button><Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button></div></div></div>}
  </div>
}

function Empty({ title, description }: { title: string; description: string }) { return <div className="rounded-2xl border border-dashed p-8 text-center"><Users className="mx-auto text-muted-foreground" /><p className="mt-3 font-black">{title}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div> }
function list(value: unknown): Row[] { if (Array.isArray(value)) return value as Row[]; if (value && typeof value === "object" && "items" in value && Array.isArray((value as { items?: unknown }).items)) return (value as { items: Row[] }).items; return [] }
function trainer(row: Row): Trainer { return { id: String(row.id ?? ""), displayName: String(row.displayName ?? "مدرب"), status: row.status === "INACTIVE" ? "INACTIVE" : "ACTIVE", assignments: Array.isArray(row.assignments) ? row.assignments.map(value => ({ id: String((value as Row).id ?? ""), branchId: String((value as Row).branchId ?? ""), validFrom: String((value as Row).validFrom ?? ""), ...((value as Row).validUntil ? { validUntil: String((value as Row).validUntil) } : {}), status: (value as Row).status === "ENDED" ? "ENDED" : "ACTIVE" })) : [] } }
function member(row: Row): Member { return { id: String(row.id ?? row.memberId ?? ""), name: String(row.name ?? row.memberName ?? "عضو"), memberNumber: String(row.memberNumber ?? "—"), status: String(row.status ?? "") } }
function memberAssignment(row: Row): MemberAssignment { return { id: String(row.id ?? ""), memberId: String(row.memberId ?? ""), memberName: row.memberName ? String(row.memberName) : undefined, memberNumber: row.memberNumber ? String(row.memberNumber) : undefined, memberStatus: row.memberStatus ? String(row.memberStatus) : undefined, branchId: String(row.branchId ?? ""), branchName: row.branchName ? String(row.branchName) : undefined, validFrom: String(row.validFrom ?? ""), validUntil: row.validUntil ? String(row.validUntil) : undefined, status: String(row.status ?? "") } }
function isCurrent(value: { validFrom: string; validUntil?: string; status: string }) { const now = Date.now(); const from = new Date(value.validFrom).getTime(); const until = value.validUntil ? new Date(value.validUntil).getTime() : Number.POSITIVE_INFINITY; return value.status === "ACTIVE" && from <= now && until > now }
function date(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" }).format(parsed) }
function localDateTime(value: Date) { const offset = value.getTimezoneOffset(); return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16) }
function normalize(value: string) { return value.trim().toLocaleLowerCase("ar").replace(/[أإآ]/gu, "ا").replace(/ى/gu, "ي") }
