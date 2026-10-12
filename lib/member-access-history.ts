import type { GateAccessEvent } from "@/lib/access-event"

export type MemberAttendanceAttempt = {
  id: string
  branchId: string
  attemptedAt: string
  accessMethod: string
  decision: "ACCEPTED" | "REJECTED"
  rejectionReason?: string
  subscriptionId?: string
}

export type MemberAccessEntry = {
  id: string
  occurredAt: string
  branchId?: string
  attempt?: MemberAttendanceAttempt
  event?: GateAccessEvent
}

export function mergeMemberAccessHistory(attempts: MemberAttendanceAttempt[], events: GateAccessEvent[]): MemberAccessEntry[] {
  const attemptsById = new Map(attempts.map(attempt => [attempt.id, attempt]))
  const linkedAttempts = new Set(events.flatMap(event => event.attendanceAttemptId ? [event.attendanceAttemptId] : []))
  return [
    ...events.map(event => ({
      id: `device:${event.id}`, occurredAt: event.deviceOccurredAt, branchId: event.branchId, event,
      attempt: event.attendanceAttemptId ? attemptsById.get(event.attendanceAttemptId) : undefined,
    })),
    ...attempts.filter(attempt => !linkedAttempts.has(attempt.id)).map(attempt => ({
      id: `attendance:${attempt.id}`, occurredAt: attempt.attemptedAt, branchId: attempt.branchId, attempt,
    })),
  ].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || right.id.localeCompare(left.id))
}
