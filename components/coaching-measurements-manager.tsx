"use client"

import { useEffect, useState } from "react"
import { Loader2, Plus, RefreshCw } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { CoachingMeasurementDialog } from "@/components/coaching-measurement-dialog"
import { CoachingField, coachingSelectClass } from "@/components/coaching-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { coachingDate, coachingList, loadCoachingPages, type CoachingRow } from "@/lib/coaching"
import { humanError } from "@/lib/human-errors"

export function CoachingMeasurementsManager() {
  const context = useAppContext()
  const [members, setMembers] = useState<CoachingRow[]>([]), [sessions, setSessions] = useState<CoachingRow[]>([])
  const [memberId, setMemberId] = useState(""), [loading, setLoading] = useState(true), [error, setError] = useState(""), [recording, setRecording] = useState(false)
  const canManage = context.canAccess(["measurements.manage"])
  async function load() {
    if (!context.organizationId || !context.branchId) return
    setLoading(true); setError("")
    try { setSessions(await loadCoachingPages(`/organizations/${context.organizationId}/measurement-sessions?branchId=${context.branchId}&limit=100${memberId ? `&memberId=${memberId}` : ""}`)) }
    catch (reason) { setError(humanError(reason, "تعذر تحميل القياسات.")) } finally { setLoading(false) }
  }
  useEffect(() => { const frame = requestAnimationFrame(() => void load()); return () => cancelAnimationFrame(frame) }, [context.organizationId, context.branchId, memberId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!context.canAccess(["members.read"]) || !context.branchId) return; const controller = new AbortController(); void loadCoachingPages(`/organizations/${context.organizationId}/members?branchId=${context.branchId}&limit=100`, controller.signal).then(setMembers).catch(() => undefined); return () => controller.abort() }, [context.organizationId, context.branchId]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="space-y-5"><header className="flex flex-wrap items-center gap-4 rounded-3xl border bg-card p-6"><div><Badge variant="outline">متابعة التقدم</Badge><h1 className="mt-3 text-2xl font-black">سجل قياسات المتدربين</h1><p className="mt-2 text-sm text-muted-foreground">جلسات القياس التاريخية للفرع الحالي، مع الاحتفاظ بوحدات القياس والقيم المسجلة.</p></div><div className="mr-auto flex gap-2">{canManage && <Button onClick={() => setRecording(true)} disabled={!members.length}><Plus/>تسجيل جلسة قياس</Button>}<Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw/>تحديث</Button></div></header><div className="max-w-md"><CoachingField label="تصفية القياسات حسب المتدرب"><select className={coachingSelectClass} value={memberId} onChange={e => setMemberId(e.target.value)}><option value="">كل المتدربين</option>{members.map(row => <option key={String(row.id)} value={String(row.id)}>{String(row.name)} — {String(row.memberNumber)}</option>)}</select></CoachingField></div>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}{loading ? <Loader2 className="mx-auto animate-spin"/> : sessions.map(row => <Card key={String(row.id)}><CardContent className="p-5"><div className="flex flex-wrap gap-3"><h2 className="font-bold">{String(members.find(member => member.id === row.memberId)?.name ?? "متدرب")}</h2><Badge variant="outline" className="mr-auto">{coachingDate(row.measuredAt)}</Badge></div><div className="mt-4 flex flex-wrap gap-3">{coachingList(row.values).map(value => <span key={String(value.id)} className="rounded-xl border px-4 py-3 text-sm"><strong>{String(value.typeNameSnapshot ?? value.typeName)}:</strong> {String(value.value)} {String(value.unitSnapshot ?? value.unit)}</span>)}</div>{Boolean(row.notes) && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{String(row.notes)}</p>}</CardContent></Card>)}{!loading && !sessions.length && <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">لا توجد جلسات قياس في هذا النطاق.</p>}{recording && <CoachingMeasurementDialog staff organizationId={context.organizationId} branchId={context.branchId} members={members.filter(row => row.status === "ACTIVE")} initialMemberId={memberId} onClose={() => setRecording(false)} onSaved={() => { setRecording(false); void load() }}/>}</div>
}
