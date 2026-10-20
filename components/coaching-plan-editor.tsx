"use client"

import { useEffect, useState } from "react"
import { Loader2, Save } from "lucide-react"
import { apiRequest } from "@/lib/api-client"
import { coachingDate, coachingItems, coachingList, type CoachingRow } from "@/lib/coaching"
import { humanError } from "@/lib/human-errors"
import { CoachingDialog, CoachingExerciseEditor, CoachingField, blankCoachingExercise, coachingSelectClass } from "@/components/coaching-ui"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DateTimeInput } from "@/components/date-time-input"
import { useToast } from "@/components/toast-provider"

export function CoachingPlanEditor({ organizationId, branchId, members, trainers = [], initialMemberId = "", existing, templateMode = false, staff = false, onClose, onSaved }: { organizationId: string; branchId: string; members: CoachingRow[]; trainers?: CoachingRow[]; initialMemberId?: string; existing?: CoachingRow; templateMode?: boolean; staff?: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [memberId, setMemberId] = useState(String(existing?.memberId ?? initialMemberId))
  const [trainerId, setTrainerId] = useState(String(existing?.trainerProfileId ?? ""))
  const [name, setName] = useState(String(existing?.name ?? ""))
  const [goal, setGoal] = useState(String(existing?.goal ?? ""))
  const [code, setCode] = useState(String(existing?.code ?? ""))
  const [startsOn, setStartsOn] = useState(coachingDate(existing?.startsOn) || new Date().toLocaleDateString("en-CA"))
  const [endsOn, setEndsOn] = useState(coachingDate(existing?.endsOn))
  const [items, setItems] = useState<CoachingRow[]>(existing ? coachingItems(existing.items) : [blankCoachingExercise()])
  const [templates, setTemplates] = useState<CoachingRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const lockedItems = Boolean(existing && !templateMode && coachingList(existing.items).some(item => item.completionStatus !== "PENDING"))
  useEffect(() => {
    if (templateMode || existing) return
    const controller = new AbortController()
    void apiRequest<unknown>(`/organizations/${organizationId}/training-plan-templates`, { signal: controller.signal }).then(result => setTemplates(coachingList(result.data).filter(row => row.status === "ACTIVE"))).catch(() => undefined)
    return () => controller.abort()
  }, [organizationId, templateMode, existing])
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(""); setSaving(true)
    try {
      const selected = members.find(row => String(row.memberId ?? row.id) === memberId)
      const exerciseItems = coachingItems(items)
      const body: CoachingRow = { name: name.trim(), goal: goal.trim() || (existing ? null : undefined), ...(lockedItems ? {} : { items: exerciseItems }) }
      let path = `/organizations/${organizationId}/${templateMode ? "training-plan-templates" : "member-training-plans"}`
      if (!staff && !templateMode) path = `/self/organizations/${organizationId}/trainer/training-plans`
      if (templateMode) { if (!existing) body.code = code.trim().toUpperCase() }
      else { Object.assign(body, { startsOn, endsOn: endsOn || (existing ? null : undefined), ...(!existing ? { memberId, ...(staff ? trainerId ? { trainerProfileId: trainerId } : {} : { branchId: String(selected?.branchId ?? branchId) }) } : !staff ? { branchId: String(selected?.branchId ?? branchId) } : {}) }) }
      if (existing) { path += `/${existing.id}`; body.expectedVersion = Number(existing.version) }
      await apiRequest(path, { method: existing ? "PATCH" : "POST", body: JSON.stringify(body) })
      toast.success(templateMode ? "تم حفظ قالب التدريب." : "تم حفظ خطة التدريب."); onSaved()
    } catch (reason) { setError(humanError(reason, "تعذر حفظ خطة التدريب.")) } finally { setSaving(false) }
  }
  return <CoachingDialog title={templateMode ? existing ? "تعديل قالب التدريب" : "قالب تدريب جديد" : existing ? "تعديل خطة التدريب" : "خطة تدريب جديدة"} description={lockedItems ? "تم حفظ تقدم في هذه الخطة. يمكنك تعديل بياناتها؛ أنشئ خطة جديدة لتغيير التمارين." : "حدد الأيام والتمارين وتعليمات الأداء، ثم احفظ الخطة."} busy={saving} onClose={onClose}><form onSubmit={event => void save(event)} className="space-y-5"><fieldset disabled={saving} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2">{templateMode ? <CoachingField label="رمز القالب"><Input dir="ltr" required minLength={2} maxLength={32} pattern="[A-Za-z0-9_-]{2,32}" value={code} disabled={Boolean(existing)} onChange={e => setCode(e.target.value)} /></CoachingField> : <CoachingField label="المتدرب"><select className={coachingSelectClass} required disabled={Boolean(existing)} value={memberId} onChange={e => setMemberId(e.target.value)}><option value="">اختر المتدرب</option>{members.map(row => <option key={String(row.memberId ?? row.id)} value={String(row.memberId ?? row.id)}>{String(row.memberName ?? row.name)} — {String(row.memberNumber ?? "")}</option>)}</select></CoachingField>}<CoachingField label="اسم الخطة"><Input required minLength={2} maxLength={160} value={name} onChange={e => setName(e.target.value)} /></CoachingField><CoachingField label="الهدف"><Input maxLength={1000} value={goal} onChange={e => setGoal(e.target.value)} /></CoachingField>{!templateMode && <><CoachingField label="تاريخ بداية الخطة"><DateTimeInput type="date" required value={startsOn} onChange={e => setStartsOn(e.target.value)} /></CoachingField><CoachingField label="تاريخ نهاية الخطة"><DateTimeInput type="date" min={startsOn} value={endsOn} onChange={e => setEndsOn(e.target.value)} /></CoachingField>{staff && !existing && <CoachingField label="المدرب المسؤول"><select className={coachingSelectClass} value={trainerId} onChange={e => setTrainerId(e.target.value)}><option value="">دون مدرب محدد</option>{trainers.filter(row => row.status === "ACTIVE").map(row => <option key={String(row.id)} value={String(row.id)}>{String(row.displayName)}</option>)}</select></CoachingField>}</>}{templates.length > 0 && <CoachingField label="ابدأ من قالب"><select className={coachingSelectClass} defaultValue="" onChange={e => { const row = templates.find(item => item.id === e.target.value); if (row) { setItems(coachingItems(row.items)); setName(String(row.name)); setGoal(String(row.goal ?? "")) } }}><option value="">اختر قالبًا اختياريًا</option>{templates.map(row => <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}</select></CoachingField>}</div><CoachingExerciseEditor items={items} onChange={setItems} disabled={lockedItems} /></fieldset>{error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}<div className="flex gap-2 border-t pt-4"><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}حفظ الخطة</Button><Button type="button" variant="outline" disabled={saving} onClick={onClose}>إلغاء</Button></div></form></CoachingDialog>
}
