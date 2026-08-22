"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Activity, CalendarDays, CheckCircle2, ChevronLeft, CircleDollarSign, Clock3,
  Dumbbell, HandCoins, Loader2, MapPin, NotebookTabs, Plus, RefreshCw, Ruler,
  Search, Sparkles, Target, Trash2, TrendingUp, UserRound, Users, X,
} from "lucide-react"
import { ActionDialog } from "@/components/action-dialog"
import { useAppContext } from "@/components/app-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/toast-provider"
import { apiRequest } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

type Row = Record<string, unknown>
type MemberRow = Row & {
  memberId?: string; memberName?: string; memberNumber?: string; branchId?: string; branchName?: string
  status?: string; activePlanId?: string; activePlanName?: string; planTotalItems?: number; planCompletedItems?: number
  lastMeasurementAt?: string; lastMeasurementValues?: Row[]; nextSessionAt?: string; nextSessionResource?: string
}
type ScheduleRow = Row & { id?: string; startsAt?: string; endsAt?: string; resourceName?: string; branchName?: string; bookedCount?: number; capacity?: number; status?: string; attendees?: Row[] }
type PlanRow = Row & { id?: string; memberId?: string; memberName?: string; memberNumber?: string; name?: string; goal?: string; startsOn?: string; endsOn?: string; status?: string; items?: Row[] }
type WorkspaceData = { trainer?: Row; members: MemberRow[]; schedule: ScheduleRow[]; plans: PlanRow[]; commissions: Row[] }
type TabKey = "overview" | "members" | "schedule" | "plans" | "commissions"

const tabs: { key: TabKey; label: string; icon: typeof Users }[] = [
  { key: "overview", label: "نظرة اليوم", icon: Sparkles },
  { key: "members", label: "المتدربون", icon: Users },
  { key: "schedule", label: "جدولي", icon: CalendarDays },
  { key: "plans", label: "خطط التدريب", icon: Dumbbell },
  { key: "commissions", label: "عمولاتي", icon: HandCoins },
]

export function TrainerWorkspace() {
  const context = useAppContext()
  const toast = useToast()
  const [active, setActive] = useState<TabKey>("overview")
  const [data, setData] = useState<WorkspaceData>({ members: [], schedule: [], plans: [], commissions: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [selectedMemberId, setSelectedMemberId] = useState("")
  const [measurementMemberId, setMeasurementMemberId] = useState("")
  const [planMemberId, setPlanMemberId] = useState("")
  const [measurements, setMeasurements] = useState<Row[]>([])
  const [measurementsLoading, setMeasurementsLoading] = useState(false)
  const [busy, setBusy] = useState("")
  const range = useMemo(() => workspaceRange(), [])

  async function load() {
    if (!context.organizationId) return
    setLoading(true); setError("")
    try {
      const base = `/self/organizations/${context.organizationId}/trainer`
      const trainer = await apiRequest<Row>(base)
      const [members, schedule, plans, commissions] = await Promise.allSettled([
        apiRequest<unknown>(`${base}/members`),
        apiRequest<unknown>(`${base}/schedule?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`),
        apiRequest<unknown>(`${base}/training-plans?limit=200`),
        apiRequest<unknown>(`${base}/commissions?limit=100`),
      ])
      const next: WorkspaceData = {
        trainer: trainer.data,
        members: members.status === "fulfilled" ? list(members.value.data) as MemberRow[] : [],
        schedule: schedule.status === "fulfilled" ? list(schedule.value.data) as ScheduleRow[] : [],
        plans: plans.status === "fulfilled" ? list(plans.value.data) as PlanRow[] : [],
        commissions: commissions.status === "fulfilled" ? list(commissions.value.data) : [],
      }
      setData(next)
      if ([members, schedule, plans, commissions].some(result => result.status === "rejected")) {
        setError("تم فتح مساحة المدرب، لكن تعذر تحميل بعض البيانات الثانوية. استخدم «تحديث» لإعادة المحاولة.")
      }
      setSelectedMemberId(current => next.members.some(member => member.memberId === current) ? current : next.members[0]?.memberId ?? "")
    } catch (reason) {
      setData({ members: [], schedule: [], plans: [], commissions: [] })
      setError(humanError(reason, "تعذر تحميل مساحة المدرب. تأكد من ربط حساب الموظف بملف مدرب نشط داخل الفرع."))
    } finally { setLoading(false) }
  }

  useEffect(() => { const frame = requestAnimationFrame(() => void load()); return () => cancelAnimationFrame(frame) }, [context.organizationId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedMemberId || !context.organizationId) return
    let cancelled = false
    const frame = requestAnimationFrame(() => {
      setMeasurementsLoading(true)
      void apiRequest<unknown>(`/self/organizations/${context.organizationId}/trainer/members/${selectedMemberId}/measurements?limit=12`)
        .then(response => { if (!cancelled) setMeasurements(list(response.data)) })
        .catch(() => { if (!cancelled) setMeasurements([]) })
        .finally(() => { if (!cancelled) setMeasurementsLoading(false) })
    })
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [context.organizationId, selectedMemberId])

  async function transitionItem(plan: PlanRow, item: Row, status: "COMPLETED" | "SKIPPED") {
    const planId = String(plan.id ?? ""), itemId = String(item.id ?? "")
    if (!planId || !itemId) return
    setBusy(itemId)
    try {
      await apiRequest(`/self/organizations/${context.organizationId}/trainer/training-plans/${planId}/items/${itemId}/transitions`, { method: "POST", body: JSON.stringify({ status }) })
      toast.success(status === "COMPLETED" ? "تم اعتماد تنفيذ التمرين." : "تم تسجيل عدم تنفيذ التمرين.")
      await load()
    } catch (reason) { toast.error(humanError(reason, "تعذر تحديث حالة التمرين.")) } finally { setBusy("") }
  }

  const selectedMember = data.members.find(member => member.memberId === selectedMemberId)
  const todaySchedule = data.schedule.filter(slot => isToday(slot.startsAt))
  const activePlans = data.plans.filter(plan => plan.status === "ACTIVE")
  const filteredMembers = data.members.filter(member => normalize(`${member.memberName} ${member.memberNumber}`).includes(normalize(query)))
  const totalCommission = data.commissions.filter(row => ["ACCRUED", "APPROVED", "PAID"].includes(String(row.status))).reduce((sum, row) => sum + Number(row.commissionAmountMinor ?? 0), 0)

  return <div className="fade-up space-y-6">
    <section className="overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-l from-primary/[.12] via-card to-card p-6 sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"><Dumbbell /></span>
          <div><Badge variant="outline">مساحة المدرب</Badge><h1 className="mt-2 text-2xl font-black sm:text-3xl">مرحبًا، {text(data.trainer?.displayName, "مدرب النادي")}</h1><p className="mt-1 text-sm leading-6 text-muted-foreground">خطط يومك، تابع تقدم المتدربين، وسجّل القياسات من ملف العضو نفسه.</p></div>
        </div>
        <div className="flex flex-wrap gap-2 lg:mr-auto">
          {context.canAccess(["measurements.manage"]) && <Button onClick={() => setMeasurementMemberId(selectedMemberId || data.members[0]?.memberId || "")} disabled={!data.members.length}><Ruler />تسجيل قياس</Button>}
          <Button variant="outline" onClick={() => setPlanMemberId(selectedMemberId || data.members[0]?.memberId || "")} disabled={!data.members.length}><Plus />خطة تدريب جديدة</Button>
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />تحديث</Button>
        </div>
      </div>
    </section>

    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="أقسام مساحة المدرب">
      {tabs.map(tab => <Button key={tab.key} variant={tab.key === active ? "default" : "outline"} onClick={() => setActive(tab.key)} className="shrink-0"><tab.icon />{tab.label}</Button>)}
    </nav>

    {error && <p role="alert" className="rounded-2xl bg-red-500/10 p-4 text-sm font-semibold text-red-600">{error}</p>}
    {loading ? <div className="grid min-h-80 place-items-center rounded-3xl border bg-card"><div className="text-center"><Loader2 className="mx-auto animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">نجهّز مساحة عملك…</p></div></div> : <>
      {active === "overview" && <Overview members={data.members} schedule={todaySchedule} plans={activePlans} totalCommission={totalCommission} onMember={id => { setSelectedMemberId(id); setActive("members") }} onSchedule={() => setActive("schedule")} onPlans={() => setActive("plans")} />}
      {active === "members" && <MembersView members={filteredMembers} query={query} setQuery={setQuery} selected={selectedMember} select={setSelectedMemberId} measurements={measurements} measurementsLoading={measurementsLoading} onMeasurement={setMeasurementMemberId} onPlan={setPlanMemberId} />}
      {active === "schedule" && <ScheduleView rows={data.schedule} />}
      {active === "plans" && <PlansView rows={data.plans} busy={busy} onTransition={transitionItem} onMember={id => { setSelectedMemberId(id); setActive("members") }} />}
      {active === "commissions" && <CommissionsView rows={data.commissions} />}
    </>}

    {measurementMemberId && <ActionDialog operationId="recordSelfTrainerMeasurement" organizationId={context.organizationId} branchId={data.members.find(member => member.memberId === measurementMemberId)?.branchId ?? context.branchId} initialValues={{ memberId: measurementMemberId }} onClose={() => setMeasurementMemberId("")} onSaved={() => { setMeasurementMemberId(""); void load(); setSelectedMemberId(measurementMemberId) }} />}
    {planMemberId && <PlanDialog organizationId={context.organizationId} members={data.members} initialMemberId={planMemberId} onClose={() => setPlanMemberId("")} onSaved={() => { setPlanMemberId(""); void load(); setActive("plans") }} />}
  </div>
}

function Overview({ members, schedule, plans, totalCommission, onMember, onSchedule, onPlans }: { members: MemberRow[]; schedule: ScheduleRow[]; plans: PlanRow[]; totalCommission: number; onMember: (id: string) => void; onSchedule: () => void; onPlans: () => void }) {
  const withoutPlan = members.filter(member => !member.activePlanId)
  const stats = [
    { label: "متدربون نشطون", value: members.length, hint: withoutPlan.length ? `${withoutPlan.length} بحاجة إلى خطة` : "كل المتدربين لديهم خطط", icon: Users, color: "text-blue-600 bg-blue-500/10" },
    { label: "جلسات اليوم", value: schedule.length, hint: schedule.length ? `${schedule.reduce((sum, row) => sum + Number(row.bookedCount ?? 0), 0)} حجوزات` : "لا توجد جلسات اليوم", icon: CalendarDays, color: "text-violet-600 bg-violet-500/10" },
    { label: "خطط نشطة", value: plans.length, hint: "مرتبطة بحسابات الأعضاء", icon: Target, color: "text-emerald-600 bg-emerald-500/10" },
    { label: "إجمالي عمولاتي", value: money(totalCommission), hint: "المستحقة والمعتمدة والمدفوعة", icon: CircleDollarSign, color: "text-amber-700 bg-amber-500/10" },
  ]
  return <div className="space-y-5">
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(stat => <Card key={stat.label}><CardContent className="p-5"><div className="flex items-start gap-3"><span className={`grid size-11 place-items-center rounded-2xl ${stat.color}`}><stat.icon className="size-5" /></span><div><p className="text-xs font-bold text-muted-foreground">{stat.label}</p><p className="mt-2 text-2xl font-black">{stat.value}</p><p className="mt-1 text-[11px] text-muted-foreground">{stat.hint}</p></div></div></CardContent></Card>)}</section>
    <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <Card><CardContent className="p-5"><SectionTitle icon={Clock3} title="جدول اليوم" subtitle="الجلسات مرتبة حسب وقت البداية" action="عرض الجدول" onAction={onSchedule} /><div className="mt-5 space-y-3">{schedule.slice(0, 5).map(slot => <SessionLine key={String(slot.id)} slot={slot} />)}{!schedule.length && <Empty icon={CalendarDays} title="يومك خالٍ من الجلسات" description="ستظهر هنا الحجوزات والجلسات الشخصية المرتبطة بجدولك." />}</div></CardContent></Card>
      <Card><CardContent className="p-5"><SectionTitle icon={TrendingUp} title="تحتاج متابعتك" subtitle="أعضاء بلا خطة تدريب نشطة" action="كل الخطط" onAction={onPlans} /><div className="mt-5 space-y-2">{withoutPlan.slice(0, 5).map(member => <button key={member.memberId} onClick={() => onMember(String(member.memberId))} className="flex w-full items-center gap-3 rounded-2xl border p-3 text-right transition hover:border-primary/40 hover:bg-primary/[.04]"><Avatar name={member.memberName} /><div><p className="text-sm font-black">{member.memberName}</p><p className="text-[11px] text-muted-foreground">{member.memberNumber} · {member.branchName}</p></div><ChevronLeft className="mr-auto size-4 text-muted-foreground" /></button>)}{!withoutPlan.length && <Empty icon={CheckCircle2} title="المتابعة منظمة" description="كل المتدربين الحاليين لديهم خطة نشطة." />}</div></CardContent></Card>
    </section>
  </div>
}

function MembersView({ members, query, setQuery, selected, select, measurements, measurementsLoading, onMeasurement, onPlan }: { members: MemberRow[]; query: string; setQuery: (value: string) => void; selected?: MemberRow; select: (id: string) => void; measurements: Row[]; measurementsLoading: boolean; onMeasurement: (id: string) => void; onPlan: (id: string) => void }) {
  return <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
    <Card><CardContent className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div><h2 className="font-black">المتدربون المرتبطون بك</h2><p className="mt-1 text-xs text-muted-foreground">لا يظهر هنا إلا أعضاء التعيينات النشطة داخل فروع عملك.</p></div><label className="relative sm:mr-auto sm:w-72"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث بالاسم أو رقم العضوية" className="pr-10" /></label></div><div className="mt-5 grid gap-3 md:grid-cols-2">{members.map(member => { const progress = percentage(member.planCompletedItems, member.planTotalItems); return <button key={member.memberId} onClick={() => select(String(member.memberId))} className={`rounded-3xl border p-4 text-right transition ${selected?.memberId === member.memberId ? "border-primary bg-primary/[.07] shadow-lg shadow-primary/5" : "hover:border-primary/35 hover:bg-secondary/30"}`}><div className="flex items-center gap-3"><Avatar name={member.memberName} /><div className="min-w-0"><p className="truncate font-black">{member.memberName}</p><p className="mt-1 text-[11px] text-muted-foreground">{member.memberNumber} · {member.branchName}</p></div><Badge variant="outline" className="mr-auto">{statusLabel(member.status)}</Badge></div><div className="mt-4"><div className="flex justify-between text-[11px]"><span className="font-bold">{member.activePlanName ?? "لا توجد خطة نشطة"}</span><span className="text-muted-foreground">{member.activePlanId ? `${progress}%` : "—"}</span></div><Progress value={progress} /></div>{member.nextSessionAt && <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><CalendarDays className="size-3.5 text-primary" />الجلسة القادمة: {dateTime(member.nextSessionAt)}</p>}</button>})}{!members.length && <div className="md:col-span-2"><Empty icon={Users} title="لا توجد نتائج" description={query ? "جرّب اسمًا أو رقم عضوية مختلفًا." : "لم يتم تعيين أعضاء لهذا المدرب بعد."} /></div>}</div></CardContent></Card>
    <MemberProfile member={selected} measurements={measurements} loading={measurementsLoading} onMeasurement={onMeasurement} onPlan={onPlan} />
  </div>
}

function MemberProfile({ member, measurements, loading, onMeasurement, onPlan }: { member?: MemberRow; measurements: Row[]; loading: boolean; onMeasurement: (id: string) => void; onPlan: (id: string) => void }) {
  if (!member) return <Card><CardContent className="p-5"><Empty icon={UserRound} title="اختر متدربًا" description="سيفتح ملف المتابعة الرياضي هنا." /></CardContent></Card>
  const values = Array.isArray(member.lastMeasurementValues) ? member.lastMeasurementValues : []
  return <Card className="h-fit xl:sticky xl:top-5"><CardContent className="p-5"><div className="flex items-center gap-4"><Avatar name={member.memberName} large /><div><p className="text-lg font-black">{member.memberName}</p><p className="mt-1 text-xs text-muted-foreground">{member.memberNumber}</p></div><Badge className="mr-auto">ملف المتدرب</Badge></div><div className="mt-5 grid grid-cols-2 gap-3"><Info icon={MapPin} label="فرع التدريب" value={text(member.branchName)} /><Info icon={NotebookTabs} label="الخطة الحالية" value={text(member.activePlanName, "غير محددة")} /><Info icon={Activity} label="تقدم الخطة" value={member.activePlanId ? `${percentage(member.planCompletedItems, member.planTotalItems)}%` : "—"} /><Info icon={CalendarDays} label="الجلسة القادمة" value={member.nextSessionAt ? shortDate(member.nextSessionAt) : "لا يوجد موعد"} /></div><div className="mt-5 flex gap-2"><Button className="flex-1" onClick={() => onMeasurement(String(member.memberId))}><Ruler />تسجيل قياس</Button><Button className="flex-1" variant="outline" onClick={() => onPlan(String(member.memberId))}><Plus />خطة جديدة</Button></div><div className="mt-6 border-t pt-5"><h3 className="font-black">آخر القياسات</h3>{loading ? <Loader2 className="mx-auto mt-6 animate-spin text-primary" /> : <div className="mt-3 space-y-3">{measurements.slice(0, 4).map((session, index) => <div key={String(session.id ?? index)} className="rounded-2xl bg-secondary/45 p-3"><div className="flex justify-between text-[11px]"><span className="font-bold">جلسة قياس</span><span className="text-muted-foreground">{dateTime(session.measuredAt)}</span></div><div className="mt-2 flex flex-wrap gap-2">{(Array.isArray(session.values) ? session.values : []).map((value, valueIndex) => { const metric = value as Row; return <Badge key={String(metric.id ?? valueIndex)} variant="outline">{text(metric.typeName)}: {text(metric.value)} {text(metric.unit, "")}</Badge> })}</div></div>)}{!measurements.length && <p className="rounded-2xl border border-dashed p-5 text-center text-xs text-muted-foreground">لم تُسجل قياسات لهذا العضو بعد.</p>}</div>}</div>{values.length > 0 && <p className="mt-4 text-[11px] text-muted-foreground">آخر تحديث للقياسات: {dateTime(member.lastMeasurementAt)}</p>}</CardContent></Card>
}

function ScheduleView({ rows }: { rows: ScheduleRow[] }) {
  const groups = groupByDate(rows)
  return <section className="space-y-4">{groups.map(group => <Card key={group.date}><CardContent className="p-5"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><CalendarDays /></span><div><h2 className="font-black">{dayHeading(group.date)}</h2><p className="text-xs text-muted-foreground">{group.rows.length} جلسات</p></div></div><div className="mt-5 grid gap-3 lg:grid-cols-2">{group.rows.map(slot => <SessionCard key={String(slot.id)} slot={slot} />)}</div></CardContent></Card>)}{!rows.length && <Card><CardContent className="p-10"><Empty icon={CalendarDays} title="لا توجد جلسات في الفترة الحالية" description="يعرض الجدول الأسبوع الماضي والـ31 يومًا القادمة." /></CardContent></Card>}</section>
}

function PlansView({ rows, busy, onTransition, onMember }: { rows: PlanRow[]; busy: string; onTransition: (plan: PlanRow, item: Row, status: "COMPLETED" | "SKIPPED") => void; onMember: (id: string) => void }) {
  return <section className="space-y-4">
    {rows.map((plan, index) => {
      const items = Array.isArray(plan.items) ? plan.items : []
      const completed = items.filter(item => item.completionStatus === "COMPLETED").length
      return <Card key={String(plan.id ?? index)}><CardContent className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div><div className="flex flex-wrap items-center gap-2"><Badge>{statusLabel(plan.status)}</Badge><span className="text-xs text-muted-foreground">{date(plan.startsOn)}{plan.endsOn ? ` — ${date(plan.endsOn)}` : ""}</span></div><h2 className="mt-3 text-lg font-black">{text(plan.name, `خطة تدريب ${index + 1}`)}</h2><button onClick={() => { if (plan.memberId) onMember(plan.memberId) }} className="mt-1 text-xs font-bold text-primary hover:underline">{text(plan.memberName)} · {text(plan.memberNumber)}</button>{plan.goal && <p className="mt-2 text-xs leading-6 text-muted-foreground">الهدف: {String(plan.goal)}</p>}</div>
          <div className="sm:mr-auto sm:w-44"><div className="flex justify-between text-xs"><span>الإنجاز</span><strong>{completed} / {items.length}</strong></div><Progress value={percentage(completed, items.length)} /></div>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">{items.map((item, itemIndex) => {
          const state = String(item.completionStatus ?? "PENDING")
          return <div key={String(item.id ?? itemIndex)} className="rounded-2xl border p-4"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-black">{text(item.dayNumber, "1")}</span><div><p className="font-bold">{text(item.exerciseName, `تمرين ${itemIndex + 1}`)}</p><p className="mt-1 text-[11px] text-muted-foreground">{exerciseSummary(item)}</p>{Boolean(item.instructions) && <p className="mt-2 text-xs leading-5 text-muted-foreground">{text(item.instructions)}</p>}</div><Badge variant="outline" className="mr-auto shrink-0">{statusLabel(state)}</Badge></div>{state === "PENDING" && <div className="mt-3 flex gap-2 border-t pt-3"><Button size="sm" disabled={busy === String(item.id)} onClick={() => onTransition(plan, item, "COMPLETED")}><CheckCircle2 />اعتماد التنفيذ</Button><Button size="sm" variant="outline" disabled={busy === String(item.id)} onClick={() => onTransition(plan, item, "SKIPPED")}>لم يُنفذ</Button></div>}</div>
        })}</div>
      </CardContent></Card>
    })}
    {!rows.length && <Card><CardContent className="p-10"><Empty icon={Dumbbell} title="لا توجد خطط تدريب" description="أنشئ خطة لأحد المتدربين لتظهر هنا وفي حساب العضو مباشرة." /></CardContent></Card>}
  </section>
}

function CommissionsView({ rows }: { rows: Row[] }) {
  return <Card><CardContent className="p-5"><SectionTitle icon={HandCoins} title="سجل عمولاتي" subtitle="تفاصيل الاستحقاقات وحالة اعتمادها وصرفها" /><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((row, index) => <div key={String(row.id ?? index)} className="rounded-3xl border p-4"><div className="flex items-center justify-between"><Badge variant="outline">{statusLabel(row.status)}</Badge><p className="text-lg font-black">{money(Number(row.commissionAmountMinor ?? 0))}</p></div><dl className="mt-4 space-y-2 text-xs"><Data label="المصدر" value={sourceLabel(row.sourceType)} /><Data label="تاريخ الاستحقاق" value={dateTime(row.occurredAt)} /><Data label="أساس الاحتساب" value={money(Number(row.basisAmountMinor ?? 0))} /></dl></div>)}{!rows.length && <div className="md:col-span-2 xl:col-span-3"><Empty icon={HandCoins} title="لا توجد عمولات مسجلة" description="ستظهر الاستحقاقات هنا عند تسجيلها واعتمادها ماليًا." /></div>}</div></CardContent></Card>
}

type ExerciseDraft = { dayNumber: number; exerciseName: string; sets: string; repetitions: string; durationMinutes: string; instructions: string }
function PlanDialog({ organizationId, members, initialMemberId, onClose, onSaved }: { organizationId: string; members: MemberRow[]; initialMemberId: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [memberId, setMemberId] = useState(initialMemberId)
  const [name, setName] = useState("")
  const [goal, setGoal] = useState("")
  const [startsOn, setStartsOn] = useState(today())
  const [endsOn, setEndsOn] = useState(() => plusDays(28))
  const [items, setItems] = useState<ExerciseDraft[]>([blankExercise()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const selected = members.find(member => member.memberId === memberId)

  function update(index: number, patch: Partial<ExerciseDraft>) { setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)) }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("")
    if (!memberId || !selected?.branchId) { setError("اختر متدربًا مرتبطًا بك."); return }
    if (name.trim().length < 2) { setError("اكتب اسمًا واضحًا للخطة."); return }
    if (items.some(item => item.exerciseName.trim().length < 2)) { setError("اكتب اسم كل تمرين أو احذف السطر غير المستخدم."); return }
    setSaving(true)
    try {
      await apiRequest(`/self/organizations/${organizationId}/trainer/training-plans`, { method: "POST", body: JSON.stringify({ branchId: selected.branchId, memberId, name: name.trim(), goal: goal.trim() || undefined, startsOn, endsOn: endsOn || undefined, items: items.map((item, index) => ({ dayNumber: item.dayNumber, sequenceNumber: index + 1, exerciseName: item.exerciseName.trim(), sets: item.sets ? Number(item.sets) : undefined, repetitions: item.repetitions.trim() || undefined, durationMinutes: item.durationMinutes ? Number(item.durationMinutes) : undefined, instructions: item.instructions.trim() || undefined })) }) })
      toast.success(`تم إنشاء الخطة وربطها بحساب ${selected.memberName}.`)
      onSaved()
    } catch (reason) { setError(humanError(reason, "تعذر إنشاء خطة التدريب.")) } finally { setSaving(false) }
  }

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="plan-dialog-title"><form onSubmit={submit} className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border bg-card shadow-2xl"><header className="sticky top-0 z-10 flex items-start gap-4 border-b bg-card/95 p-5 backdrop-blur-xl sm:p-7"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary"><NotebookTabs /></span><div><Badge variant="outline">خطة مرتبطة بحساب العضو</Badge><h2 id="plan-dialog-title" className="mt-2 text-2xl font-black">إنشاء خطة تدريب جديدة</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">ستظهر الخطة للمدرب وللعضو في بوابته فور الحفظ.</p></div><button type="button" onClick={onClose} className="mr-auto grid size-10 place-items-center rounded-xl transition hover:bg-secondary" aria-label="إغلاق"><X /></button></header><div className="space-y-6 p-5 sm:p-7"><div className="grid gap-4 md:grid-cols-2"><Field label="المتدرب"><select value={memberId} onChange={event => setMemberId(event.target.value)} className="h-12 w-full rounded-xl border bg-background px-3 font-bold outline-none focus:border-primary">{members.map(member => <option key={member.memberId} value={member.memberId}>{member.memberName} — {member.memberNumber}</option>)}</select></Field><Field label="اسم الخطة"><Input value={name} onChange={event => setName(event.target.value)} placeholder="مثال: تأسيس القوة واللياقة" className="h-12" /></Field><Field label="الهدف"><Input value={goal} onChange={event => setGoal(event.target.value)} placeholder="الهدف المتوقع من الخطة" className="h-12" /></Field><div className="grid grid-cols-2 gap-3"><Field label="تبدأ في"><Input type="date" value={startsOn} onChange={event => setStartsOn(event.target.value)} className="h-12" /></Field><Field label="تنتهي في"><Input type="date" value={endsOn} onChange={event => setEndsOn(event.target.value)} className="h-12" /></Field></div></div><section><div className="flex items-center"><div><h3 className="font-black">تمارين الخطة</h3><p className="mt-1 text-xs text-muted-foreground">رتّب التمارين وحدد اليوم والمجموعات أو المدة حسب طبيعة التمرين.</p></div><Button type="button" variant="outline" className="mr-auto" onClick={() => setItems(current => [...current, blankExercise()])}><Plus />إضافة تمرين</Button></div><div className="mt-4 space-y-3">{items.map((item, index) => <div key={index} className="rounded-3xl border bg-background/40 p-4"><div className="grid gap-3 md:grid-cols-[90px_1.5fr_100px_120px_110px_auto]"><Field label="اليوم"><Input type="number" min="1" value={item.dayNumber} onChange={event => update(index, { dayNumber: Number(event.target.value) })} /></Field><Field label="التمرين"><Input value={item.exerciseName} onChange={event => update(index, { exerciseName: event.target.value })} placeholder="اسم التمرين" /></Field><Field label="المجموعات"><Input type="number" min="1" value={item.sets} onChange={event => update(index, { sets: event.target.value })} /></Field><Field label="التكرارات"><Input value={item.repetitions} onChange={event => update(index, { repetitions: event.target.value })} placeholder="8-12" /></Field><Field label="المدة/دقيقة"><Input type="number" min="1" value={item.durationMinutes} onChange={event => update(index, { durationMinutes: event.target.value })} /></Field><button type="button" onClick={() => setItems(current => current.filter((_, itemIndex) => itemIndex !== index))} disabled={items.length === 1} className="mt-6 grid size-10 place-items-center rounded-xl text-red-500 transition hover:bg-red-500/10 disabled:opacity-30" aria-label="حذف التمرين"><Trash2 className="size-4" /></button></div><Input value={item.instructions} onChange={event => update(index, { instructions: event.target.value })} placeholder="تعليمات الأداء أو الراحة (اختياري)" className="mt-3" /></div>)}</div></section>{error && <p role="alert" className="rounded-2xl bg-red-500/10 p-4 text-sm font-semibold text-red-600">{error}</p>}<footer className="flex flex-wrap gap-3 border-t pt-5"><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}إنشاء وربط الخطة</Button><Button type="button" variant="outline" onClick={onClose}>إلغاء</Button></footer></div></form></div>
}

function SessionCard({ slot }: { slot: ScheduleRow }) { const attendees = Array.isArray(slot.attendees) ? slot.attendees : []; return <div className="rounded-3xl border p-4"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-violet-500/10 text-violet-600"><Clock3 /></span><div><p className="font-black">{text(slot.resourceName, "جلسة تدريب")}</p><p className="mt-1 text-xs text-muted-foreground">{time(slot.startsAt)} — {time(slot.endsAt)} · {slot.branchName}</p></div><Badge variant="outline" className="mr-auto">{slot.bookedCount ?? 0}/{slot.capacity ?? 0}</Badge></div>{attendees.length > 0 && <div className="mt-4 border-t pt-3"><p className="text-[11px] font-bold text-muted-foreground">المتدربون</p><div className="mt-2 flex flex-wrap gap-2">{attendees.map((attendee, index) => <Badge key={String(attendee.memberId ?? index)} variant="outline">{text(attendee.memberName)} · {text(attendee.memberNumber)}</Badge>)}</div></div>}</div> }
function SessionLine({ slot }: { slot: ScheduleRow }) { return <div className="flex items-center gap-3 rounded-2xl border p-3"><span className="min-w-16 text-center text-sm font-black text-primary">{time(slot.startsAt)}</span><div className="border-r pr-3"><p className="text-sm font-bold">{text(slot.resourceName, "جلسة تدريب")}</p><p className="mt-1 text-[11px] text-muted-foreground">{slot.branchName} · {slot.bookedCount ?? 0} حجوزات</p></div><Badge variant="outline" className="mr-auto">{statusLabel(slot.status)}</Badge></div> }
function SectionTitle({ icon: Icon, title, subtitle, action, onAction }: { icon: typeof Users; title: string; subtitle: string; action?: string; onAction?: () => void }) { return <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span><div><h2 className="font-black">{title}</h2><p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p></div>{action && <Button variant="ghost" size="sm" className="mr-auto" onClick={onAction}>{action}<ChevronLeft /></Button>}</div> }
function Empty({ icon: Icon, title, description }: { icon: typeof Users; title: string; description: string }) { return <div className="py-8 text-center"><Icon className="mx-auto size-8 text-muted-foreground/40" /><p className="mt-3 text-sm font-black">{title}</p><p className="mx-auto mt-1 max-w-sm text-xs leading-6 text-muted-foreground">{description}</p></div> }
function Avatar({ name, large = false }: { name?: string; large?: boolean }) { return <span className={`grid shrink-0 place-items-center rounded-2xl bg-primary/12 font-black text-primary ${large ? "size-14 text-lg" : "size-11"}`}>{text(name, "ع").trim().slice(0, 1)}</span> }
function Info({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) { return <div className="rounded-2xl bg-secondary/45 p-3"><Icon className="size-4 text-primary" /><p className="mt-2 text-[10px] text-muted-foreground">{label}</p><p className="mt-1 truncate text-xs font-black">{value}</p></div> }
function Data({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-bold">{value}</dd></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-xs font-black">{label}</span>{children}</label> }
function Progress({ value }: { value: number }) { return <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div> }

function list(value: unknown): Row[] { if (Array.isArray(value)) return value as Row[]; if (value && typeof value === "object" && Array.isArray((value as { items?: unknown[] }).items)) return (value as { items: Row[] }).items; return [] }
function text(value: unknown, fallback = "—") { return value === null || value === undefined || value === "" ? fallback : String(value) }
function normalize(value: string) { return value.trim().toLocaleLowerCase("ar").replace(/[أإآ]/gu, "ا").replace(/ة/gu, "ه") }
function percentage(completed: unknown, total: unknown) { const count = Number(total ?? 0); return count > 0 ? Math.round(Number(completed ?? 0) * 100 / count) : 0 }
function dateTime(value: unknown) { const parsed = new Date(String(value ?? "")); return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(parsed) }
function date(value: unknown) { const parsed = new Date(String(value ?? "")); return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(parsed) }
function shortDate(value: unknown) { const parsed = new Date(String(value ?? "")); return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(parsed) }
function time(value: unknown) { const parsed = new Date(String(value ?? "")); return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(parsed) }
function money(value: number) { return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(value / 100) }
function statusLabel(value: unknown) { return ({ ACTIVE: "نشط", INACTIVE: "غير نشط", PENDING: "بانتظار التنفيذ", COMPLETED: "مكتمل", SKIPPED: "لم يُنفذ", CANCELLED: "ملغى", OPEN: "مفتوح", ACCRUED: "مستحق", APPROVED: "معتمد", PAID: "مدفوع", VOIDED: "ملغى ماليًا", AVAILABLE: "متاح" } as Record<string, string>)[String(value)] ?? text(value) }
function sourceLabel(value: unknown) { return ({ PERSONAL_TRAINING: "تدريب شخصي", SUBSCRIPTION_SALE: "بيع اشتراك", MANUAL_ADJUSTMENT: "تسوية يدوية" } as Record<string, string>)[String(value)] ?? text(value) }
function exerciseSummary(item: Row) { return [item.sets ? `${item.sets} مجموعات` : "", item.repetitions ? `${item.repetitions} تكرار` : "", item.durationMinutes ? `${item.durationMinutes} دقيقة` : ""].filter(Boolean).join(" · ") || "حسب تعليمات المدرب" }
function isToday(value: unknown) { const date = new Date(String(value ?? "")), now = new Date(); return !Number.isNaN(date.getTime()) && date.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }) === now.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }) }
function groupByDate(rows: ScheduleRow[]) { const groups = new Map<string, ScheduleRow[]>(); for (const row of rows) { const parsed = new Date(String(row.startsAt ?? "")); const key = Number.isNaN(parsed.getTime()) ? "unknown" : parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }); groups.set(key, [...(groups.get(key) ?? []), row]) } return [...groups].map(([date, values]) => ({ date, rows: values })) }
function dayHeading(value: string) { const parsed = new Date(`${value}T12:00:00Z`); return value === "unknown" ? "موعد غير محدد" : new Intl.DateTimeFormat("ar-SA", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Riyadh" }).format(parsed) }
function today() { return new Date().toLocaleDateString("en-CA") }
function plusDays(days: number) { const value = new Date(); value.setDate(value.getDate() + days); return value.toLocaleDateString("en-CA") }
function blankExercise(): ExerciseDraft { return { dayNumber: 1, exerciseName: "", sets: "", repetitions: "", durationMinutes: "", instructions: "" } }
function workspaceRange() { const from = new Date(); from.setDate(from.getDate() - 7); const to = new Date(); to.setDate(to.getDate() + 31); return { from: from.toISOString(), to: to.toISOString() } }
