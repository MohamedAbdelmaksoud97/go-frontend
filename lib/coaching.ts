import { apiRequest } from "@/lib/api-client"

export type CoachingRow = Record<string, unknown>
export function coachingList(value: unknown): CoachingRow[] { return Array.isArray(value) ? value : value && typeof value === "object" && "items" in value && Array.isArray(value.items) ? value.items : [] }
export async function loadCoachingPages(path: string, signal?: AbortSignal): Promise<CoachingRow[]> {
  const rows: CoachingRow[] = [], seen = new Set<string>()
  let cursor: string | undefined
  do {
    const url = new URL(path, "http://internal")
    if (cursor) url.searchParams.set("cursor", cursor)
    const response = await apiRequest<unknown>(`${url.pathname}${url.search}`, { signal })
    rows.push(...coachingList(response.data))
    cursor = response.meta?.nextCursor
    if (cursor && seen.has(cursor)) throw new Error("تعذر إكمال تحميل القائمة. حاول تحديث الصفحة.")
    if (cursor) seen.add(cursor)
  } while (cursor)
  return rows
}
export function coachingDate(value: unknown) { if (!value) return ""; return String(value).slice(0, 10) }
export function coachingLocalInstant(value: unknown) { const date = value ? new Date(String(value)) : new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }
export function coachingItems(value: unknown): CoachingRow[] { return coachingList(value).map((item, index) => ({ dayNumber: Number(item.dayNumber ?? 1), sequenceNumber: index + 1, exerciseName: String(item.exerciseName ?? ""), ...(item.sets ? { sets: Number(item.sets) } : {}), ...(item.repetitions ? { repetitions: String(item.repetitions) } : {}), ...(item.durationMinutes ? { durationMinutes: Number(item.durationMinutes) } : {}), ...(item.instructions ? { instructions: String(item.instructions) } : {}) })) }
