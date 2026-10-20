"use client"

import { useState } from "react"
import { Dumbbell, Loader2, Plus, RefreshCw } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { useToast } from "@/components/toast-provider"
import { useCoachingPage, useCoachingSearch } from "@/lib/use-coaching-page"
import { CoachingPageMore } from "@/components/coaching-list-controls"
import { CoachingPlanEditor } from "@/components/coaching-plan-editor"
import { CoachingPlanExercises } from "@/components/coaching-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { apiRequest } from "@/lib/api-client"
import { coachingDate, type CoachingRow } from "@/lib/coaching"
import { humanError } from "@/lib/human-errors"

export function CoachingProgramsManager() {
  const context = useAppContext(), toast = useToast()
  const canManage = context.canAccessOrganization(["coaching.training-plans.manage"])
  const [tab, setTab] = useState<"plans" | "templates">("plans")
  const [busy, setBusy] = useState(""), [query, setQuery] = useState("")
  const [editor, setEditor] = useState<{ template: boolean; row?: CoachingRow }>()
  const base = `/organizations/${context.organizationId}`
  const search = useCoachingSearch(query)
  const page = useCoachingPage(context.organizationId ? `${base}/${tab === "plans" ? "member-training-plans" : "training-plan-templates"}?limit=50${search ? `&q=${encodeURIComponent(search)}` : ""}` : null)
  const { rows, initialLoading: loading, error } = page
  const load = page.reload
  async function transition(row: CoachingRow, status: string) {
    setBusy(String(row.id))
    try {
      await apiRequest(`${base}/${tab === "plans" ? "member-training-plans" : "training-plan-templates"}/${row.id}`, { method: "PATCH", body: JSON.stringify({ expectedVersion: Number(row.version), status }) })
      toast.success("تم حفظ حالة الخطة."); load()
    } catch (reason) { toast.error(humanError(reason, "تعذر تغيير حالة الخطة.")) } finally { setBusy("") }
  }

  return <div className="space-y-5"><header className="flex flex-wrap items-center gap-4 rounded-3xl border bg-card p-6"><div><Badge variant="outline">إدارة البرامج</Badge><h1 className="mt-3 text-2xl font-black">خطط التدريب والقوالب</h1><p className="mt-2 text-sm text-muted-foreground">إعداد البرامج ومتابعة حالاتها مع حفظ تقدم المتدربين.</p></div><div className="mr-auto flex gap-2">{canManage && <Button onClick={() => setEditor({ template: tab === "templates" })}><Plus />{tab === "plans" ? "خطة تدريب جديدة" : "قالب تدريب جديد"}</Button>}<Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw />تحديث</Button></div></header><div className="flex flex-wrap gap-3"><Button variant={tab === "plans" ? "default" : "outline"} onClick={() => setTab("plans")}>خطط الأعضاء</Button><Button variant={tab === "templates" ? "default" : "outline"} onClick={() => setTab("templates")}>قوالب التدريب</Button><Input className="sm:mr-auto sm:max-w-sm" aria-label="البحث في خطط التدريب" placeholder="اسم الخطة أو العضو أو رمز القالب" maxLength={160} value={query} onChange={e => setQuery(e.target.value)}/></div>{error && <p role="alert" className="rounded-xl bg-red-500/10 p-4 text-red-600">{error}</p>}{loading ? <div className="grid min-h-48 place-items-center"><Loader2 className="animate-spin"/></div> : rows.map(row => <Card key={String(row.id)} data-testid={`training-program-${row.id}`}><CardContent className="p-5"><div className="flex flex-wrap items-start gap-3"><div><h2 className="flex items-center gap-2 font-black"><Dumbbell className="size-4 text-primary"/>{String(row.name)}</h2><p className="mt-2 text-xs text-muted-foreground">{String(tab === "templates" ? row.code : row.memberName ?? row.memberNumber ?? "عضو")}{row.startsOn ? ` · ${coachingDate(row.startsOn)} — ${coachingDate(row.endsOn) || "دون نهاية"}` : ""}</p>{Boolean(row.goal) && <p className="mt-2 text-sm">{String(row.goal)}</p>}</div><Badge variant="outline" className="mr-auto">{({ DRAFT: "مسودة", ACTIVE: "نشط", COMPLETED: "مكتمل", CANCELLED: "ملغى", INACTIVE: "غير نشط" } as Record<string, string>)[String(row.status)]}</Badge></div>{canManage && (tab === "templates" || ["DRAFT", "ACTIVE"].includes(String(row.status))) && <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setEditor({ template: tab === "templates", row })}>تعديل</Button>{tab === "templates" ? <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => void transition(row, row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>{row.status === "ACTIVE" ? "إيقاف القالب" : "تفعيل القالب"}</Button> : <>{row.status === "DRAFT" && <Button size="sm" disabled={busy === row.id} onClick={() => void transition(row, "ACTIVE")}>تفعيل الخطة</Button>}{row.status === "ACTIVE" && <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => void transition(row, "COMPLETED")}>إنهاء الخطة كمكتملة</Button>}<Button size="sm" variant="destructive" disabled={busy === row.id} onClick={() => void transition(row, "CANCELLED")}>إلغاء الخطة</Button></>}</div>}<CoachingPlanExercises plan={row}/></CardContent></Card>)}{!loading && !rows.length && <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">لا توجد خطط مطابقة.</p>}<CoachingPageMore page={page} label={tab === "plans" ? "عرض المزيد من الخطط" : "عرض المزيد من القوالب"}/>{editor && <CoachingPlanEditor organizationId={context.organizationId} branchId={context.branchId} members={[]} staff templateMode={editor.template} existing={editor.row} onClose={() => setEditor(undefined)} onSaved={() => { setEditor(undefined); void load() }}/>}</div>
}
