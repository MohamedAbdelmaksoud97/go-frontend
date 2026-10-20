"use client"

import { useEffect, useId, useRef, useState } from "react"
import { CheckCircle2, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiRequest } from "@/lib/api-client"
import { coachingList } from "@/lib/coaching"
import { humanError } from "@/lib/human-errors"

type MemberOption = { id: string; name: string; memberNumber: string; phoneE164?: string; nationalId?: string }

async function memberPage(organizationId: string, branchId: string, search: string, signal: AbortSignal, cursor?: string) {
  const query = new URLSearchParams({ branchId, status: "ACTIVE", limit: "50" })
  if (search) query.set("search", search)
  if (cursor) query.set("cursor", cursor)
  const response = await apiRequest<unknown>(`/organizations/${organizationId}/members?${query}`, { signal })
  if (cursor && response.meta?.nextCursor === cursor) throw new Error("تعذر تحميل المزيد من الأعضاء. حاول البحث بالاسم أو رقم العضوية.")
  const members = coachingList(response.data).filter(row => row.status === "ACTIVE").map(row => ({
    id: String(row.id), name: String(row.name), memberNumber: String(row.memberNumber ?? "—"),
    ...(row.phoneE164 ? { phoneE164: String(row.phoneE164) } : {}),
    ...(row.nationalId ? { nationalId: String(row.nationalId) } : {}),
  }))
  return { members, nextCursor: response.meta?.nextCursor }
}

export function TrainerMemberPicker({ organizationId, branchId, selectedId, onSelect }: { organizationId: string; branchId: string; selectedId: string; onSelect: (member: MemberOption | undefined) => void }) {
  const inputId = useId()
  const [query, setQuery] = useState("")
  const [members, setMembers] = useState<MemberOption[]>([])
  const [nextCursor, setNextCursor] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const request = useRef<AbortController | null>(null)
  const search = query.trim()

  useEffect(() => {
    const controller = new AbortController()
    request.current = controller
    const timer = window.setTimeout(async () => {
      setMembers([]); setNextCursor(undefined); setError(""); setLoadingMore(false)
      if (search.length === 1) { setLoading(false); return }
      setLoading(true)
      try {
        const page = await memberPage(organizationId, branchId, search, controller.signal)
        if (!controller.signal.aborted) { setMembers(page.members); setNextCursor(page.nextCursor) }
      } catch (reason) {
        if (!controller.signal.aborted) setError(humanError(reason, "تعذر تحميل الأعضاء. حاول مرة أخرى."))
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }, search ? 300 : 0)
    return () => { window.clearTimeout(timer); controller.abort(); if (request.current === controller) request.current = null }
  }, [organizationId, branchId, search, retry])

  async function loadMore() {
    const controller = request.current
    if (!nextCursor || !controller || controller.signal.aborted || loading || loadingMore) return
    setLoadingMore(true); setError("")
    try {
      const page = await memberPage(organizationId, branchId, search, controller.signal, nextCursor)
      if (!controller.signal.aborted) {
        setMembers(current => [...current, ...page.members.filter(row => !current.some(member => member.id === row.id))])
        setNextCursor(page.nextCursor)
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError(humanError(reason, "تعذر تحميل المزيد من الأعضاء. حاول مرة أخرى."))
    } finally { if (!controller.signal.aborted) setLoadingMore(false) }
  }

  return <div className="space-y-3">
    <div><label htmlFor={inputId} className="mb-2 block font-bold">ابحث عن العضو</label><div className="relative"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id={inputId} value={query} onChange={event => {
      const nextQuery = event.target.value
      setQuery(nextQuery)
      if (nextQuery.trim() === search) return
      request.current?.abort(); onSelect(undefined)
      setMembers([]); setNextCursor(undefined); setError(""); setLoading(true); setLoadingMore(false)
    }} placeholder="الاسم أو رقم العضوية أو الجوال أو رقم الهوية" className="pr-10" /></div></div>
    <p className="text-xs leading-6 text-muted-foreground">نعرض الأعضاء على دفعات من 50 عضوًا. ابحث للوصول إلى أي عضو في الفرع.</p>
    {error && <div role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{error}{!members.length && <Button type="button" variant="outline" size="sm" className="mr-3" onClick={() => setRetry(value => value + 1)}>إعادة المحاولة</Button>}</div>}
    <div className="max-h-72 space-y-1 overflow-y-auto rounded-2xl border p-2" aria-busy={loading || loadingMore}>
      {loading ? <Loader2 aria-label="جارٍ تحميل الأعضاء" className="mx-auto my-5 animate-spin text-primary" /> : members.map(member => <button key={member.id} type="button" aria-pressed={selectedId === member.id} onClick={() => onSelect(member)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-right ${selectedId === member.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}><span><span className="block font-black">{member.name}</span><span className="mt-1 block text-[11px] opacity-70" dir="ltr">{member.phoneE164 ?? member.nationalId ?? ""}</span></span><span className="mr-auto text-xs opacity-75">{member.memberNumber}</span>{selectedId === member.id && <CheckCircle2 className="size-4" />}</button>)}
      {!loading && !error && !members.length && <p role="status" className="p-5 text-center text-sm text-muted-foreground">{search.length === 1 ? "اكتب حرفين على الأقل للبحث." : "لا توجد نتائج مطابقة في الفرع الحالي."}</p>}
      {!loading && nextCursor && <Button type="button" variant="outline" className="mt-2 w-full" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore && <Loader2 className="animate-spin" />}عرض المزيد من الأعضاء</Button>}
    </div>
  </div>
}
