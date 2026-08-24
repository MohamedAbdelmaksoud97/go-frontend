"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CreditCard, FileText, Loader2, Search, UserRound, Users, Zap } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { Input } from "@/components/ui/input"
import { apiRequest } from "@/lib/api-client"
import { cn } from "@/lib/utils"

type Row = Record<string, unknown>
type SearchResult = {
  key: string
  title: string
  subtitle: string
  href: string
  kind: "member" | "subscription" | "invoice" | "lead" | "employee"
}

const kindLabels: Record<SearchResult["kind"], string> = {
  member: "عضو",
  subscription: "اشتراك",
  invoice: "فاتورة",
  lead: "عميل محتمل",
  employee: "موظف",
}

export function GlobalSearch({ memberOnlyAccount }: { memberOnlyAccount: boolean }) {
  const context = useAppContext()
  const router = useRouter()
  const wrapper = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const normalized = query.trim()

  const sources = useMemo(() => {
    if (!context.organizationId || memberOnlyAccount) return []
    const organizationId = context.organizationId
    const branch = context.branchId ? `&branchId=${encodeURIComponent(context.branchId)}` : ""
    return [
      context.canAccess(["members.read"]) && {
        path: (value: string) => `/organizations/${organizationId}/members?search=${encodeURIComponent(value)}${branch}&limit=6`,
        map: (row: Row): SearchResult => ({ key: `member:${row.id}`, kind: "member", title: text(row.name ?? row.fullNameAr, "عضو"), subtitle: join([row.memberNumber, row.legacyMemberNumber && `الرقم القديم ${row.legacyMemberNumber}`, row.phoneE164]), href: `/members/${row.id}` }),
      },
      context.canAccess(["subscriptions.read"]) && {
        path: (value: string) => `/organizations/${organizationId}/subscriptions?search=${encodeURIComponent(value)}${branch}&limit=6`,
        map: (row: Row): SearchResult => ({ key: `subscription:${row.id}`, kind: "subscription", title: text(row.memberName ?? row.subscriptionNumber, "اشتراك"), subtitle: join([row.subscriptionNumber, row.packageName, row.status]), href: `/subscriptions?search=${encodeURIComponent(text(row.subscriptionNumber ?? row.memberName, normalized))}` }),
      },
      context.canAccess(["finance.invoices.read"]) && context.branchId && {
        path: (value: string) => `/organizations/${organizationId}/invoices?branchId=${encodeURIComponent(context.branchId)}&q=${encodeURIComponent(value)}&limit=6`,
        map: (row: Row): SearchResult => ({ key: `invoice:${row.id}`, kind: "invoice", title: text(row.invoiceNumber, "فاتورة"), subtitle: join([row.memberName ?? row.buyerName, money(row.grossMinor), row.status]), href: row.id ? `/finance/invoices/${String(row.id)}` : `/finance?search=${encodeURIComponent(text(row.invoiceNumber, normalized))}` }),
      },
      context.canAccess(["crm.leads.read"]) && {
        path: (value: string) => `/organizations/${organizationId}/crm/leads?search=${encodeURIComponent(value)}${branch}&limit=6`,
        map: (row: Row): SearchResult => ({ key: `lead:${row.id}`, kind: "lead", title: text(row.fullName ?? row.name, "عميل محتمل"), subtitle: join([row.phoneE164, row.interest, row.status]), href: `/crm?search=${encodeURIComponent(text(row.fullName ?? row.name, normalized))}` }),
      },
      context.canAccess(["workforce.read"]) && {
        path: (value: string) => `/organizations/${organizationId}/employees?search=${encodeURIComponent(value)}${branch}&limit=6`,
        map: (row: Row): SearchResult => ({ key: `employee:${row.id}`, kind: "employee", title: text(row.fullNameAr ?? row.displayName, "موظف"), subtitle: join([row.employeeNumber, row.positionName, row.status]), href: `/staff?search=${encodeURIComponent(text(row.fullNameAr ?? row.employeeNumber, normalized))}` }),
      },
    ].filter(Boolean) as Array<{ path: (value: string) => string; map: (row: Row) => SearchResult }>
  }, [context, memberOnlyAccount, normalized])

  useEffect(() => {
    if (normalized.length < 2 || memberOnlyAccount || sources.length === 0) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)
      const responses = await Promise.allSettled(sources.map(async source => {
        const response = await apiRequest<unknown>(source.path(normalized))
        return list(response.data).map(source.map)
      }))
      if (!cancelled) {
        setResults(responses.flatMap(response => response.status === "fulfilled" ? response.value : []).slice(0, 18))
        setLoading(false)
        setOpen(true)
      }
    }, 300)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [memberOnlyAccount, normalized, sources])

  useEffect(() => {
    function close(event: MouseEvent) { if (!wrapper.current?.contains(event.target as Node)) setOpen(false) }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", escape)
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape) }
  }, [])

  function select(result: SearchResult) {
    setOpen(false)
    setQuery("")
    router.push(result.href)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (normalized.length >= 2 && results[0]) select(results[0])
    else if (memberOnlyAccount) router.push("/self-service/discover")
    else if (normalized) setOpen(true)
  }

  return <div ref={wrapper} className="relative hidden w-full max-w-md md:block">
    <form onSubmit={submit}>
      {loading ? <Loader2 className="absolute right-3 top-1/2 z-10 size-4 -translate-y-1/2 animate-spin text-primary" /> : <Search className="absolute right-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />}
      <Input value={query} onFocus={() => setOpen(true)} onChange={event => { const value=event.target.value; setQuery(value); setResults([]); setLoading(value.trim().length>=2&&!memberOnlyAccount&&sources.length>0); setOpen(true) }} autoComplete="off" className="border-transparent bg-secondary/70 pr-10" placeholder={memberOnlyAccount ? "ابحث عن باقة، وجبة أو خدمة..." : "ابحث باسم عضو، رقم عضوية أو فاتورة..."} aria-label="البحث العام" aria-expanded={open} aria-controls="global-search-results" />
    </form>
    {open && normalized.length >= 2 && !memberOnlyAccount && <div id="global-search-results" className="absolute right-0 top-12 z-50 w-full min-w-[360px] overflow-hidden rounded-2xl border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3"><p className="text-xs font-black">نتائج البحث</p><p className="text-[10px] text-muted-foreground">في الفرع الحالي</p></div>
      <div className="max-h-[420px] overflow-y-auto p-2">
        {loading ? <div className="grid place-items-center py-10"><Loader2 className="animate-spin text-primary" /></div> : results.length ? results.map(result => <button key={result.key} type="button" onClick={() => select(result)} className="flex w-full items-center gap-3 rounded-xl p-3 text-right transition hover:bg-secondary focus:bg-secondary focus:outline-none">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", result.kind === "member" ? "bg-blue-500/10 text-blue-500" : result.kind === "invoice" ? "bg-emerald-500/10 text-emerald-500" : result.kind === "subscription" ? "bg-amber-500/10 text-amber-500" : result.kind === "lead" ? "bg-violet-500/10 text-violet-500" : "bg-cyan-500/10 text-cyan-500")}>{icon(result.kind)}</span>
          <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-xs font-black">{result.title}</span><span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] text-muted-foreground">{kindLabels[result.kind]}</span></span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{result.subtitle || "اضغط لعرض التفاصيل"}</span></span>
        </button>) : <div className="px-5 py-10 text-center"><Search className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-xs font-black">لا توجد نتائج مطابقة</p><p className="mt-1 text-[10px] leading-5 text-muted-foreground">جرّب الاسم الكامل أو رقم العضوية أو رقم الفاتورة.</p></div>}
      </div>
    </div>}
  </div>
}

function icon(kind: SearchResult["kind"]) {
  if (kind === "member") return <UserRound className="size-4" />
  if (kind === "subscription") return <CreditCard className="size-4" />
  if (kind === "invoice") return <FileText className="size-4" />
  if (kind === "lead") return <Zap className="size-4" />
  return <Users className="size-4" />
}

function list(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[]
  if (value && typeof value === "object" && Array.isArray((value as { items?: unknown[] }).items)) return (value as { items: Row[] }).items
  return []
}
function text(value: unknown, fallback = ""): string { return value === undefined || value === null || value === "" ? fallback : String(value) }
function join(values: unknown[]): string { return values.filter(value => value !== undefined && value !== null && value !== "").map(String).join(" • ") }
function money(value: unknown): string { const amount = Number(value); return Number.isFinite(amount) ? new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(amount / 100) : "" }
