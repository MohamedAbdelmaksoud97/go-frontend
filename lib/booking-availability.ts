export type AvailabilityRule = Record<string, unknown>

export function availabilityRuleLabel(rule: AvailabilityRule) {
  const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
  const day = days[Number(rule.dayOfWeek)] ?? "يوم غير محدد"
  const period = `${day}: ${String(rule.startLocal ?? "").slice(0, 5)} – ${String(rule.endLocal ?? "").slice(0, 5)}`
  const validity = rule.validFrom ? ` · من ${String(rule.validFrom).slice(0, 10)}${rule.validUntil ? ` حتى ${String(rule.validUntil).slice(0, 10)}` : " دون تاريخ انتهاء"}` : ""
  return period + validity
}

export function bookingSlotPeriod(slot: AvailabilityRule, timezone = "Asia/Riyadh") {
  const start = new Date(String(slot.startsAt)); const end = new Date(String(slot.endsAt))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "موعد غير صالح"
  const date = new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeZone: timezone })
  const time = new Intl.DateTimeFormat("ar-SA", { timeStyle: "short", timeZone: timezone })
  return `${date.format(start)} · ${time.format(start)} – ${time.format(end)}`
}
