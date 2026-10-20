"use client"

import { useState } from "react"
import { Loader2, Plus, RefreshCw } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { CoachingMeasurementDialog } from "@/components/coaching-measurement-dialog"
import { useCoachingPage } from "@/lib/use-coaching-page"
import { CoachingMemberChoice, CoachingPageMore } from "@/components/coaching-list-controls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { coachingDate, coachingList, type CoachingRow } from "@/lib/coaching"

export function CoachingMeasurementsManager() {
  const context = useAppContext()
  const [selectedMember, setSelectedMember] = useState<CoachingRow>()
  const [recording, setRecording] = useState(false)
  const memberId = String(selectedMember?.id ?? "")
  const canManage = context.canAccess(["measurements.manage"])
  const page = useCoachingPage(context.organizationId && context.branchId ? `/organizations/${context.organizationId}/measurement-sessions?branchId=${context.branchId}&limit=50${memberId ? `&memberId=${memberId}` : ""}` : null)
  const { rows: sessions, initialLoading: loading, error } = page
  const load = page.reload
  return <div className="space-y-5"><header className="flex flex-wrap items-center gap-4 rounded-3xl border bg-card p-6"><div><Badge variant="outline">متابعة التقدم</Badge><h1 className="mt-3 text-2xl font-black">سجل قياسات المتدربين</h1><p className="mt-2 text-sm text-muted-foreground">جلسات القياس التاريخية للفرع الحالي، مع الاحتفاظ بوحدات القياس والقيم المسجلة.</p></div><div className="mr-auto flex gap-2">{canManage && <Button onClick={() => setRecording(true)}><Plus/>تسجيل جلسة قياس</Button>}<Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw/>تحديث</Button></div></header><div className="max-w-md"><CoachingMemberChoice organizationId={context.organizationId} branchId={context.branchId} value={memberId} name={String(selectedMember?.name ?? "")} label="تصفية القياسات حسب المتدرب" activeOnly={false} onChange={setSelectedMember}/></div>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}{loading ? <Loader2 className="mx-auto animate-spin"/> : sessions.map(row => <Card key={String(row.id)}><CardContent className="p-5"><div className="flex flex-wrap gap-3"><h2 className="font-bold">{String(row.memberName ?? "متدرب")}</h2><Badge variant="outline" className="mr-auto">{coachingDate(row.measuredAt)}</Badge></div><div className="mt-4 flex flex-wrap gap-3">{coachingList(row.values).map(value => <span key={String(value.id)} className="rounded-xl border px-4 py-3 text-sm"><strong>{String(value.typeNameSnapshot ?? value.typeName)}:</strong> {String(value.value)} {String(value.unitSnapshot ?? value.unit)}</span>)}</div>{Boolean(row.notes) && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{String(row.notes)}</p>}</CardContent></Card>)}{!loading && !sessions.length && <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">لا توجد جلسات قياس في هذا النطاق.</p>}<CoachingPageMore page={page} label="عرض المزيد من القياسات"/>{recording && <CoachingMeasurementDialog staff organizationId={context.organizationId} branchId={context.branchId} members={selectedMember ? [selectedMember] : []} initialMemberId="" onClose={() => setRecording(false)} onSaved={() => { setRecording(false); void load() }}/>}</div>
}
