"use client"

import { useEffect, useState } from "react"
import { Flame, Loader2, ShoppingBag, Utensils, X } from "lucide-react"
import { apiRequest, createIdempotencyKey, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/toast-provider"

type Meal = {
  mealId: string
  mealName: string
  description?: string
  categoryName?: string
  caloriesKcal: number
  proteinGrams: number
  carbohydratesGrams: number
  fatGrams: number
  allergens?: string[]
  availableQuantity?: number
  priceMinor: string
  taxRateBps?: number
  taxInclusive?: boolean
  specialPriceApplied?: boolean
  currency: string
}
type DailyMenu = { items: Meal[] }
type CreatedOrder = { invoiceNumber?: string }

export function MemberDailyMenu({ organizationId, memberId, branchId, branchName }: { organizationId?: string; memberId: string; branchId?: string; branchName?: string }) {
  const toast = useToast()
  const [menu, setMenu] = useState<DailyMenu>()
  const [selected, setSelected] = useState<Meal>()
  const [loading, setLoading] = useState(Boolean(organizationId && branchId && hasRuntimeApi()))
  const [ordering, setOrdering] = useState<string>()

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setLoading(Boolean(organizationId && branchId && hasRuntimeApi())); setMenu(undefined); setSelected(undefined)
      if (!organizationId || !branchId || !hasRuntimeApi()) { setLoading(false); return }
      apiRequest<DailyMenu>(`/self/organizations/${organizationId}/daily-menu?branchId=${branchId}&businessDate=${todayRiyadh()}`)
        .then(response => setMenu(response.data))
        .catch(() => setMenu({ items: [] }))
        .finally(() => setLoading(false))
    })
    return () => cancelAnimationFrame(frame)
  }, [organizationId, branchId])

  async function order(meal: Meal) {
    if (!organizationId || !branchId) return
    setOrdering(meal.mealId)
    try {
      const order = await apiRequest<CreatedOrder>(`/self/organizations/${organizationId}/members/${memberId}/orders`, {
        method: "POST",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({ sellingBranchId: branchId, memberSegment: "OTHER", lines: [{ type: "RESTAURANT", targetId: meal.mealId, quantity: 1 }] }),
      })
      setSelected(undefined)
      toast.success(`تم تسجيل طلبك بنجاح. برجاء السداد في استقبال النادي ليصل الطلب إلى المطبخ${order.data.invoiceNumber ? ` — رقم الفاتورة: ${order.data.invoiceNumber}` : ""}.`)
    } catch (reason) { toast.error(humanError(reason, "تعذر إنشاء طلب الوجبة والفاتورة.")) }
    finally { setOrdering(undefined) }
  }

  return <>
    <Card className="mt-5 overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Utensils className="size-5 text-primary" /><h2 className="font-black">وجبات اليوم</h2></div><p className="mt-1 text-xs leading-5 text-muted-foreground">قائمة {branchName ?? "الفرع المختار"} المنشورة اليوم، مع السعر والقيم الغذائية والحساسيات.</p></div><Badge variant="outline">اليوم</Badge></div>
        {loading ? <div className="grid min-h-28 place-items-center"><Loader2 className="animate-spin text-primary" /></div> : !organizationId || !branchId ? <p className="mt-5 text-sm text-muted-foreground">اختر فرعًا لعرض قائمة الوجبات.</p> : menu?.items.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">{menu.items.map(meal => <article key={meal.mealId} className="rounded-2xl border bg-gradient-to-bl from-card to-orange-500/[.04] p-5 transition hover:border-primary/40 hover:shadow-lg"><div className="flex justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black">{meal.mealName}</p>{meal.specialPriceApplied && <Badge>سعر اليوم</Badge>}</div>{meal.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{meal.description}</p> : null}</div><div className="text-left"><span className="whitespace-nowrap text-sm font-black">{money(meal.priceMinor)} ر.س</span><p className="mt-1 text-[10px] text-muted-foreground">{meal.taxInclusive ? "شامل الضريبة" : `قبل الضريبة · الإجمالي ${money(grossMinor(meal))} ر.س`}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4"><Nutrition label="السعرات" value={`${meal.caloriesKcal}`} /><Nutrition label="البروتين" value={`${meal.proteinGrams}غ`} /><Nutrition label="الكربوهيدرات" value={`${meal.carbohydratesGrams}غ`} /><Nutrition label="الدهون" value={`${meal.fatGrams}غ`} /></div>{meal.allergens?.length ? <p className="mt-3 text-[11px] text-amber-700">تنبيه حساسية: {meal.allergens.join("، ")}</p> : <p className="mt-3 text-[11px] text-muted-foreground">لا توجد حساسيات مسجلة.</p>}<Button size="sm" className="mt-4 w-full" onClick={() => setSelected(meal)} disabled={Boolean(ordering)}><ShoppingBag />مراجعة وطلب الوجبة</Button></article>)}</div>
        ) : <div className="mt-5 rounded-2xl border border-dashed p-10 text-center"><Flame className="mx-auto size-9 text-muted-foreground/50" /><p className="mt-3 text-sm font-bold">لا توجد قائمة منشورة لهذا الفرع اليوم</p><p className="mt-1 text-xs text-muted-foreground">اختر فرعًا آخر أو راجع القائمة لاحقًا.</p></div>}
      </CardContent>
    </Card>
    {selected && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="meal-order-title" onMouseDown={event => { if (event.target === event.currentTarget && !ordering) setSelected(undefined) }}><div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-2xl"><div className="flex items-start gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-orange-500/15 text-orange-600"><Utensils /></span><div><p className="text-xs font-bold text-primary">مراجعة طلب الوجبة</p><h3 id="meal-order-title" className="mt-1 text-xl font-black">{selected.mealName}</h3></div><Button className="mr-auto" variant="ghost" size="icon" onClick={() => setSelected(undefined)} disabled={Boolean(ordering)} aria-label="إغلاق"><X /></Button></div><div className="mt-5 rounded-2xl bg-secondary/50 p-4"><div className="flex justify-between text-sm"><span>السعر</span><strong>{money(selected.priceMinor)} ر.س</strong></div>{!selected.taxInclusive && <><div className="mt-3 flex justify-between text-sm"><span>الضريبة</span><strong>{money(grossMinor(selected) - Number(selected.priceMinor))} ر.س</strong></div><div className="mt-3 flex justify-between border-t pt-3"><span className="font-bold">الإجمالي</span><strong>{money(grossMinor(selected))} ر.س</strong></div></>}</div><p className="mt-4 text-xs leading-6 text-muted-foreground">سيُنشأ الطلب وفاتورة الآن. لن يصل الطلب إلى طابور المطبخ إلا بعد سداد الفاتورة في الاستقبال.</p><div className="mt-6 flex gap-3"><Button className="flex-1" onClick={() => void order(selected)} disabled={Boolean(ordering)}>{ordering ? <Loader2 className="animate-spin" /> : <ShoppingBag />}تأكيد وإنشاء الفاتورة</Button><Button variant="outline" onClick={() => setSelected(undefined)} disabled={Boolean(ordering)}>رجوع</Button></div></div></div>}
  </>
}

function Nutrition({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-secondary/60 p-2 text-center"><span className="block text-muted-foreground">{label}</span><strong className="mt-1 block">{value}</strong></div> }
function money(value: string | number) { return (Number(value) / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function grossMinor(meal: Meal) { const base = Number(meal.priceMinor) || 0; return meal.taxInclusive ? base : Math.round(base * (1 + (meal.taxRateBps ?? 0) / 10_000)) }
function todayRiyadh() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const get = (type: string) => parts.find(part => part.type === type)?.value ?? ""; return `${get("year")}-${get("month")}-${get("day")}` }
