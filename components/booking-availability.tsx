import { Clock3 } from "lucide-react"
import { availabilityRuleLabel, type AvailabilityRule } from "@/lib/booking-availability"

export function BookingAvailability({ rules, timezone }: { rules?: AvailabilityRule[]; timezone?: string }) {
  return <section className="mt-4 rounded-2xl border bg-secondary/30 p-4" aria-label="فترات الإتاحة">
    <h3 className="flex items-center gap-2 text-sm font-black"><Clock3 className="size-4 text-primary" />فترات الإتاحة</h3>
    {rules === undefined ? <p role="alert" className="mt-2 text-xs text-destructive">لم تصل بيانات الإتاحة. حدّث الصفحة بعد تحديث الخادم.</p>
      : !rules.length ? <p className="mt-2 text-xs text-muted-foreground">لا توجد فترات إتاحة سارية أو قادمة لهذا المورد.</p>
      : <ul className="mt-3 space-y-2 text-xs leading-6">{rules.map((rule, index) => <li key={String(rule.id ?? index)} className="rounded-xl bg-background px-3 py-2">{availabilityRuleLabel(rule)}</li>)}</ul>}
    <p className="mt-3 text-xs leading-6 text-muted-foreground">الساعات بتوقيت الفرع{timezone ? ` (${timezone})` : ""}. هذه فترات التشغيل، وليست ضمانًا لشغور الوقت؛ يتحقق النظام من الحجوزات والحجب عند التأكيد.</p>
  </section>
}
