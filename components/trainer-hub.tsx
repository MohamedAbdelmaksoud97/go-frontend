"use client"

import { useState } from "react"
import { Dumbbell, ShieldCheck, UserRoundCog } from "lucide-react"
import { TrainerAssignmentManager } from "@/components/trainer-assignment-manager"
import { TrainerWorkspace } from "@/components/trainer-workspace"
import { useAppContext } from "@/components/app-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type Mode = "management" | "workspace"

export function TrainerHub() {
  const context = useAppContext()
  const canManage = context.canAccess(["coaching.assignments.manage"])
  const employee = context.self.employees?.find(item => item.organizationId === context.organizationId)
  const hasTrainerProfile = Boolean(employee?.trainerProfileId)
  const [chosenMode, setMode] = useState<Mode | null>(null)
  const mode = chosenMode ?? (canManage ? "management" : "workspace")

  if (canManage) {
    return <div className="space-y-5">
      {hasTrainerProfile && <div className="flex flex-wrap gap-2" aria-label="اختيار مساحة التدريب">
        <Button variant={mode === "management" ? "default" : "outline"} onClick={() => setMode("management")}><UserRoundCog />إدارة تعيينات المدربين</Button>
        <Button variant={mode === "workspace" ? "default" : "outline"} onClick={() => setMode("workspace")}><Dumbbell />مساحتي كمدرب</Button>
      </div>}
      {mode === "management" || !hasTrainerProfile ? <TrainerAssignmentManager /> : <TrainerWorkspace />}
    </div>
  }

  if (!hasTrainerProfile) {
    return <Card className="mx-auto max-w-3xl border-primary/20">
      <CardContent className="p-8 text-center sm:p-12">
        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-primary/10 text-primary"><ShieldCheck className="size-8" /></span>
        <Badge className="mt-5" variant="outline">إعداد حساب المدرب</Badge>
        <h1 className="mt-3 text-2xl font-black">حسابك غير مرتبط بملف مدرب بعد</h1>
        <p className="mx-auto mt-3 max-w-xl leading-7 text-muted-foreground">اطلب من مدير الفرع إنشاء ملف مدرب لك وربطه بملفك الوظيفي، ثم تعيينك للفرع. بعد ذلك ستظهر هنا قائمة المتدربين والجدول وخطط التدريب.</p>
      </CardContent>
    </Card>
  }

  return <TrainerWorkspace />
}
