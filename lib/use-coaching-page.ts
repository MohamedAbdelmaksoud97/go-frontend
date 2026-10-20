"use client"

import { useEffect, useRef, useState } from "react"
import { apiRequest } from "@/lib/api-client"
import { coachingList, type CoachingRow } from "@/lib/coaching"
import { humanError } from "@/lib/human-errors"

type PageState = { path: string | null; rows: CoachingRow[]; cursor?: string; loading: boolean; error: string }
const empty = (path: string | null): PageState => ({ path, rows: [], loading: Boolean(path), error: "" })

// A cursor is followed only in response to an explicit user action.
export function useCoachingPage(path: string | null) {
  const [state, setState] = useState<PageState>(() => empty(path))
  const [revision, setRevision] = useState(0)
  const request = useRef<AbortController | null>(null)
  const pendingMore = useRef(false)
  const current = state.path === path ? state : empty(path)

  useEffect(() => {
    const controller = new AbortController()
    request.current = controller
    pendingMore.current = false
    const timer = window.setTimeout(async () => {
      setState(empty(path))
      if (!path) return
      try {
        const result = await readPage(path, controller.signal)
        if (!controller.signal.aborted) setState({ path, ...result, loading: false, error: "" })
      } catch (reason) {
        if (!controller.signal.aborted) setState({ ...empty(path), loading: false, error: humanError(reason, "تعذر تحميل القائمة. حاول مجددًا.") })
      }
    }, 0)
    return () => { window.clearTimeout(timer); controller.abort(); if (request.current === controller) request.current = null }
  }, [path, revision])

  async function loadMore() {
    const controller = request.current, cursor = current.cursor
    if (!path || !cursor || !controller || controller.signal.aborted || current.loading || pendingMore.current) return
    pendingMore.current = true
    setState(value => ({ ...value, loading: true, error: "" }))
    try {
      const result = await readPage(path, controller.signal, cursor)
      if (!controller.signal.aborted) setState(value => ({ path, rows: [...value.rows, ...result.rows.filter(row => !value.rows.some(old => old.id === row.id))], cursor: result.cursor, loading: false, error: "" }))
    } catch (reason) {
      if (!controller.signal.aborted) setState(value => ({ ...value, loading: false, error: humanError(reason, "تعذر تحميل المزيد. حاول مجددًا.") }))
    } finally { if (request.current === controller) pendingMore.current = false }
  }
  function reload() { request.current?.abort(); setRevision(value => value + 1) }
  return { ...current, initialLoading: current.loading && !current.rows.length, hasMore: Boolean(current.cursor), loadMore, reload }
}

async function readPage(path: string, signal: AbortSignal, cursor?: string) {
  const url = new URL(path, "http://internal")
  if (!url.searchParams.has("limit")) url.searchParams.set("limit", "50")
  if (cursor) url.searchParams.set("cursor", cursor)
  const response = await apiRequest<unknown>(`${url.pathname}${url.search}`, { signal })
  if (cursor && response.meta?.nextCursor === cursor) throw new Error("تعذر متابعة القائمة. حدّث البيانات وحاول مجددًا.")
  return { rows: coachingList(response.data), cursor: response.meta?.nextCursor }
}

export function useCoachingSearch(value: string) {
  const [search, setSearch] = useState(value.trim())
  useEffect(() => { const timer = window.setTimeout(() => setSearch(value.trim()), 300); return () => window.clearTimeout(timer) }, [value])
  return search
}
