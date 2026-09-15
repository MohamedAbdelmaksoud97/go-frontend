import assert from "node:assert/strict"
import { test } from "node:test"
import { availabilityRuleLabel, bookingSlotPeriod } from "../lib/booking-availability.ts"

test("availability periods include day, hours and date boundaries", () => {
  assert.equal(availabilityRuleLabel({ dayOfWeek: 0, startLocal: "08:00:00", endLocal: "22:00:00", validFrom: "2026-09-16", validUntil: "2026-12-31" }), "الأحد: 08:00 – 22:00 · من 2026-09-16 حتى 2026-12-31")
  assert.match(availabilityRuleLabel({ dayOfWeek: 6, startLocal: "10:00", endLocal: "12:00", validFrom: "2026-01-01" }), /السبت.*دون تاريخ انتهاء/)
})
test("session choice includes both endpoints in the branch timezone", () => {
  const slot = { startsAt: "2026-09-16T05:00:00Z", endsAt: "2026-09-16T06:00:00Z" }
  const value = bookingSlotPeriod(slot)
  const formatter = new Intl.DateTimeFormat("ar-SA", { timeStyle: "short", timeZone: "Asia/Riyadh" })
  assert.ok(value.includes(formatter.format(new Date(slot.startsAt))))
  assert.ok(value.includes(formatter.format(new Date(slot.endsAt))))
  assert.equal(bookingSlotPeriod({}), "موعد غير صالح")
})
