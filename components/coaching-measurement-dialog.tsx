"use client"

import { useEffect, useState } from "react"
import { CoachingMemberChoice } from "@/components/coaching-list-controls"
import { Loader2, Plus, Save, Trash2 } from "lucide-react"
import { apiRequest } from "@/lib/api-client"
import { coachingList, coachingLocalInstant, type CoachingRow } from "@/lib/coaching"
import { humanError } from "@/lib/human-errors"
import { CoachingDialog, CoachingField, coachingSelectClass } from "@/components/coaching-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DateTimeInput } from "@/components/date-time-input"

export function CoachingMeasurementDialog({ organizationId, branchId, members, initialMemberId, staff = false, onClose, onSaved }: { organizationId: string; branchId: string; members: CoachingRow[]; initialMemberId: string; staff?: boolean; onClose: () => void; onSaved: () => void }) {
  const [memberId, setMemberId] = useState(initialMemberId)
  const [memberName, setMemberName] = useState(String(members.find(row => String(row.id ?? row.memberId) === initialMemberId)?.name ?? ""))
  const [types, setTypes] = useState<CoachingRow[]>([])
  const [values, setValues] = useState([{ measurementTypeId: "", value: "" }])
  const [measuredAt, setMeasuredAt] = useState(coachingLocalInstant(undefined))
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => { const controller = new AbortController(); void apiRequest<unknown>(`/organizations/${organizationId}/measurement-types`, { signal: controller.signal }).then(result => setTypes(coachingList(result.data).filter(row => row.status === "ACTIVE"))).catch(reason => { if (!controller.signal.aborted) setError(humanError(reason, "تعذر تحميل أنواع القياسات.")) }).finally(() => { if (!controller.signal.aborted) setLoading(false) }); return () => controller.abort() }, [organizationId])
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(""); if (!memberId) { setError("اختر المتدرب أولًا."); return }; setSaving(true)
    try {
      const selected = members.find(row => String(row.memberId ?? row.id) === memberId)
      await apiRequest(staff ? `/organizations/${organizationId}/measurement-sessions` : `/self/organizations/${organizationId}/trainer/measurement-sessions`, { method: "POST", body: JSON.stringify({ branchId: staff ? branchId : selected?.branchId ?? branchId, memberId, measuredAt: new Date(measuredAt).toISOString(), notes: notes || undefined, values }) })
      onSaved()
    } catch (reason) { setError(humanError(reason, "تعذر تسجيل جلسة القياس.")) } finally { setSaving(false) }
  }
  return <CoachingDialog title="تسجيل جلسة قياس" description="سجل عدة قياسات في جلسة واحدة. تحفظ القيم كسجل تاريخي بتاريخ القياس." onClose={onClose} busy={saving}><form onSubmit={event => void save(event)} className="space-y-5"><fieldset disabled={loading || saving} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">{staff ? <CoachingMemberChoice organizationId={organizationId} branchId={branchId} value={memberId} name={memberName} onChange={row => { setMemberId(String(row?.id ?? "")); setMemberName(String(row?.name ?? "")) }}/> : <CoachingField label="المتدرب"><select required className={coachingSelectClass} value={memberId} onChange={e => setMemberId(e.target.value)}><option value="">اختر المتدرب</option>{members.map(row => <option key={String(row.memberId ?? row.id)} value={String(row.memberId ?? row.id)}>{String(row.memberName ?? row.name)}</option>)}</select></CoachingField>}<CoachingField label="تاريخ ووقت القياس"><DateTimeInput type="datetime-local" required value={measuredAt} onChange={e => setMeasuredAt(e.target.value)} /></CoachingField></div>{values.map((row, index) => { const type = types.find(item => item.id === row.measurementTypeId); return <div key={index} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_1fr_auto]"><CoachingField label={`نوع القياس ${index + 1}`}><select required className={coachingSelectClass} value={row.measurementTypeId} onChange={e => setValues(current => current.map((item, i) => i === index ? { ...item, measurementTypeId: e.target.value } : item))}><option value="">اختر نوع القياس</option>{types.map(item => <option key={String(item.id)} value={String(item.id)} disabled={values.some((value, i) => i !== index && value.measurementTypeId === item.id)}>{String(item.name)} ({String(item.unit)})</option>)}</select></CoachingField><CoachingField label={`قيمة القياس ${index + 1}`}><Input type="number" required step={type?.dataKind === "INTEGER" ? "1" : "0.0001"} min={type?.minimumValue == null ? undefined : String(type.minimumValue)} max={type?.maximumValue == null ? undefined : String(type.maximumValue)} value={row.value} onChange={e => setValues(current => current.map((item, i) => i === index ? { ...item, value: e.target.value } : item))} /></CoachingField><Button type="button" variant="ghost" className="sm:mt-7" disabled={values.length < 2} onClick={() => setValues(current => current.filter((_, i) => i !== index))} aria-label={`حذف القياس ${index + 1}`}><Trash2 /></Button></div> })}<Button type="button" variant="outline" disabled={!types.length || values.length >= types.length} onClick={() => setValues(current => [...current, { measurementTypeId: "", value: "" }])}><Plus />إضافة قياس آخر</Button><CoachingField label="ملاحظات القياس"><Input maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} /></CoachingField></fieldset>{loading && <p role="status">جارٍ تحميل أنواع القياسات…</p>}{!loading && !types.length && <p className="text-sm text-muted-foreground">لا توجد أنواع قياسات نشطة. أضفها من إعدادات النظام.</p>}{error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}<Button type="submit" disabled={loading || saving || !types.length}>{saving ? <Loader2 className="animate-spin" /> : <Save />}حفظ جلسة القياس</Button></form></CoachingDialog>
}
