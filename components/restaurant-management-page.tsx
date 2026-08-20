"use client"

import { useEffect, useMemo, useState } from "react"
import { ChefHat, ClipboardList, Flame, Plus, Save, Send, ShoppingBag, Trash2 } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/toast-provider"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

type Row = Record<string, unknown>
type Meal = Row & { id: string; name: string; code: string; categoryId: string; nutrition?: Nutrition; allergens?: string[] }
type Nutrition = { caloriesKcal: number; proteinGrams: number; carbohydratesGrams: number; fatGrams: number; fiberGrams: number; sugarGrams: number; sodiumMilligrams: number }
type MenuItem = { mealId: string; enabled: boolean; availableQuantity?: number; specialPriceMinor?: string }
type Menu = { businessDate: string; status: "DRAFT" | "PUBLISHED" | "CLOSED"; version: number; items: MenuItem[] }

const emptyNutrition: Nutrition = { caloriesKcal: 0, proteinGrams: 0, carbohydratesGrams: 0, fatGrams: 0, fiberGrams: 0, sugarGrams: 0, sodiumMilligrams: 0 }

export function RestaurantManagementPage() {
  const context = useAppContext()
  const toast = useToast()
  const [tab, setTab] = useState<"menu" | "catalog" | "kitchen">("menu")
  const [date, setDate] = useState(todayRiyadh())
  const [categories, setCategories] = useState<Row[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [menu, setMenu] = useState<Menu | undefined>()
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [orders, setOrders] = useState<Row[]>([])
  const [loading, setLoading] = useState(hasRuntimeApi())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [mealForm, setMealForm] = useState({ code: "", name: "", categoryId: "", description: "", kind: "MEAL", portionClass: "UNRESTRICTED", allergens: "", ...emptyNutrition })
  const [priceForm, setPriceForm] = useState({ mealId: "", amount: "", taxRatePercent: "15", taxInclusive: true })

  const categoryName = useMemo(() => new Map(categories.map(item => [String(item.id), String(item.name ?? item.nameAr ?? "تصنيف")])) , [categories])

  async function load() {
    if (!hasRuntimeApi() || !context.organizationId || !context.branchId) { setLoading(false); return }
    setLoading(true); setError("")
    try {
      const base = `/organizations/${context.organizationId}`
      const [categoryResponse, mealResponse] = await Promise.all([
        apiRequest<Row[] | { items: Row[] }>(`${base}/restaurant/meal-categories?branchId=${encodeURIComponent(context.branchId)}&limit=100`),
        apiRequest<Meal[] | { items: Meal[] }>(`${base}/restaurant/meals?branchId=${encodeURIComponent(context.branchId)}&limit=100`),
      ])
      const [orderResult, menuResult] = await Promise.allSettled([
        apiRequest<Row[] | { items: Row[] }>(`${base}/restaurant-orders?limit=100`),
        apiRequest<Menu>(`${base}/branches/${context.branchId}/daily-menus/${date}`).catch(reason => isNotFound(reason) ? undefined : Promise.reject(reason)),
      ])
      const nextCategories = list(categoryResponse.data)
      const nextMeals = list(mealResponse.data) as Meal[]
      const currentMenu = menuResult.status === "fulfilled" ? menuResult.value?.data : undefined
      setCategories(nextCategories); setMeals(nextMeals); setOrders(orderResult.status === "fulfilled" ? list(orderResult.value.data) : []); setMenu(currentMenu)
      setMenuItems(currentMenu?.items ?? [])
      setMealForm(current => current.categoryId || !nextCategories[0]?.id ? current : { ...current, categoryId: String(nextCategories[0].id) })
    } catch (reason) { setError(humanError(reason, "تعذر تحميل بيانات المطعم.")) }
    finally { setLoading(false) }
  }

  useEffect(() => { const frame = requestAnimationFrame(() => { void load() }); return () => cancelAnimationFrame(frame) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.organizationId, context.branchId, date])

  function setMealField(key: string, value: string | boolean) { setMealForm(current => ({ ...current, [key]: value } as typeof current)) }
  function addMenuMeal(mealId: string) { setMenuItems(current => current.some(item => item.mealId === mealId) ? current : [...current, { mealId, enabled: true }]) }
  function removeMenuMeal(mealId: string) { setMenuItems(current => current.filter(item => item.mealId !== mealId)) }
  function updateMenuMeal(mealId: string, change: Partial<MenuItem>) { setMenuItems(current => current.map(item => item.mealId === mealId ? { ...item, ...change } : item)) }

  async function createMeal() {
    if (!context.organizationId) return
    setSaving(true); setError("")
    try {
      const nutrition = Object.fromEntries(Object.entries(emptyNutrition).map(([key]) => [key, number(mealForm[key as keyof Nutrition])])) as Nutrition
      await apiRequest(`/organizations/${context.organizationId}/restaurant/meals`, { method: "POST", body: JSON.stringify({ branchId: context.branchId, categoryId: mealForm.categoryId, code: mealForm.code, name: mealForm.name, description: mealForm.description || undefined, kind: mealForm.kind, portionClass: mealForm.portionClass, nutrition, allergens: split(mealForm.allergens) }) })
      setMealForm(current => ({ ...current, code: "", name: "", description: "", allergens: "", ...emptyNutrition })); toast.success("تمت إضافة الوجبة وقيمها الغذائية."); await load()
    } catch (reason) { setError(humanError(reason, "تعذر حفظ الوجبة.")) } finally { setSaving(false) }
  }

  async function createPrice() {
    if (!context.organizationId || !context.branchId || !priceForm.mealId) return
    setSaving(true); setError("")
    try {
      await apiRequest(`/organizations/${context.organizationId}/restaurant/meal-prices`, { method: "POST", body: JSON.stringify({ branchId: context.branchId, mealId: priceForm.mealId, amountMinor: String(Math.round(number(priceForm.amount) * 100)), taxRateBps: Math.round(number(priceForm.taxRatePercent) * 100), taxInclusive: priceForm.taxInclusive, validFrom: new Date(`${date}T00:00:00+03:00`).toISOString() }) })
      setPriceForm(current => ({ ...current, amount: "" })); toast.success("تم حفظ سعر الفرع من تاريخ القائمة.")
    } catch (reason) { setError(humanError(reason, "تعذر حفظ السعر.")) } finally { setSaving(false) }
  }

  async function publishMenu() {
    if (!context.organizationId || !context.branchId || menuItems.length === 0) { setError("اختر وجبة واحدة على الأقل لقائمة اليوم."); return }
    setSaving(true); setError("")
    try {
      const path = `/organizations/${context.organizationId}/branches/${context.branchId}/daily-menus/${date}`
      const normalized = menuItems.map(item => ({ mealId: item.mealId, enabled: item.enabled, ...(item.availableQuantity === undefined ? {} : { availableQuantity: item.availableQuantity }), ...(item.specialPriceMinor === undefined ? {} : { specialPriceMinor: item.specialPriceMinor }) }))
      let active = menu
      if (active === undefined) {
        active = (await apiRequest<Menu>(`/organizations/${context.organizationId}/branches/${context.branchId}/daily-menus`, { method: "POST", body: JSON.stringify({ businessDate: date, items: normalized }) })).data
        active = (await apiRequest<Menu>(`${path}/publications`, { method: "POST", body: JSON.stringify({ expectedVersion: active.version }) })).data
      } else if (active.status !== "CLOSED") {
        active = (await apiRequest<Menu>(path, { method: "PUT", body: JSON.stringify({ expectedVersion: active.version, items: normalized }) })).data
        if (active.status === "DRAFT") active = (await apiRequest<Menu>(`${path}/publications`, { method: "POST", body: JSON.stringify({ expectedVersion: active.version }) })).data
      }
      setMenu(active); setMenuItems(active.items); toast.success("تم نشر قائمة اليوم وتحديث ما يظهر للمشتركين.")
    } catch (reason) { setError(humanError(reason, "تعذر حفظ قائمة اليوم.")) } finally { setSaving(false) }
  }

  async function hideMenu() {
    if (!context.organizationId || !context.branchId || !menu || menu.status !== "PUBLISHED") return
    setSaving(true); setError("")
    try {
      const hiddenItems = menuItems.map(item => ({ mealId: item.mealId, enabled: false, ...(item.availableQuantity === undefined ? {} : { availableQuantity: item.availableQuantity }), ...(item.specialPriceMinor === undefined ? {} : { specialPriceMinor: item.specialPriceMinor }) }))
      const response = await apiRequest<Menu>(`/organizations/${context.organizationId}/branches/${context.branchId}/daily-menus/${date}`, { method: "PUT", body: JSON.stringify({ expectedVersion: menu.version, items: hiddenItems }) })
      setMenu(response.data); setMenuItems(response.data.items); toast.success("تم إيقاف عرض قائمة اليوم للمشتركين. يمكنك إعادة تفعيل أي وجبة ونشر التحديث في أي وقت.")
    } catch (reason) { setError(humanError(reason, "تعذر إيقاف عرض القائمة.")) } finally { setSaving(false) }
  }

  async function transitionOrder(order: Row, action: "START_PREPARING" | "MARK_READY" | "COMPLETE") {
    if (!context.organizationId || !order.id) return
    setSaving(true); setError("")
    try { await apiRequest(`/organizations/${context.organizationId}/restaurant-orders/${order.id}/transitions`, { method: "POST", body: JSON.stringify({ expectedVersion: order.version, action }) }); toast.success("تم تحديث حالة الطلب بنجاح."); await load() }
    catch (reason) { setError(humanError(reason, "تعذر تحديث حالة الطلب.")) } finally { setSaving(false) }
  }

  return <div className="fade-up space-y-5">
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><Badge variant="outline" className="mb-3 border-primary/30 bg-primary/10 text-amber-700 dark:text-primary">تشغيل المطعم</Badge><h1 className="text-2xl font-black sm:text-3xl">المطبخ وقائمة الوجبات</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">الوجبة تُعرّف مرة واحدة بقيمها الغذائية، ثم يحدد الشيف سعرها وإتاحتها لكل فرع ولكل يوم.</p></div><div className="flex gap-2"><Button variant={tab === "menu" ? "default" : "outline"} onClick={() => setTab("menu")}><ClipboardList />قائمة اليوم</Button><Button variant={tab === "catalog" ? "default" : "outline"} onClick={() => setTab("catalog")}><ChefHat />الوجبات والأسعار</Button><Button variant={tab === "kitchen" ? "default" : "outline"} onClick={() => setTab("kitchen")}><ShoppingBag />المطبخ</Button></div></header>
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    {loading ? <Card><CardContent className="grid min-h-72 place-items-center"><span className="size-9 animate-spin rounded-full border-4 border-primary border-t-transparent" /></CardContent></Card> : tab === "menu" ? <MenuPanel date={date} setDate={setDate} meals={meals} menu={menu} menuItems={menuItems} add={addMenuMeal} remove={removeMenuMeal} update={updateMenuMeal} publish={publishMenu} hide={hideMenu} saving={saving} /> : tab === "catalog" ? <CatalogPanel categories={categories} categoryName={categoryName} meals={meals} mealForm={mealForm} setMealField={setMealField} priceForm={priceForm} setPriceForm={setPriceForm} createMeal={createMeal} createPrice={createPrice} saving={saving} /> : <KitchenPanel orders={orders} transition={transitionOrder} saving={saving} />}
  </div>
}

function MenuPanel({ date, setDate, meals, menu, menuItems, add, remove, update, publish, hide, saving }: { date: string; setDate: (value: string) => void; meals: Meal[]; menu?: Menu; menuItems: MenuItem[]; add: (id: string) => void; remove: (id: string) => void; update: (id: string, value: Partial<MenuItem>) => void; publish: () => void; hide: () => void; saving: boolean }) {
  const selected = new Map(menuItems.map(item => [item.mealId, item]))
  const closed = menu?.status === "CLOSED"
  const hasVisibleItems = menuItems.some(item => item.enabled)
  return <Card><CardContent className="p-5"><div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-end"><div><h2 className="font-black">قائمة الفرع اليومية</h2><p className="mt-1 text-xs text-muted-foreground">{menu?.status === "PUBLISHED" ? (hasVisibleItems ? "منشورة للمشتركين. يمكنك تعديل الوجبات أو إخفاء أي وجبة ثم حفظ التحديث." : "القائمة محفوظة لكن لا توجد وجبة معروضة للمشتركين حاليًا.") : closed ? "تم إيقاف عرض هذه القائمة للمشتركين." : "أضف الوجبات ثم انشرها مباشرة للمشتركين."}</p></div><Input type="date" value={date} onChange={event => setDate(event.target.value)} className="w-full sm:w-48" /></div><div className="mt-4 divide-y">{meals.map(meal => { const item = selected.get(meal.id); return <div key={meal.id} className="grid gap-3 py-4 md:grid-cols-[auto_1fr_130px_150px_auto]"><div className="self-center">{item ? <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={item.enabled} disabled={closed} onChange={event => update(meal.id, { enabled: event.target.checked })} className="size-4 accent-primary" />ظاهر للمشتركين</label> : <Button variant="outline" size="sm" disabled={closed} onClick={() => add(meal.id)}><Plus />إضافة</Button>}</div><div><p className="font-bold">{meal.name}</p><p className="mt-1 text-xs text-muted-foreground">{meal.nutrition?.caloriesKcal ?? 0} سعرة · بروتين {meal.nutrition?.proteinGrams ?? 0}غ · كربوهيدرات {meal.nutrition?.carbohydratesGrams ?? 0}غ</p></div><Input type="number" min="1" disabled={!item || closed} value={item?.availableQuantity ?? ""} onChange={event => update(meal.id, { availableQuantity: event.target.value ? number(event.target.value) : undefined })} placeholder="الكمية المتاحة" /><Input type="number" min="0" step="0.01" disabled={!item || closed} value={item?.specialPriceMinor === undefined ? "" : String(Number(item.specialPriceMinor) / 100)} onChange={event => update(meal.id, { specialPriceMinor: event.target.value ? String(Math.round(number(event.target.value) * 100)) : undefined })} placeholder="سعر خاص (ر.س)" />{item ? <Button variant="ghost" size="icon" disabled={closed} onClick={() => remove(meal.id)} aria-label={`حذف ${meal.name} من قائمة اليوم`}><Trash2 className="size-4 text-destructive" /></Button> : <span />}</div> })}</div><div className="mt-5 flex flex-wrap gap-2"><Button onClick={publish} disabled={saving || closed || menuItems.length === 0}><Send />{menu ? "حفظ التحديثات" : "نشر قائمة اليوم"}</Button><Button variant="outline" onClick={hide} disabled={saving || menu?.status !== "PUBLISHED" || !hasVisibleItems}><Save />إيقاف العرض للمشتركين</Button></div></CardContent></Card>
}

function CatalogPanel({ categories, categoryName, meals, mealForm, setMealField, priceForm, setPriceForm, createMeal, createPrice, saving }: { categories: Row[]; categoryName: Map<string, string>; meals: Meal[]; mealForm: Record<string, string | boolean | number>; setMealField: (key: keyof typeof mealForm, value: string | boolean) => void; priceForm: { mealId: string; amount: string; taxRatePercent: string; taxInclusive: boolean }; setPriceForm: React.Dispatch<React.SetStateAction<{ mealId: string; amount: string; taxRatePercent: string; taxInclusive: boolean }>>; createMeal: () => void; createPrice: () => void; saving: boolean }) {
  const nutrition = Object.entries(emptyNutrition) as [keyof Nutrition, number][]
  const breakdown = priceBreakdown(priceForm.amount, priceForm.taxRatePercent, priceForm.taxInclusive)

  return <div className="grid gap-5 xl:grid-cols-2">
    <Card><CardContent className="p-5">
      <h2 className="font-black">إضافة وجبة بتفاصيلها الغذائية</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Input value={String(mealForm.code)} onChange={e => setMealField("code", e.target.value.toUpperCase())} placeholder="رمز الوجبة" />
        <Input value={String(mealForm.name)} onChange={e => setMealField("name", e.target.value)} placeholder="اسم الوجبة" />
        <select value={String(mealForm.categoryId)} onChange={e => setMealField("categoryId", e.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm"><option value="">اختر التصنيف</option>{categories.map(category => <option key={String(category.id)} value={String(category.id)}>{String(category.name ?? category.nameAr ?? "تصنيف")}</option>)}</select>
        <select value={String(mealForm.kind)} onChange={e => setMealField("kind", e.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm"><option value="MEAL">وجبة</option><option value="PRODUCT">منتج</option><option value="DRINK">مشروب</option></select>
        <select value={String(mealForm.portionClass)} onChange={e => setMealField("portionClass", e.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm"><option value="UNRESTRICTED">حصة قياسية يحددها الشيف</option><option value="STANDARD_150G">حصة 150 جرام</option><option value="LARGE_200G">حصة 200 جرام</option></select>
        <Input value={String(mealForm.allergens)} onChange={e => setMealField("allergens", e.target.value)} placeholder="الحساسيات: حليب، جلوتين..." />
      </div>
      <textarea value={String(mealForm.description)} onChange={e => setMealField("description", e.target.value)} placeholder="وصف مختصر للمشترك" className="mt-3 min-h-20 w-full rounded-xl border bg-background p-3 text-sm" />
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100"><p className="font-bold">القيم الغذائية للحصة الواحدة</p><p className="mt-1 text-xs leading-6">أدخل ما تحتويه الحصة التي سيتناولها العضو، وليس إجمالي قدر الوصفة. اختر وزن الحصة أعلاه (150 أو 200 جم)، أو عند اختيار «حصة قياسية» اكتب القيم للحجم الذي يقدمه الشيف فعليًا.</p></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{nutrition.map(([key]) => <label key={key} className="grid gap-1 text-xs font-medium text-muted-foreground"><span>{nutritionLabel(key)}</span><Input type="number" min="0" value={String(mealForm[key])} onChange={e => setMealField(key, e.target.value)} /></label>)}</div>
      {categories.length === 0 ? <p className="mt-3 text-xs text-amber-700">أضف تصنيفًا للمطعم أولًا من البيانات الرئيسية حتى يمكن حفظ الوجبة.</p> : null}
      <Button className="mt-5" onClick={createMeal} disabled={saving || !mealForm.code || !mealForm.name || !mealForm.categoryId}><Plus />إضافة الوجبة</Button>
    </CardContent></Card>
    <div className="space-y-5"><Card><CardContent className="p-5">
      <h2 className="font-black">تسعير الوجبة في الفرع الحالي</h2>
      <p className="mt-1 text-xs leading-6 text-muted-foreground">هذا السعر خاص بالفرع الحالي فقط، ولا يغيّر سعر الوجبة في الفروع الأخرى.</p>
      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>الوجبة</span><select value={priceForm.mealId} onChange={e => setPriceForm(current => ({ ...current, mealId: e.target.value }))} className="h-10 rounded-xl border bg-background px-3 text-sm"><option value="">اختر وجبة</option>{meals.map(meal => <option key={meal.id} value={meal.id}>{meal.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>{priceForm.taxInclusive ? "السعر الذي سيدفعه العضو شامل الضريبة (ر.س)" : "السعر قبل الضريبة (ر.س)"}</span><Input type="number" min="0" step="0.01" value={priceForm.amount} onChange={e => setPriceForm(current => ({ ...current, amount: e.target.value }))} placeholder="مثال: 28.75" /></label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground"><span>نسبة ضريبة القيمة المضافة (%)</span><Input type="number" min="0" max="100" step="0.01" value={priceForm.taxRatePercent} onChange={e => setPriceForm(current => ({ ...current, taxRatePercent: e.target.value }))} placeholder="15" /></label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={priceForm.taxInclusive} onChange={e => setPriceForm(current => ({ ...current, taxInclusive: e.target.checked }))} />السعر المُدخل شامل ضريبة القيمة المضافة</label>
      {breakdown !== undefined ? <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border bg-muted/30 p-3 text-center text-xs"><div><p className="text-muted-foreground">قبل الضريبة</p><p className="mt-1 font-black">{sar(breakdown.net)}</p></div><div><p className="text-muted-foreground">الضريبة</p><p className="mt-1 font-black">{sar(breakdown.tax)}</p></div><div><p className="text-muted-foreground">السعر النهائي</p><p className="mt-1 font-black text-primary">{sar(breakdown.gross)}</p></div></div> : <p className="mt-3 text-xs text-muted-foreground">اكتب السعر ونسبة الضريبة لعرض تفصيل السعر قبل الضريبة وبعدها.</p>}
      <Button className="mt-5" onClick={createPrice} disabled={saving || !priceForm.mealId || !priceForm.amount}><Save />حفظ السعر للفرع</Button>
    </CardContent></Card><Card><CardContent className="p-5"><h2 className="font-black">الكتالوج الحالي</h2><div className="mt-3 max-h-72 divide-y overflow-auto">{meals.map(meal => <div key={meal.id} className="py-3"><div className="flex justify-between gap-3"><p className="font-bold">{meal.name}</p><span className="text-xs text-muted-foreground">{categoryName.get(meal.categoryId) ?? "—"}</span></div><p className="mt-1 text-xs text-muted-foreground"><Flame className="ml-1 inline size-3 text-orange-500" />{meal.nutrition?.caloriesKcal ?? 0} kcal · P {meal.nutrition?.proteinGrams ?? 0}g · C {meal.nutrition?.carbohydratesGrams ?? 0}g · F {meal.nutrition?.fatGrams ?? 0}g</p>{meal.allergens?.length ? <p className="mt-1 text-[11px] text-amber-700">حساسيات: {meal.allergens.join("، ")}</p> : null}</div>)}</div></CardContent></Card></div>
  </div>
}

function KitchenPanel({ orders, transition, saving }: { orders: Row[]; transition: (order: Row, action: "START_PREPARING" | "MARK_READY" | "COMPLETE") => void; saving: boolean }) {
  const active = orders.filter(order => ["CONFIRMED", "PREPARING", "READY"].includes(String(order.status)))
  return <div className="grid gap-4 md:grid-cols-3">{(["CONFIRMED", "PREPARING", "READY"] as const).map(status => <Card key={status}><CardContent className="p-5"><div className="flex items-center justify-between"><h2 className="font-black">{status === "CONFIRMED" ? "طلبات جديدة" : status === "PREPARING" ? "قيد التحضير" : "جاهز للاستلام"}</h2><Badge>{active.filter(order => order.status === status).length}</Badge></div><div className="mt-4 space-y-3">{active.filter(order => order.status === status).map(order => <div key={String(order.id)} className="rounded-xl border p-3"><p className="font-bold">طلب {String(order.id).slice(0, 8)}</p><p className="mt-1 text-xs text-muted-foreground">{Array.isArray(order.lines) ? order.lines.map(line => String((((line as Row).quote as Row | undefined)?.targetName) ?? "صنف")).join("، ") : ""}</p>{status === "CONFIRMED" ? <Button className="mt-3 w-full" size="sm" onClick={() => transition(order, "START_PREPARING")} disabled={saving}>بدء التحضير</Button> : status === "PREPARING" ? <Button className="mt-3 w-full" size="sm" onClick={() => transition(order, "MARK_READY")} disabled={saving}>جاهز</Button> : <Button className="mt-3 w-full" size="sm" onClick={() => transition(order, "COMPLETE")} disabled={saving}>تسليم وإكمال</Button>}</div>)}{active.filter(order => order.status === status).length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">لا توجد طلبات.</p> : null}</div></CardContent></Card>)}</div>
}

function list(value: unknown): Row[] { if (Array.isArray(value)) return value.filter((item): item is Row => Boolean(item) && typeof item === "object"); if (value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)) return (value as { items: Row[] }).items; return [] }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
function priceBreakdown(amount: string, taxRatePercent: string, taxInclusive: boolean): { net: number; tax: number; gross: number } | undefined { if (amount.trim() === "" || taxRatePercent.trim() === "") return undefined; const entered = Number(amount); const rate = Number(taxRatePercent); if (!Number.isFinite(entered) || entered < 0 || !Number.isFinite(rate) || rate < 0 || rate > 100) return undefined; const factor = 1 + rate / 100; const net = taxInclusive ? entered / factor : entered; const tax = net * rate / 100; return { net, tax, gross: net + tax } }
function sar(value: number): string { return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) }
function split(value: string): string[] { return value.split(/[،,]/u).map(item => item.trim()).filter(Boolean) }
function isNotFound(value: unknown): boolean { return typeof value === "object" && value !== null && "problem" in value && Number((value as { problem?: { status?: number } }).problem?.status) === 404 }
function nutritionLabel(key: keyof Nutrition): string { return ({ caloriesKcal: "السعرات kcal", proteinGrams: "البروتين (غ)", carbohydratesGrams: "الكربوهيدرات (غ)", fatGrams: "الدهون (غ)", fiberGrams: "الألياف (غ)", sugarGrams: "السكريات (غ)", sodiumMilligrams: "الصوديوم (ملغ)" } as const)[key] }
function todayRiyadh(): string { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const get = (type: string) => parts.find(part => part.type === type)?.value ?? ""; return `${get("year")}-${get("month")}-${get("day")}` }
