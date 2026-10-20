"use client"

import { useState } from "react"
import { Dumbbell, ShieldCheck, UserRoundCog } from "lucide-react"
import { TrainerAssignmentManager } from "@/components/trainer-assignment-manager"
import { TrainerConfigurationManager } from "@/components/trainer-configuration-manager"
import { CoachingProgramsManager } from "@/components/coaching-programs-manager"
import { CoachingCommissionsManager } from "@/components/coaching-commissions-manager"
import { CoachingMeasurementsManager } from "@/components/coaching-measurements-manager"
import Link from "next/link"
import { TrainerWorkspace } from "@/components/trainer-workspace"
import { useAppContext } from "@/components/app-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type Mode = "management" | "configuration" | "workspace" | "programs" | "commissions" | "measurements"

export function TrainerHub() {
  const context = useAppContext()
  const canManageAssignments = context.canAccess(["coaching.assignments.manage"])
  const canConfigure = context.canAccess(["coaching.read", "coaching.manage", "coaching.schedule.manage"])
  const canPrograms = context.canAccessOrganization(["coaching.training-plans.read"])
  const canCommissions = context.canAccess(["coaching.commissions.read"])
  const canMeasurements = context.canAccess(["measurements.read"])
  const canManage = canManageAssignments || canConfigure || canPrograms || canCommissions || canMeasurements
  const employee = context.self.employees?.find(item => item.organizationId === context.organizationId)
  const hasTrainerProfile = Boolean(employee?.trainerProfileId)
  const [chosenMode, setMode] = useState<Mode | null>(null)
  const mode = chosenMode ?? (hasTrainerProfile && !canManageAssignments && !context.canAccessOrganization(["coaching.manage"]) ? "workspace" : canManageAssignments ? "management" : canConfigure ? "configuration" : canPrograms ? "programs" : canMeasurements ? "measurements" : canCommissions ? "commissions" : "workspace")

  if (canManage) {
    return <div className="space-y-5">
      <div className="flex flex-wrap gap-2" aria-label="اختيار مساحة التدريب">
        {canManageAssignments && <Button variant={mode === "management" ? "default" : "outline"} onClick={() => setMode("management")}><UserRoundCog />تعيينات المدربين</Button>}
        {canConfigure && <Button variant={mode === "configuration" ? "default" : "outline"} onClick={() => setMode("configuration")}><ShieldCheck />ملفات المدربين والجداول</Button>}
        {canPrograms && <Button variant={mode === "programs" ? "default" : "outline"} onClick={() => setMode("programs")}><Dumbbell />الخطط والقوالب</Button>}
        {canMeasurements && <Button variant={mode === "measurements" ? "default" : "outline"} onClick={() => setMode("measurements")}>القياسات</Button>}
        {canCommissions && <Button variant={mode === "commissions" ? "default" : "outline"} onClick={() => setMode("commissions")}>قواعد العمولات</Button>}
        {hasTrainerProfile && <Button variant={mode === "workspace" ? "default" : "outline"} onClick={() => setMode("workspace")}><Dumbbell />مساحتي كمدرب</Button>}
      <Link href="/guide/coaching" className="mr-auto self-center text-sm font-bold text-primary">دليل التدريب والمدربين</Link>
      </div>
      {mode === "configuration" ? <TrainerConfigurationManager /> : mode === "management" ? <TrainerAssignmentManager /> : mode === "programs" ? <CoachingProgramsManager /> : mode === "measurements" ? <CoachingMeasurementsManager /> : mode === "commissions" ? <CoachingCommissionsManager /> : <TrainerWorkspace />}
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
