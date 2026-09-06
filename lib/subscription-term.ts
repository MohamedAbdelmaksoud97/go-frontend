type SubscriptionTermRecord = Record<string, unknown>

export function remainingSubscriptionDays(record: SubscriptionTermRecord, asOf = Date.now()) {
  const end = new Date(String(record.termEnd ?? record.endsAt ?? ""))
  if (!Number.isFinite(end.getTime())) return undefined

  const status = String(record.status ?? "").toUpperCase()
  if (["EXPIRED", "CANCELLED"].includes(status)) return 0

  return Math.max(0, Math.ceil((end.getTime() - asOf) / 86_400_000))
}

export function remainingSubscriptionDaysLabel(record: SubscriptionTermRecord, asOf = Date.now()) {
  const days = remainingSubscriptionDays(record, asOf)
  return days === undefined ? "—" : `${new Intl.NumberFormat("ar-SA").format(days)} يوم`
}
