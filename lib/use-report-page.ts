"use client"

import { useEffect, useRef, useState } from "react"
import { apiRequest } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

export type ReportRow = Record<string, string | number | boolean | null>
export type ReportSummary = {
  totalRows: number
  sums: Record<string, string>
  counts: Record<string, number>
  options: Record<string, ReportRow[]>
  treasurySources?: TreasurySourceSummary[]
  paymentMethods?: { method: string; received: number; refunded: number; net: number }[]
}
export type TreasurySourceSummary = { source: string; gross: number; netBeforeTax: number; tax: number; discount: number; entries: number; received: number; refunded: number; outstanding: number; methods: { method: string; received: number; refunded: number; net: number }[] }
type State = { key: string; rows: ReportRow[]; summary?: ReportSummary; asOf: string | null; loading: boolean; error: string; hasMore: boolean }
const empty = (key: string, loading: boolean): State => ({ key, rows: [], asOf: null, loading, error: "", hasMore: false })
export const REPORT_PAGE_SIZE = 50

export function useReportPage(path: string | null, authorizationKey: string, page: number) {
  const scope = `${authorizationKey}:${path}`
  const [revision, setRevision] = useState(0)
  const requestScope = `${scope}:${revision}`
  const key = `${requestScope}:${page}`
  const summaries = useRef(new Map<string, ReportSummary>())
  const previousScope = useRef("")
  const [state, setState] = useState<State>(() => empty(key, Boolean(path)))
  const current = state.key === key ? state : empty(key, Boolean(path))
  useEffect(() => {
    const controller = new AbortController()
    const sameScope = previousScope.current === requestScope
    previousScope.current = requestScope
    const cached = sameScope ? summaries.current.get(scope) : undefined
    const timer = window.setTimeout(async () => {
      setState(empty(key, Boolean(path)))
      if (!path) return
      try {
        const params = new URL(path, "http://internal")
        params.searchParams.set("view", "PAGE")
        params.searchParams.set("limit", String(REPORT_PAGE_SIZE))
        params.searchParams.set("offset", String((page - 1) * REPORT_PAGE_SIZE))
        params.searchParams.set("includeSummary", cached ? "false" : "true")
        const response = await apiRequest<ReportRow[]>(`${params.pathname}${params.search}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        const summary = response.meta?.summary as ReportSummary | undefined ?? cached
        if (!summary) throw new Error("تعذر تحميل ملخص التقرير. حاول مجددًا.")
        summaries.current.clear()
        summaries.current.set(scope, summary)
        setState({ key, rows: response.data, summary, asOf: String(response.meta?.asOf ?? "") || null, loading: false, error: "", hasMore: response.meta?.hasMore === true })
      } catch (reason) {
        if (!controller.signal.aborted) setState({ ...empty(key, false), error: humanError(reason, "تعذر إعداد التقرير للفترة والفلاتر المحددة.") })
      }
    }, 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [key, path, scope, page, requestScope])
  return { ...current, reload: () => setRevision(value => value + 1) }
}

// Full detail is fetched only in response to an explicit export/print action.
// Never publish a partial file after a failed or cancelled page.
export async function reportExportRows(path: string, signal: AbortSignal, onProgress?: (count: number) => void) {
  const rows: ReportRow[] = []
  const size = 1000
  for (let offset = 0; ; offset += size) {
    signal.throwIfAborted()
    const url = new URL(path, "http://internal")
    url.searchParams.set("view", "PAGE")
    url.searchParams.set("includeSummary", "false")
    url.searchParams.set("limit", String(size))
    url.searchParams.set("offset", String(offset))
    const response = await apiRequest<ReportRow[]>(`${url.pathname}${url.search}`, { signal })
    signal.throwIfAborted()
    if (typeof response.meta?.hasMore !== "boolean") throw new Error("تعذر التأكد من اكتمال التقرير. حدّث الصفحة وحاول مجددًا.")
    rows.push(...response.data)
    onProgress?.(rows.length)
    if (response.meta?.hasMore === false || response.data.length < size) return rows
  }
}
