const DAY_MS = 86_400_000

type RecordValue = Record<string, unknown>

export type SubscriptionFreezePolicyView = {
  available: boolean
  allowed: boolean
  maxDaysPerFreeze: number
  maxFreezesPerTerm: number
  minimumActiveDaysBeforeFreeze: number
  usedFreezes: number
  remainingFreezes: number
  activeDays: number
  remainingActiveDays: number
  recommendedDays: number
  message: string
}

export function subscriptionFreezePolicy(record: RecordValue, at = new Date()): SubscriptionFreezePolicyView {
  const configuration = capturedFreezeConfiguration(record)
  const maxDaysPerFreeze = integer(configuration?.maxDaysPerFreeze)
  const maxFreezesPerTerm = integer(configuration?.maxFreezesPerTerm)
  const minimumActiveDaysBeforeFreeze = integer(configuration?.minimumActiveDaysBeforeFreeze)
  const usedFreezes = array(record.freezePeriods).length
  const activeDays = totalActiveDays(record.accessPeriods, at)

  if (maxDaysPerFreeze === undefined || maxFreezesPerTerm === undefined || minimumActiveDaysBeforeFreeze === undefined) {
    return unavailable("لا توجد سياسة تجميد صالحة محفوظة مع هذا الاشتراك.", usedFreezes, activeDays)
  }

  const remainingFreezes = Math.max(0, maxFreezesPerTerm - usedFreezes)
  const remainingActiveDays = Math.max(0, minimumActiveDaysBeforeFreeze - activeDays)
  const recommendedDays = Math.max(1, Math.min(7, maxDaysPerFreeze || 1))
  const status = String(record.status ?? "").toUpperCase()
  let allowed = true
  let message = `الحد الأقصى ${maxDaysPerFreeze} يوم في المرة، والمتبقي ${remainingFreezes} من ${maxFreezesPerTerm} مرات.`

  if (!["ACTIVE", "ACTIVE_PROVISIONAL"].includes(status)) {
    allowed = false
    message = "حالة الاشتراك الحالية لا تسمح ببدء تجميد جديد."
  } else if (maxDaysPerFreeze < 1 || remainingFreezes < 1) {
    allowed = false
    message = "تم استنفاد مرات التجميد المسموحة في سياسة هذا الاشتراك."
  } else if (remainingActiveDays > 0) {
    allowed = false
    message = `يتبقى ${remainingActiveDays} يوم نشاط قبل السماح بالتجميد وفق السياسة.`
  }

  return {
    available: true,
    allowed,
    maxDaysPerFreeze,
    maxFreezesPerTerm,
    minimumActiveDaysBeforeFreeze,
    usedFreezes,
    remainingFreezes,
    activeDays,
    remainingActiveDays,
    recommendedDays,
    message,
  }
}

function capturedFreezeConfiguration(record: RecordValue): RecordValue | undefined {
  const snapshot = object(record.policySnapshot)
  const policy = array(snapshot?.policies).map(object).find(item => String(item?.policyType ?? "").toUpperCase() === "FREEZE")
  return object(policy?.configuration)
}

function totalActiveDays(value: unknown, at: Date): number {
  const until = at.getTime()
  const milliseconds = array(value).map(object).reduce((total, period) => {
    const startsAt = new Date(String(period?.startsAt ?? "")).getTime()
    const endsAt = new Date(String(period?.endsAt ?? "")).getTime()
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return total
    return total + Math.max(0, Math.min(until, endsAt) - startsAt)
  }, 0)
  return Math.floor(milliseconds / DAY_MS)
}

function unavailable(message: string, usedFreezes: number, activeDays: number): SubscriptionFreezePolicyView {
  return { available: false, allowed: false, maxDaysPerFreeze: 0, maxFreezesPerTerm: 0, minimumActiveDaysBeforeFreeze: 0, usedFreezes, remainingFreezes: 0, activeDays, remainingActiveDays: 0, recommendedDays: 1, message }
}

function integer(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function object(value: unknown): RecordValue | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined }
