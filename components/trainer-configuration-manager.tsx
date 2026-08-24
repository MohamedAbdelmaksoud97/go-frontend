"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarClock, Loader2, Plus, RefreshCw, UserRoundCog } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { useToast } from "@/components/toast-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { apiRequest } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

type Row = Record<string, unknown>
type Specialty = { id: string; code: string; name: string }
type Employee = { id: string; name: string; employeeNumber: string }
type Trainer = { id: string; employeeId?: string; displayName: string; assignments: { branchId: string; status: string; validFrom: string; validUntil?: string }[] }
type Availability = { id: string; dayOfWeek: number; startLocal: string; endLocal: string; validFrom: string; validUntil?: string }

const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]

export function TrainerConfigurationManager() {
  const context = useAppContext()
  const toast = useToast()
  const canManageProfiles = context.canAccess(["coaching.manage"])
  const canManageSchedule = context.canAccess(["coaching.schedule.manage"])
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [availability, setAvailability] = useState<Availability[]>([])
  const [trainerId, setTrainerId] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [specialtyForm, setSpecialtyForm] = useState({ code: "", name: "" })
  const [trainerForm, setTrainerForm] = useState({ employeeId: "", displayName: "", publicBio: "", specialtyIds: [] as string[] })
  const [scheduleForm, setScheduleForm] = useState({ dayOfWeek: "0", startLocal: "09:00", endLocal: "17:00", validFrom: localDate(), validUntil: "" })

  const branchTrainers = useMemo(() => trainers.filter(item => item.assignments.some(assignment => assignment.branchId === context.branchId && current(assignment))), [trainers, context.branchId])
  const selectedTrainer = branchTrainers.find(item => item.id === trainerId)
  const availableEmployees = employees.filter(employee => !trainers.some(trainer => trainer.employeeId === employee.id))

  async function load() {
    if (!context.organizationId || !context.branchId) return
    setLoading(true); setError("")
    try {
      const base = `/organizations/${context.organizationId}`
      const [specialtyResponse, trainerResponse, employeeResponse] = await Promise.all([
        apiRequest<unknown>(`${base}/coaching-specialties`),
        apiRequest<unknown>(`${base}/trainers?limit=100`),
        canManageProfiles ? apiRequest<unknown>(`${base}/employees?branchId=${context.branchId}&limit=100`) : Promise.resolve({ data: [] }),
      ])
      const nextTrainers = list(trainerResponse.data).map(mapTrainer)
      setSpecialties(list(specialtyResponse.data).map(mapSpecialty))
      setEmployees(list(employeeResponse.data).map(mapEmployee).filter(item => item.id))
      setTrainers(nextTrainers)
      const nextBranch = nextTrainers.filter(item => item.assignments.some(assignment => assignment.branchId === context.branchId && current(assignment)))
      setTrainerId(value => nextBranch.some(item => item.id === value) ? value : nextBranch[0]?.id ?? "")
    } catch (reason) { setError(humanError(reason, "تعذر تحميل إعدادات المدربين.")) }
    finally { setLoading(false) }
  }

  async function loadAvailability(id: string) {
    if (!id || !context.branchId) { setAvailability([]); return }
    try {
      const response = await apiRequest<unknown>(`/organizations/${context.organizationId}/trainers/${id}/availability-rules?branchId=${context.branchId}`)
      setAvailability(list(response.data).map(mapAvailability))
    } catch (reason) { setAvailability([]); setError(humanError(reason, "تعذر تحميل أوقات إتاحة المدرب.")) }
  }

  useEffect(() => { const frame = requestAnimationFrame(() => void load()); return () => cancelAnimationFrame(frame) }, [context.organizationId, context.branchId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!canManageSchedule) return; const frame = requestAnimationFrame(() => void loadAvailability(trainerId)); return () => cancelAnimationFrame(frame) }, [trainerId, context.branchId, canManageSchedule]) // eslint-disable-line react-hooks/exhaustive-deps

  async function createSpecialty() {
    if (!specialtyForm.code.trim() || !specialtyForm.name.trim()) return
    setBusy(true)
    try {
      await apiRequest(`/organizations/${context.organizationId}/coaching-specialties`, { method: "POST", body: JSON.stringify({ code: specialtyForm.code.trim(), name: specialtyForm.name.trim() }) })
      toast.success("تمت إضافة تخصص المدرب."); setSpecialtyForm({ code: "", name: "" }); await load()
    } catch (reason) { toast.error(humanError(reason, "تعذر إضافة التخصص.")) } finally { setBusy(false) }
  }

  async function createTrainer() {
    if (!trainerForm.employeeId || !trainerForm.displayName.trim()) return
    setBusy(true)
    try {
      await apiRequest(`/organizations/${context.organizationId}/trainers`, { method: "POST", body: JSON.stringify({ employeeId: trainerForm.employeeId, displayName: trainerForm.displayName.trim(), specialtyIds: trainerForm.specialtyIds, ...(trainerForm.publicBio.trim() ? { publicBio: trainerForm.publicBio.trim() } : {}) }) })
      toast.success("تم إنشاء ملف المدرب وربطه بالموظف."); setTrainerForm({ employeeId: "", displayName: "", publicBio: "", specialtyIds: [] }); await load()
    } catch (reason) { toast.error(humanError(reason, "تعذر إنشاء ملف المدرب.")) } finally { setBusy(false) }
  }

  async function addAvailability() {
    if (!trainerId || !context.branchId) return
    if (scheduleForm.endLocal <= scheduleForm.startLocal) { toast.error("وقت النهاية يجب أن يكون بعد وقت البداية."); return }
    setBusy(true)
    try {
      await apiRequest(`/organizations/${context.organizationId}/trainers/${trainerId}/availability-rules`, { method: "POST", body: JSON.stringify({ branchId: context.branchId, dayOfWeek: Number(scheduleForm.dayOfWeek), startLocal: scheduleForm.startLocal, endLocal: scheduleForm.endLocal, validFrom: scheduleForm.validFrom, ...(scheduleForm.validUntil ? { validUntil: scheduleForm.validUntil } : {}) }) })
      toast.success("تمت إضافة وقت الإتاحة للمدرب."); await loadAvailability(trainerId)
    } catch (reason) { toast.error(humanError(reason, "تعذر إضافة وقت الإتاحة.")) } finally { setBusy(false) }
  }

  return <div className="space-y-5">
    <section className="rounded-[2rem] border border-primary/20 bg-gradient-to-l from-primary/[.12] via-card to-card p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div><Badge variant="outline">تهيئة التدريب</Badge><h1 className="mt-2 text-2xl font-black">ملفات المدربين والجداول</h1><p className="mt-2 text-sm leading-7 text-muted-foreground">اربط الموظف بملف مدرب، حدّد تخصصه، ثم عرّف ساعات إتاحته في الفرع حتى تصبح الحجوزات دقيقة.</p></div><Button className="sm:mr-auto" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />تحديث</Button></div>
    </section>
    {error && <p role="alert" className="rounded-2xl bg-red-500/10 p-4 text-sm font-semibold text-red-600">{error}</p>}
    {loading ? <div className="grid min-h-64 place-items-center rounded-3xl border"><Loader2 className="animate-spin text-primary" /></div> : <div className="grid gap-5 xl:grid-cols-2">
      {canManageProfiles && <Card><CardContent className="space-y-5 p-5"><div className="flex items-center gap-3"><UserRoundCog className="text-primary" /><div><h2 className="font-black">إنشاء ملف مدرب</h2><p className="text-xs text-muted-foreground">الموظفون الذين ليس لديهم ملف مدرب فقط.</p></div></div><select className="h-11 w-full rounded-xl border bg-background px-3 text-sm" value={trainerForm.employeeId} onChange={event => { const employee = employees.find(item => item.id === event.target.value); setTrainerForm(value => ({ ...value, employeeId: event.target.value, displayName: employee?.name ?? value.displayName })) }}><option value="">اختر الموظف</option>{availableEmployees.map(item => <option key={item.id} value={item.id}>{item.name} — {item.employeeNumber}</option>)}</select><Input placeholder="الاسم الظاهر للأعضاء" value={trainerForm.displayName} onChange={event => setTrainerForm(value => ({ ...value, displayName: event.target.value }))} /><Input placeholder="نبذة مختصرة (اختياري)" value={trainerForm.publicBio} onChange={event => setTrainerForm(value => ({ ...value, publicBio: event.target.value }))} /><div><p className="mb-2 text-sm font-bold">التخصصات</p><div className="flex flex-wrap gap-2">{specialties.map(item => { const active = trainerForm.specialtyIds.includes(item.id); return <button type="button" key={item.id} onClick={() => setTrainerForm(value => ({ ...value, specialtyIds: active ? value.specialtyIds.filter(id => id !== item.id) : [...value.specialtyIds, item.id] }))} className={`rounded-full border px-3 py-2 text-xs font-bold ${active ? "border-primary bg-primary text-primary-foreground" : ""}`}>{item.name}</button> })}</div></div><Button onClick={() => void createTrainer()} disabled={busy || !trainerForm.employeeId || !trainerForm.displayName.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}إنشاء ملف المدرب</Button><div className="border-t pt-4"><p className="mb-3 text-sm font-black">إضافة تخصص جديد</p><div className="grid gap-2 sm:grid-cols-[.7fr_1fr_auto]"><Input dir="ltr" placeholder="PT" value={specialtyForm.code} onChange={event => setSpecialtyForm(value => ({ ...value, code: event.target.value }))} /><Input placeholder="تدريب شخصي" value={specialtyForm.name} onChange={event => setSpecialtyForm(value => ({ ...value, name: event.target.value }))} /><Button variant="outline" onClick={() => void createSpecialty()} disabled={busy || !specialtyForm.code.trim() || !specialtyForm.name.trim()}>إضافة</Button></div></div></CardContent></Card>}
      {canManageSchedule && <Card><CardContent className="space-y-5 p-5"><div className="flex items-center gap-3"><CalendarClock className="text-primary" /><div><h2 className="font-black">ساعات إتاحة المدرب</h2><p className="text-xs text-muted-foreground">تعرض مدربي الفرع الحالي فقط.</p></div></div><select className="h-11 w-full rounded-xl border bg-background px-3 text-sm" value={trainerId} onChange={event => setTrainerId(event.target.value)}><option value="">اختر مدربًا معينًا للفرع</option>{branchTrainers.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select>{selectedTrainer && <><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-bold">اليوم</span><select className="h-11 w-full rounded-xl border bg-background px-3 text-sm" value={scheduleForm.dayOfWeek} onChange={event => setScheduleForm(value => ({ ...value, dayOfWeek: event.target.value }))}>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label><span className="mb-2 block text-xs font-bold">يبدأ العمل من</span><Input type="time" value={scheduleForm.startLocal} onChange={event => setScheduleForm(value => ({ ...value, startLocal: event.target.value }))} /></label><label><span className="mb-2 block text-xs font-bold">حتى</span><Input type="time" value={scheduleForm.endLocal} onChange={event => setScheduleForm(value => ({ ...value, endLocal: event.target.value }))} /></label><label><span className="mb-2 block text-xs font-bold">ساري من</span><Input type="date" value={scheduleForm.validFrom} onChange={event => setScheduleForm(value => ({ ...value, validFrom: event.target.value }))} /></label></div><Button onClick={() => void addAvailability()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}إضافة وقت الإتاحة</Button><div className="space-y-2 border-t pt-4">{availability.map(item => <div key={item.id} className="flex items-center justify-between rounded-xl border p-3 text-sm"><span className="font-bold">{days[item.dayOfWeek] ?? "يوم"}</span><span dir="ltr">{item.startLocal} — {item.endLocal}</span><span className="text-xs text-muted-foreground">من {item.validFrom}</span></div>)}{!availability.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">لم تُحدد أوقات إتاحة لهذا المدرب بعد.</p>}</div></>}</CardContent></Card>}
    </div>}
  </div>
}

function list(value: unknown): Row[] { if (Array.isArray(value)) return value as Row[]; if (value && typeof value === "object" && "items" in value && Array.isArray((value as { items?: unknown }).items)) return (value as { items: Row[] }).items; return [] }
function mapSpecialty(row: Row): Specialty { return { id: String(row.id ?? ""), code: String(row.code ?? ""), name: String(row.name ?? row.code ?? "تخصص") } }
function mapEmployee(row: Row): Employee { return { id: String(row.id ?? row.employeeId ?? ""), name: String(row.name ?? row.displayName ?? "موظف"), employeeNumber: String(row.employeeNumber ?? "—") } }
function mapTrainer(row: Row): Trainer { return { id: String(row.id ?? ""), ...(row.employeeId ? { employeeId: String(row.employeeId) } : {}), displayName: String(row.displayName ?? "مدرب"), assignments: Array.isArray(row.assignments) ? row.assignments.map(value => { const item = value as Row; return { branchId: String(item.branchId ?? ""), status: String(item.status ?? ""), validFrom: String(item.validFrom ?? ""), ...(item.validUntil ? { validUntil: String(item.validUntil) } : {}) } }) : [] } }
function mapAvailability(row: Row): Availability { return { id: String(row.id ?? ""), dayOfWeek: Number(row.dayOfWeek ?? 0), startLocal: String(row.startLocal ?? ""), endLocal: String(row.endLocal ?? ""), validFrom: String(row.validFrom ?? ""), ...(row.validUntil ? { validUntil: String(row.validUntil) } : {}) } }
function current(value: { status: string; validFrom: string; validUntil?: string }) { const now = Date.now(); return value.status === "ACTIVE" && new Date(value.validFrom).getTime() <= now && (!value.validUntil || new Date(value.validUntil).getTime() > now) }
function localDate() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10) }
