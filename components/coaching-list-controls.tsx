"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { useCoachingPage } from "@/lib/use-coaching-page"
import type { CoachingRow } from "@/lib/coaching"
import { TrainerMemberPicker } from "@/components/trainer-member-picker"
import { CoachingField, coachingSelectClass } from "@/components/coaching-ui"
import { Button } from "@/components/ui/button"

export function CoachingPageMore({ page, label = "عرض المزيد" }: { page: { rows: CoachingRow[]; loading: boolean; hasMore: boolean; error: string; loadMore: () => Promise<void>; reload: () => void }; label?: string }) {
  return <div className="space-y-3">{page.error && <div role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{page.error}{!page.rows.length && <Button type="button" variant="outline" size="sm" onClick={page.reload}>إعادة المحاولة</Button>}</div>}{page.hasMore && <Button type="button" variant="outline" disabled={page.loading} onClick={() => void page.loadMore()}>{page.loading && <Loader2 className="animate-spin" />}{label}</Button>}</div>
}

export function CoachingMemberChoice({ organizationId, branchId, value, name, onChange, label = "المتدرب", activeOnly = true, disabled = false }: { organizationId: string; branchId: string; value: string; name?: string; onChange: (row: CoachingRow | undefined) => void; label?: string; activeOnly?: boolean; disabled?: boolean }) {
  const [choosing, setChoosing] = useState(false)
  return <div className="space-y-2"><p className="text-sm font-semibold">{label}</p><div className="flex flex-wrap items-center gap-2"><span className="text-sm">{value ? name || "المتدرب المحدد" : activeOnly ? "لم يتم اختيار متدرب" : "كل المتدربين"}</span>{!disabled && <><Button type="button" size="sm" variant="outline" onClick={() => setChoosing(current => !current)}>{choosing ? "إغلاق اختيار المتدرب" : "اختيار المتدرب"}</Button>{value && <Button type="button" size="sm" variant="ghost" onClick={() => { onChange(undefined); setChoosing(false) }}>مسح اختيار المتدرب</Button>}</>}</div>{choosing && <TrainerMemberPicker key={`${organizationId}:${branchId}`} organizationId={organizationId} branchId={branchId} selectedId={value} activeOnly={activeOnly} onSelect={row => { onChange(row); if (row) setChoosing(false) }} />}</div>
}

export function CoachingRemoteSelect({ path, label, value, onChange, initial, kind = "name", emptyLabel = "اختر" }: { path: string; label: string; value: string; onChange: (row: CoachingRow | undefined) => void; initial?: CoachingRow; kind?: string; emptyLabel?: string }) {
  const page = useCoachingPage(path)
  const activeRows = page.rows.filter(row => row.status === "ACTIVE")
  const rows = initial && !activeRows.some(row => row.id === initial.id) ? [initial, ...activeRows] : activeRows
  return <div className="space-y-2"><CoachingField label={label}><select className={coachingSelectClass} value={value} onChange={event => onChange(rows.find(row => row.id === event.target.value))}><option value="">{emptyLabel}</option>{rows.map(row => <option key={String(row.id)} value={String(row.id)}>{String(row[kind] ?? row.name ?? row.id)}</option>)}</select></CoachingField>{page.initialLoading && <p role="status" className="text-xs">جارٍ تحميل الاختيارات…</p>}<CoachingPageMore page={page} label={`عرض المزيد: ${label}`} /></div>
}
