"use client"

import { Dialog } from "@base-ui/react/dialog"
import { cloneElement, isValidElement, useId } from "react"
import { CheckCircle2, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { coachingList, type CoachingRow } from "@/lib/coaching"

export function CoachingDialog({ title, description, children, onClose, busy = false }: { title: string; description: string; children: React.ReactNode; onClose: () => void; busy?: boolean }) {
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose() }}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-sm" /><div className="fixed inset-0 z-[101] flex items-center justify-center p-3 sm:p-6"><Dialog.Popup dir="rtl" className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border bg-card shadow-2xl outline-none"><header className="flex items-start gap-4 border-b p-5"><div><Dialog.Title className="text-xl font-black">{title}</Dialog.Title><Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">{description}</Dialog.Description></div><Button type="button" variant="ghost" size="icon" className="mr-auto shrink-0" onClick={onClose} disabled={busy} aria-label="إغلاق"><X /></Button></header><div className="overflow-y-auto p-5">{children}</div></Dialog.Popup></div></Dialog.Portal></Dialog.Root>
}
export function CoachingField({ label, children }: { label: string; children: React.ReactNode }) {
  const generatedId = useId()
  const control = isValidElement<{ id?: string }>(children) ? children : undefined
  const id = control?.props.id ?? generatedId
  return <div className="space-y-2 text-sm font-semibold"><label htmlFor={id} className="block">{label}</label>{control ? cloneElement(control, { id }) : children}</div>
}
export const coachingSelectClass = "h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary"
export const blankCoachingExercise = (): CoachingRow => ({ dayNumber: 1, exerciseName: "", sets: "", repetitions: "", durationMinutes: "", instructions: "" })

export function CoachingExerciseEditor({ items, onChange, disabled = false }: { items: CoachingRow[]; onChange: (items: CoachingRow[]) => void; disabled?: boolean }) {
  function update(index: number, patch: CoachingRow) { onChange(items.map((item, i) => i === index ? { ...item, ...patch } : item)) }
  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-black">تمارين الخطة</h3><Button type="button" variant="outline" disabled={disabled || items.length >= 100} onClick={() => onChange([...items, blankCoachingExercise()])}><Plus />إضافة تمرين</Button></div>{items.map((item, index) => <fieldset key={index} disabled={disabled} className="space-y-3 rounded-2xl border p-4"><legend className="px-2 text-xs font-bold">تمرين {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><CoachingField label={`اليوم ${index + 1}`}><Input type="number" min="1" max="365" required value={String(item.dayNumber ?? 1)} onChange={e => update(index, { dayNumber: Number(e.target.value) })} /></CoachingField><CoachingField label={`اسم التمرين ${index + 1}`}><Input required minLength={2} maxLength={200} value={String(item.exerciseName ?? "")} onChange={e => update(index, { exerciseName: e.target.value })} /></CoachingField><CoachingField label={`المجموعات ${index + 1}`}><Input type="number" min="1" value={String(item.sets ?? "")} onChange={e => update(index, { sets: e.target.value })} /></CoachingField><CoachingField label={`التكرارات ${index + 1}`}><Input maxLength={50} value={String(item.repetitions ?? "")} onChange={e => update(index, { repetitions: e.target.value })} /></CoachingField><CoachingField label={`المدة بالدقائق ${index + 1}`}><Input type="number" min="1" value={String(item.durationMinutes ?? "")} onChange={e => update(index, { durationMinutes: e.target.value })} /></CoachingField></div><CoachingField label={`تعليمات التمرين ${index + 1}`}><Input maxLength={2000} value={String(item.instructions ?? "")} onChange={e => update(index, { instructions: e.target.value })} /></CoachingField><Button type="button" size="sm" variant="ghost" disabled={items.length < 2} onClick={() => onChange(items.filter((_, i) => i !== index))}><Trash2 />حذف التمرين {index + 1}</Button></fieldset>)}</section>
}

export function CoachingPlanExercises({ plan, busy, onTransition }: { plan: CoachingRow; busy?: string; onTransition?: (item: CoachingRow, status: "COMPLETED" | "SKIPPED") => void }) {
  const items = coachingList(plan.items)
  return <div className="mt-4 grid gap-3 md:grid-cols-2">{items.map((item, index) => <div key={String(item.id ?? index)} className="rounded-2xl border p-4"><div className="flex items-start gap-3"><span className="rounded-xl bg-secondary px-3 py-2 text-xs font-bold">يوم {String(item.dayNumber)}</span><div className="min-w-0"><p className="font-bold">{String(item.exerciseName)}</p><p className="mt-1 text-xs text-muted-foreground">{[item.sets && `${item.sets} مجموعات`, item.repetitions && `${item.repetitions} تكرار`, item.durationMinutes && `${item.durationMinutes} دقيقة`].filter(Boolean).join(" · ")}</p>{Boolean(item.instructions) && <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{String(item.instructions)}</p>}</div><Badge variant="outline" className="mr-auto">{item.completionStatus === "COMPLETED" ? "مكتمل" : item.completionStatus === "SKIPPED" ? "لم يُنفذ" : "بانتظار التنفيذ"}</Badge></div>{onTransition && plan.status === "ACTIVE" && item.completionStatus === "PENDING" && <div className="mt-3 flex flex-wrap gap-2 border-t pt-3"><Button size="sm" disabled={busy === String(item.id)} onClick={() => onTransition(item, "COMPLETED")}><CheckCircle2 />تم تنفيذ التمرين</Button><Button size="sm" variant="outline" disabled={busy === String(item.id)} onClick={() => onTransition(item, "SKIPPED")}>لم أنفذ التمرين</Button></div>}</div>)}</div>
}
