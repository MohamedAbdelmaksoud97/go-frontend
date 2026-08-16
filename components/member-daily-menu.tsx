"use client"

import { useEffect, useState } from "react"
import { Flame, Loader2, ShoppingBag } from "lucide-react"
import { apiRequest, createIdempotencyKey, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type Meal = { mealId: string; mealName: string; description?: string; caloriesKcal: number; proteinGrams: number; carbohydratesGrams: number; fatGrams: number; allergens?: string[]; priceMinor: string; currency: string }
type DailyMenu = { items: Meal[] }

export function MemberDailyMenu({ organizationId, memberId, branchId }: { organizationId?: string; memberId: string; branchId?: string }) {
  const [menu, setMenu] = useState<DailyMenu>()
  const [loading, setLoading] = useState(Boolean(organizationId && branchId && hasRuntimeApi()))
  const [ordering, setOrdering] = useState<string>()
  const [notice, setNotice] = useState("")

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!organizationId || !branchId || !hasRuntimeApi()) { setLoading(false); return }
      const date = todayRiyadh()
      apiRequest<DailyMenu>(`/self/organizations/${organizationId}/daily-menu?branchId=${branchId}&businessDate=${date}`)
        .then(response => setMenu(response.data))
        .catch(() => setMenu({ items: [] }))
        .finally(() => setLoading(false))
    })
    return () => cancelAnimationFrame(frame)
  }, [organizationId, branchId])

  async function order(meal: Meal) {
    if (!organizationId || !branchId) return
    setOrdering(meal.mealId); setNotice("")
    try {
      await apiRequest(`/self/organizations/${organizationId}/members/${memberId}/orders`, {
        method: "POST",
        idempotencyKey: createIdempotencyKey(),
        body: JSON.stringify({ sellingBranchId: branchId, memberSegment: "OTHER", lines: [{ type: "RESTAURANT", targetId: meal.mealId, quantity: 1 }] }),
      })
      setNotice("تم إنشاء طلبك. سيظهر للمطبخ بعد تسجيل السداد على الفاتورة.")
    } catch (reason) { setNotice(humanError(reason, "تعذر إنشاء طلب الوجبة.")) }
    finally { setOrdering(undefined) }
  }

  return <Card className="mt-5"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ShoppingBag className="size-5 text-primary" /><h2 className="font-black">وجبات اليوم</h2></div><p className="mt-1 text-xs leading-5 text-muted-foreground">القائمة المنشورة للفرع، مع قيم كل وجبة الغذائية قبل الطلب.</p></div><Badge variant="outline">اليوم</Badge></div>{notice ? <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs leading-5">{notice}</p> : null}{loading ? <div className="grid min-h-28 place-items-center"><Loader2 className="animate-spin text-primary" /></div> : !organizationId || !branchId ? <p className="mt-5 text-sm text-muted-foreground">اختر فرعًا لعرض قائمة الوجبات.</p> : menu?.items.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{menu.items.map(meal => <div key={meal.mealId} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><div><p className="font-bold">{meal.mealName}</p>{meal.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{meal.description}</p> : null}</div><span className="whitespace-nowrap text-sm font-black">{money(meal.priceMinor)} ر.س</span></div><p className="mt-3 text-xs text-muted-foreground"><Flame className="ml-1 inline size-3 text-orange-500" />{meal.caloriesKcal} سعرة · بروتين {meal.proteinGrams}غ · كربوهيدرات {meal.carbohydratesGrams}غ · دهون {meal.fatGrams}غ</p>{meal.allergens?.length ? <p className="mt-2 text-[11px] text-amber-700">الحساسيات: {meal.allergens.join("، ")}</p> : null}<Button size="sm" className="mt-4 w-full" onClick={() => void order(meal)} disabled={Boolean(ordering)}>{ordering === meal.mealId ? <Loader2 className="animate-spin" /> : <ShoppingBag />}اطلب الوجبة</Button></div>)}</div> : <p className="mt-5 text-sm text-muted-foreground">لا توجد قائمة منشورة لهذا الفرع اليوم.</p>}</CardContent></Card>
}

function money(value: string) { return (Number(value) / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function todayRiyadh() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const get = (type: string) => parts.find(part => part.type === type)?.value ?? ""; return `${get("year")}-${get("month")}-${get("day")}` }
