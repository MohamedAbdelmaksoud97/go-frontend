"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  AlertCircle,
  BarChart3,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react"
import { useAppContext } from "@/components/app-context"
import {
  DashboardAnalytics,
  type DailyMetric,
  type ServiceActivity,
  type SubscriptionStatus,
} from "@/components/dashboard-analytics"
import { PageHeading } from "@/components/page-heading"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { apiRequest } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { firstAllowedDestination } from "@/lib/permissions"

type Summary = Record<string, string | number | null | undefined>

export default function DashboardPage() {
  const context = useAppContext()
  const router = useRouter()
  const canView = context.canAccess(["reporting.read"])
  const [summary, setSummary] = useState<Summary>()
  const [daily, setDaily] = useState<DailyMetric[]>([])
  const [statuses, setStatuses] = useState<SubscriptionStatus[]>([])
  const [services, setServices] = useState<ServiceActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [chartWarning, setChartWarning] = useState("")
  const [asOf, setAsOf] = useState<string>()
  const fallback = firstAllowedDestination(context.canAccess)
  const range = useMemo(() => dayRangeRiyadh(), [])
  const chartRange = useMemo(() => rollingRangeRiyadh(30), [])

  useEffect(() => {
    if (!context.loading && !canView) router.replace(fallback)
  }, [canView, context.loading, fallback, router])

  async function load() {
    if (!context.organizationId || !context.branchId) return
    setLoading(true)
    setError("")
    setChartWarning("")
    const organizationId = context.organizationId
    const branchId = context.branchId
    const summaryQuery = new URLSearchParams({ branchId, from: range.from, to: range.to })
    const activityQuery = new URLSearchParams({ branchId, from: chartRange.from, to: chartRange.to })
    const statusQuery = new URLSearchParams({ branchId, limit: "100" })

    try {
      const results = await Promise.allSettled([
        apiRequest<Summary>(`/organizations/${organizationId}/dashboard/summary?${summaryQuery}`),
        apiRequest<DailyMetric[]>(`/organizations/${organizationId}/reports/revenue-trend?${activityQuery}`),
        apiRequest<SubscriptionStatus[]>(`/organizations/${organizationId}/reports/subscription-status-chart?${statusQuery}`),
        apiRequest<ServiceActivity[]>(`/organizations/${organizationId}/reports/service-activity-chart?${activityQuery}`),
      ])
      const summaryResult = results[0]
      if (summaryResult.status === "rejected") throw summaryResult.reason
      setSummary(summaryResult.value.data)
      if (results[1].status === "fulfilled") {
        setDaily(results[1].value.data)
        setAsOf(new Date().toISOString())
      } else {
        setDaily([])
      }
      if (results[2].status === "fulfilled") setStatuses(results[2].value.data)
      else setStatuses([])
      if (results[3].status === "fulfilled") setServices(results[3].value.data)
      else setServices([])
      if (results.slice(1).some((result) => result.status === "rejected")) {
        setChartWarning("تعذر تحميل بعض التحليلات الآن. يمكنك إعادة المحاولة دون أن تتأثر مؤشرات اليوم.")
      }
    } catch (reason) {
      setError(humanError(reason, "تعذر تحميل مؤشرات الفرع."))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => void load())
    return () => cancelAnimationFrame(frame)
  }, [context.branchId, context.organizationId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (context.loading || !canView) {
    return <div className="grid min-h-[55vh] place-items-center"><Loader2 className="animate-spin text-primary" /></div>
  }

  const activeMembers = value(summary, "activeMembers", "active_members")
  const activeSubscriptions = value(summary, "activeSubscriptions", "active_subscriptions")
  const attendance = value(summary, "acceptedAttendance", "accepted_attendance")
  const revenue = number(summary, "invoicedGrossMinor", "invoiced_gross_minor") + number(summary, "otherIncomeMinor", "other_income_minor")
  const pending = value(summary, "pendingOnlineRequests", "pending_online_requests")
  const feedback = value(summary, "openFeedbackCases", "open_feedback_cases")
  const quickAction = [
    { permissions: ["members.manage"], label: "تسجيل عضو جديد", href: "/members?create=1" },
    { permissions: ["sales.checkout"], label: "إنشاء اشتراك جديد", href: "/subscriptions?create=1" },
    { permissions: ["attendance.check-in"], label: "تسجيل دخول عضو", href: "/attendance?create=1" },
    { permissions: ["bookings.create"], label: "إنشاء حجز جديد", href: "/bookings?create=1" },
    { permissions: ["crm.leads.manage"], label: "إضافة عميل محتمل", href: "/crm?create=1" },
  ].find((item) => context.canAccess(item.permissions))
  const cards = [
    { label: "الأعضاء النشطون", value: activeMembers, icon: Users, href: "/members", permissions: ["members.read"], note: "عضو بحالة نشطة الآن" },
    { label: "الاشتراكات النشطة", value: activeSubscriptions, icon: CreditCard, href: "/subscriptions", permissions: ["subscriptions.read"], note: "اشتراك سارٍ في الفرع" },
    { label: "زيارات اليوم المقبولة", value: attendance, icon: Activity, href: "/attendance", permissions: ["attendance.read"], note: "زيارة مكتملة اليوم" },
    { label: "إيرادات اليوم", value: money(revenue), icon: CircleDollarSign, href: "/finance", permissions: ["finance.invoices.read", "finance.other-income.read"], note: "من الفواتير والإيرادات الأخرى" },
  ]

  return (
    <div className="fade-up">
      <PageHeading
        eyebrow={dateLabel()}
        title={`مرحبًا، ${context.account?.displayName?.trim() || "مدير النظام"}`}
        description="نظرة واضحة على أداء الفرع اليوم واتجاهات العمل التي تساعدك على المتابعة واتخاذ القرار."
        action={quickAction?.label}
        actionHref={quickAction?.href}
      />

      {error && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/8 p-4 text-sm text-red-600">
          <AlertCircle />
          <span>{error}</span>
          <Button className="mr-auto" variant="outline" size="sm" onClick={() => void load()}><RefreshCw />إعادة المحاولة</Button>
        </div>
      )}
      {chartWarning && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4 text-sm text-amber-600">
          <BarChart3 />
          <span>{chartWarning}</span>
          <Button className="mr-auto" variant="outline" size="sm" onClick={() => void load()}><RefreshCw />إعادة التحميل</Button>
        </div>
      )}

      {loading ? (
        <div className="grid min-h-72 place-items-center"><Loader2 className="size-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="مؤشرات اليوم">
            {cards.filter((card) => context.canAccess(card.permissions)).map((card) => (
              <Link href={card.href} key={card.label} className="group">
                <Card className="h-full transition duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/60 group-hover:shadow-md">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-amber-600"><card.icon /></span>
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-[9px] font-bold text-muted-foreground">اليوم</span>
                    </div>
                    <p className="mt-5 text-[11px] font-semibold text-muted-foreground">{card.label}</p>
                    <p className="mt-2 text-2xl font-black tabular-nums">{card.value}</p>
                    <p className="mt-2 text-[9px] text-muted-foreground">{card.note}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </section>

          {context.canAccess(["online-requests.read", "feedback.read", "feedback.reply"]) && (
            <Card className="mt-5">
              <CardContent className="grid gap-4 p-5 md:grid-cols-2">
                {context.canAccess(["online-requests.read"]) && (
                  <Link href="/operations" className="flex items-center gap-4 rounded-2xl bg-secondary/50 p-5 transition hover:bg-secondary">
                    <span className="grid size-11 place-items-center rounded-xl bg-blue-500/10 text-blue-600"><ClipboardList /></span>
                    <div><p className="text-sm font-black">طلبات إلكترونية تنتظر المراجعة</p><p className="mt-1 text-2xl font-black">{pending}</p></div>
                  </Link>
                )}
                {context.canAccess(["feedback.read", "feedback.reply"]) && (
                  <Link href="/feedback" className="flex items-center gap-4 rounded-2xl bg-secondary/50 p-5 transition hover:bg-secondary">
                    <span className="grid size-11 place-items-center rounded-xl bg-orange-500/10 text-orange-600"><AlertCircle /></span>
                    <div><p className="text-sm font-black">شكاوى واقتراحات تحتاج المتابعة</p><p className="mt-1 text-2xl font-black">{feedback}</p></div>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          <DashboardAnalytics daily={daily} statuses={statuses} services={services} asOf={asOf} />
        </>
      )}
    </div>
  )
}

function value(summary: Summary | undefined, ...keys: string[]) {
  for (const key of keys) {
    const candidate = summary?.[key]
    if (candidate !== undefined && candidate !== null) return String(candidate)
  }
  return "0"
}

function number(summary: Summary | undefined, ...keys: string[]) {
  return Number(value(summary, ...keys)) || 0
}

function money(minor: number) {
  return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(minor / 100)
}

function dateLabel() {
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "full", timeZone: "Asia/Riyadh" }).format(new Date())
}

function dayRangeRiyadh() {
  const date = riyadhDate(new Date())
  const from = new Date(`${date}T00:00:00+03:00`)
  const to = new Date(from.getTime() + 86_400_000)
  return { from: from.toISOString(), to: to.toISOString() }
}

function rollingRangeRiyadh(days: number) {
  const toDate = riyadhDate(new Date())
  const toStart = new Date(`${toDate}T00:00:00+03:00`)
  const fromStart = new Date(toStart.getTime() - (days - 1) * 86_400_000)
  const to = new Date(toStart.getTime() + 86_400_000)
  return { from: fromStart.toISOString(), to: to.toISOString() }
}

function riyadhDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}
