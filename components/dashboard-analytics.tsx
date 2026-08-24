"use client"

import { useMemo, useState } from "react"
import {
  Activity,
  ArrowDownLeft,
  ArrowUpLeft,
  BarChart3,
  CalendarDays,
  CircleMinus,
  Gauge,
  PieChart,
  TrendingUp,
  WalletCards,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type DailyMetric = {
  businessDate?: string
  invoicedGrossMinor?: string | number
  otherIncomeMinor?: string | number
  totalRevenueMinor?: string | number
}

export type SubscriptionStatus = {
  status?: string
  count?: string | number
}

export type ServiceActivity = {
  serviceId?: string
  serviceName?: string
  attempts?: string | number
  accepted?: string | number
}

type RevenuePoint = { businessDate: string; amountMinor: number }
type Period = 7 | 14 | 30

const STATUS_META: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "نشط", color: "#ffcc00" },
  ACTIVE_PROVISIONAL: { label: "نشط مؤقتًا", color: "#f59e0b" },
  SCHEDULED: { label: "مجدول", color: "#3b82f6" },
  FROZEN: { label: "مجمّد", color: "#8b5cf6" },
  EXPIRED: { label: "منتهي", color: "#ef4444" },
  CANCELLED: { label: "ملغي", color: "#6b7280" },
}

export function DashboardAnalytics({
  daily,
  statuses,
  services,
  asOf,
}: {
  daily: DailyMetric[]
  statuses: SubscriptionStatus[]
  services: ServiceActivity[]
  asOf?: string
}) {
  return (
    <section className="mt-6 space-y-5" aria-label="تحليلات أداء الفرع">
      <RevenueAnalytics rows={daily} asOf={asOf} />
      <div className="grid items-stretch gap-5 xl:grid-cols-[0.82fr_1.45fr]">
        <SubscriptionAnalytics rows={statuses} />
        <ServiceActivityAnalytics rows={services} />
      </div>
    </section>
  )
}

function RevenueAnalytics({ rows, asOf }: { rows: DailyMetric[]; asOf?: string }) {
  const [period, setPeriod] = useState<Period>(30)
  const completeSeries = useMemo(() => completeRevenueSeries(rows, 30), [rows])
  const series = completeSeries.slice(-period)
  const previous = period < 30 ? completeSeries.slice(-(period * 2), -period) : []
  const values = series.map((row) => row.amountMinor)
  const total = sum(values)
  const previousTotal = sum(previous.map((row) => row.amountMinor))
  const average = Math.round(total / period)
  const activeDays = values.filter((amount) => amount > 0).length
  const peak = series.reduce(
    (highest, current) => (current.amountMinor > highest.amountMinor ? current : highest),
    series[0] ?? { businessDate: "", amountMinor: 0 },
  )
  const change = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null

  return (
    <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-card via-card to-primary/[0.035]">
      <div className="flex flex-col gap-5 border-b bg-secondary/15 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-amber-600">
            <TrendingUp className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-black">اتجاه الإيرادات</h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              حركة الفواتير والإيرادات الأخرى في الفرع، مع مقارنة تساعدك على اكتشاف التغيّر سريعًا.
            </p>
          </div>
        </div>
        <div className="flex w-fit rounded-xl border bg-background/70 p-1" aria-label="اختيار الفترة الزمنية">
          {([7, 14, 30] as Period[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPeriod(option)}
              className={cn(
                "rounded-lg px-3 py-2 text-[11px] font-bold transition",
                period === option
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
              aria-pressed={period === option}
            >
              {option} يومًا
            </button>
          ))}
        </div>
      </div>

      <CardContent className="p-5">
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InsightMetric
            icon={WalletCards}
            label={`إجمالي ${period} يومًا`}
            value={money(total)}
            note={change === null ? "الفترة المعروضة" : comparisonText(change)}
            tone={change === null ? "neutral" : change > 0 ? "positive" : change < 0 ? "negative" : "neutral"}
          />
          <InsightMetric icon={Gauge} label="المتوسط اليومي" value={money(average)} note="متوسط جميع أيام الفترة" />
          <InsightMetric
            icon={TrendingUp}
            label="أعلى يوم"
            value={money(peak.amountMinor)}
            note={peak.businessDate ? formatBusinessDate(peak.businessDate) : "لا توجد حركة"}
          />
          <InsightMetric
            icon={CalendarDays}
            label="أيام بها إيراد"
            value={`${activeDays.toLocaleString("ar-SA")} من ${period.toLocaleString("ar-SA")}`}
            note={activeDays === 0 ? "لا توجد حركة مسجلة" : `${Math.round((activeDays / period) * 100).toLocaleString("ar-SA")}% من أيام الفترة`}
          />
        </div>

        {total === 0 ? (
          <ChartEmpty
            icon={BarChart3}
            title="لا توجد حركة مالية في هذه الفترة"
            text="ستظهر الإيرادات هنا تلقائيًا عند إصدار الفواتير أو تسجيل إيرادات أخرى."
          />
        ) : (
          <RevenueAreaChart series={series} />
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <i className="size-2.5 rounded-full bg-primary" /> الإيراد اليومي
          </span>
          <span>القيم تشمل الفواتير والإيرادات الأخرى المسجلة.</span>
          {asOf && <span className="lg:mr-auto">آخر تحديث: {shortDateTime(asOf)}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

function RevenueAreaChart({ series }: { series: RevenuePoint[] }) {
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, series.length - 1))
  const safeSelectedIndex = Math.min(selectedIndex, Math.max(0, series.length - 1))
  const selected = series[safeSelectedIndex]
  const maximum = niceMaximum(Math.max(...series.map((row) => row.amountMinor), 1))
  const points = series.map((row, index) => ({
    ...row,
    x: series.length === 1 ? 500 : 42 + (index / (series.length - 1)) * 916,
    y: 240 - (row.amountMinor / maximum) * 210,
  }))
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")
  const areaPath = points.length ? `${linePath} L ${points.at(-1)?.x ?? 958} 240 L ${points[0].x} 240 Z` : ""
  const labels = chartDateLabels(series)

  return (
    <div className="overflow-hidden rounded-2xl border bg-background/45">
      <div className="flex flex-col gap-2 border-b bg-secondary/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground">اليوم المحدد</p>
          <p className="mt-1 text-sm font-black">{formatBusinessDate(selected?.businessDate)}</p>
        </div>
        <p className="text-xl font-black tabular-nums">{money(selected?.amountMinor ?? 0)}</p>
      </div>

      <div className="relative h-72 px-2 pb-1 pt-3" dir="ltr" role="img" aria-label="منحنى الإيرادات اليومية للفترة المختارة">
        <svg className="h-full w-full overflow-visible" viewBox="0 0 1000 270" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="dashboard-revenue-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.015" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((tick) => {
            const y = 30 + tick * 70
            return <line key={tick} x1="42" y1={y} x2="958" y2={y} stroke="var(--border)" strokeDasharray="5 8" vectorEffect="non-scaling-stroke" />
          })}
          <path d={areaPath} fill="url(#dashboard-revenue-fill)" />
          <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {points.map((point, index) => {
            const active = index === safeSelectedIndex
            return (
              <g
                key={point.businessDate}
                role="button"
                tabIndex={0}
                aria-label={`${formatBusinessDate(point.businessDate)}، ${money(point.amountMinor)}`}
                onMouseEnter={() => setSelectedIndex(index)}
                onFocus={() => setSelectedIndex(index)}
                onClick={() => setSelectedIndex(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") setSelectedIndex(index)
                }}
                className="cursor-pointer outline-none"
              >
                <circle cx={point.x} cy={point.y} r="13" fill="transparent" />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={active ? 6 : point.amountMinor > 0 ? 3 : 2}
                  fill={active ? "var(--card)" : "var(--primary)"}
                  stroke="var(--primary)"
                  strokeWidth={active ? 4 : 1.5}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )
          })}
        </svg>
        <div className="pointer-events-none absolute inset-y-3 left-3 flex flex-col justify-between text-[9px] text-muted-foreground" dir="rtl">
          <span>{compactMoney(maximum)}</span>
          <span>{compactMoney(Math.round(maximum * 0.67))}</span>
          <span>{compactMoney(Math.round(maximum * 0.33))}</span>
          <span>{compactMoney(0)}</span>
        </div>
      </div>
      <div className="flex justify-between gap-2 border-t px-4 py-3 text-[9px] text-muted-foreground" dir="ltr">
        {labels.map((label) => (
          <span key={label.businessDate} dir="rtl">{formatBusinessDate(label.businessDate)}</span>
        ))}
      </div>
    </div>
  )
}

function SubscriptionAnalytics({ rows }: { rows: SubscriptionStatus[] }) {
  const normalized = rows
    .map((row, index) => {
      const status = String(row.status ?? "OTHER")
      return {
        status,
        count: Math.max(0, Number(row.count ?? 0)),
        ...(STATUS_META[status] ?? { label: "أخرى", color: ["#14b8a6", "#64748b", "#f97316"][index % 3] }),
      }
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
  const total = normalized.reduce((current, item) => current + item.count, 0)
  const active = normalized
    .filter((item) => item.status === "ACTIVE" || item.status === "ACTIVE_PROVISIONAL")
    .reduce((current, item) => current + item.count, 0)
  const stops = normalized
    .map((item, index) => {
      const from = normalized.slice(0, index).reduce((current, entry) => current + entry.count, 0)
      return `${item.color} ${(from / total) * 100}% ${((from + item.count) / total) * 100}%`
    })
    .join(", ")

  return (
    <Card className="h-full overflow-hidden">
      <AnalyticsHeader icon={PieChart} title="حالة الاشتراكات" description="توزيع الاشتراكات في الفرع حسب حالتها الحالية." />
      <CardContent className="pt-4">
        {total === 0 ? (
          <ChartEmpty icon={PieChart} title="لا توجد اشتراكات بعد" text="سيظهر توزيع الحالات بمجرد تسجيل أول اشتراك في الفرع." />
        ) : (
          <>
            <div className="mx-auto grid size-44 place-items-center rounded-full shadow-inner" style={{ background: `conic-gradient(${stops})` }}>
              <div className="grid size-28 place-items-center rounded-full border bg-card text-center shadow-sm">
                <div>
                  <p className="text-3xl font-black tabular-nums">{total.toLocaleString("ar-SA")}</p>
                  <p className="mt-1 text-[9px] text-muted-foreground">إجمالي الاشتراكات</p>
                </div>
              </div>
            </div>
            <div className="mt-5 rounded-xl border bg-secondary/20 p-3 text-center">
              <p className="text-[10px] text-muted-foreground">نسبة الاشتراكات النشطة</p>
              <p className="mt-1 text-xl font-black">{Math.round((active / total) * 100).toLocaleString("ar-SA")}%</p>
            </div>
            <div className="mt-4 space-y-2.5">
              {normalized.map((item) => {
                const percentage = Math.round((item.count / total) * 100)
                return (
                  <div key={item.status} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-secondary/40">
                    <span className="size-2.5 rounded-full" style={{ background: item.color }} />
                    <span className="truncate text-[11px] font-semibold">{item.label}</span>
                    <span className="text-left text-[10px] tabular-nums text-muted-foreground">
                      <b className="text-foreground">{item.count.toLocaleString("ar-SA")}</b> · {percentage.toLocaleString("ar-SA")}%
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ServiceActivityAnalytics({ rows }: { rows: ServiceActivity[] }) {
  const values = rows
    .map((row) => ({
      id: String(row.serviceId ?? row.serviceName ?? "service"),
      name: String(row.serviceName ?? "خدمة غير محددة"),
      accepted: Math.max(0, Number(row.accepted ?? 0)),
      attempts: Math.max(0, Number(row.attempts ?? 0)),
    }))
    .filter((item) => item.attempts > 0 || item.accepted > 0)
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 8)
  const totalAttempts = values.reduce((current, item) => current + item.attempts, 0)
  const totalAccepted = values.reduce((current, item) => current + item.accepted, 0)
  const acceptanceRate = totalAttempts > 0 ? Math.round((totalAccepted / totalAttempts) * 100) : 0
  const maximum = Math.max(...values.map((item) => item.attempts), 1)

  return (
    <Card className="h-full overflow-hidden">
      <AnalyticsHeader icon={Activity} title="استخدام الخدمات" description="الخدمات الأكثر استخدامًا ونسبة الزيارات المقبولة خلال آخر 30 يومًا." />
      <CardContent className="pt-4">
        {values.length === 0 ? (
          <ChartEmpty icon={Activity} title="لا يوجد نشاط خدمات بعد" text="ستظهر الخدمات هنا عند تسجيل محاولات الدخول أو الزيارات." />
        ) : (
          <>
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <CompactMetric label="إجمالي المحاولات" value={totalAttempts.toLocaleString("ar-SA")} />
              <CompactMetric label="زيارات مقبولة" value={totalAccepted.toLocaleString("ar-SA")} tone="positive" />
              <CompactMetric label="نسبة القبول" value={`${acceptanceRate.toLocaleString("ar-SA")}%`} />
            </div>
            <div className="space-y-5">
              {values.map((item) => {
                const rate = item.attempts > 0 ? Math.min(100, Math.round((item.accepted / item.attempts) * 100)) : 0
                const totalWidth = Math.max(4, (item.attempts / maximum) * 100)
                return (
                  <div key={item.id}>
                    <div className="mb-2 flex items-start gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold">{item.name}</p>
                        <p className="mt-0.5 text-[9px] text-muted-foreground">
                          {item.accepted.toLocaleString("ar-SA")} مقبولة من {item.attempts.toLocaleString("ar-SA")} محاولة
                        </p>
                      </div>
                      <span className="mr-auto shrink-0 rounded-lg bg-secondary px-2 py-1 text-[10px] font-black tabular-nums">{rate.toLocaleString("ar-SA")}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-secondary/75">
                      <div className="h-full overflow-hidden rounded-full bg-muted" style={{ width: `${totalWidth}%` }}>
                        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${rate}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-4 border-t pt-4 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-2"><i className="size-2 rounded-full bg-primary" /> زيارات مقبولة</span>
              <span className="flex items-center gap-2"><i className="size-2 rounded-full bg-muted" /> محاولات غير مكتملة</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function AnalyticsHeader({ icon: Icon, title, description }: { icon: typeof Activity; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 border-b bg-secondary/15 px-5 py-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-amber-600"><Icon className="size-5" /></span>
      <div>
        <h2 className="font-black">{title}</h2>
        <p className="mt-1 text-[10px] leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function InsightMetric({
  icon: Icon,
  label,
  value,
  note,
  tone = "neutral",
}: {
  icon: typeof Activity
  label: string
  value: string
  note: string
  tone?: "positive" | "negative" | "neutral"
}) {
  const ToneIcon = tone === "positive" ? ArrowUpLeft : tone === "negative" ? ArrowDownLeft : CircleMinus
  return (
    <div className="rounded-2xl border bg-background/55 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-[10px] font-semibold">{label}</span>
      </div>
      <p className="mt-3 truncate text-xl font-black tabular-nums" title={value}>{value}</p>
      <p className={cn("mt-2 flex items-center gap-1 text-[9px]", tone === "positive" && "text-emerald-600", tone === "negative" && "text-red-600", tone === "neutral" && "text-muted-foreground")}>
        <ToneIcon className="size-3.5" /> {note}
      </p>
    </div>
  )
}

function CompactMetric({ label, value, tone }: { label: string; value: string; tone?: "positive" }) {
  return (
    <div className="rounded-xl border bg-secondary/20 p-3">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-black tabular-nums", tone === "positive" && "text-emerald-600")}>{value}</p>
    </div>
  )
}

function ChartEmpty({ icon: Icon, title, text }: { icon: typeof Activity; title: string; text: string }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed bg-secondary/15 p-7 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground"><Icon className="size-6" /></span>
        <p className="mt-4 text-sm font-black">{title}</p>
        <p className="mt-2 text-[10px] leading-6 text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}

function completeRevenueSeries(rows: DailyMetric[], days: number): RevenuePoint[] {
  const byDate = new Map<string, number>()
  for (const row of rows) {
    const businessDate = String(row.businessDate ?? "").slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(businessDate)) continue
    const provided = Number(row.totalRevenueMinor)
    const amount = Number.isFinite(provided)
      ? provided
      : (Number(row.invoicedGrossMinor ?? 0) || 0) + (Number(row.otherIncomeMinor ?? 0) || 0)
    byDate.set(businessDate, (byDate.get(businessDate) ?? 0) + Math.max(0, amount))
  }
  const { fromDate } = rollingRangeRiyadh(days)
  const start = new Date(`${fromDate}T00:00:00Z`)
  return Array.from({ length: days }, (_, index) => {
    const businessDate = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10)
    return { businessDate, amountMinor: byDate.get(businessDate) ?? 0 }
  })
}

function chartDateLabels(series: RevenuePoint[]) {
  if (series.length <= 1) return series
  const indices = new Set([0, Math.round((series.length - 1) * 0.33), Math.round((series.length - 1) * 0.66), series.length - 1])
  return [...indices].sort((a, b) => a - b).map((index) => series[index])
}

function niceMaximum(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / magnitude) * magnitude
}

function sum(values: number[]) {
  return values.reduce((current, value) => current + value, 0)
}

function comparisonText(change: number) {
  if (Math.abs(change) < 0.5) return "مماثل للفترة السابقة"
  return `${Math.abs(Math.round(change)).toLocaleString("ar-SA")}% ${change > 0 ? "أعلى" : "أقل"} من الفترة السابقة`
}

function compactMoney(minor: number) {
  return `${new Intl.NumberFormat("ar-SA", { notation: "compact", maximumFractionDigits: 1 }).format(minor / 100)} ر.س`
}

function money(minor: number) {
  return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(minor / 100)
}

function rollingRangeRiyadh(days: number) {
  const toDate = riyadhDate(new Date())
  const toStart = new Date(`${toDate}T00:00:00+03:00`)
  const fromStart = new Date(toStart.getTime() - (days - 1) * 86_400_000)
  return { fromDate: riyadhDate(fromStart) }
}

function riyadhDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

function formatBusinessDate(value?: string) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))
}

function shortDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(value))
}
