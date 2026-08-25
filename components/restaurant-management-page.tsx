"use client"

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { Check, ChefHat, ClipboardList, Clock3, Flame, Loader2, MapPin, PackageOpen, Plus, Save, Search, Send, ShoppingBag, Trash2, UserRound, X } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { DateTimeInput } from "@/components/date-time-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/toast-provider"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

type Row = Record<string, unknown>
type MealPortionClass = "STANDARD_150G" | "LARGE_200G" | "UNRESTRICTED"
type Meal = Row & { id: string; name: string; code: string; categoryId: string; kind?: string; status?: string; portionClass?: MealPortionClass; nutrition?: Nutrition; allergens?: string[] }
type Nutrition = { caloriesKcal: number; proteinGrams: number; carbohydratesGrams: number; fatGrams: number; fiberGrams: number; sugarGrams: number; sodiumMilligrams: number }
type MenuItem = { mealId: string; enabled: boolean; availableQuantity?: number; specialPriceMinor?: string }
type Menu = { businessDate: string; status: "DRAFT" | "PUBLISHED" | "CLOSED"; version: number; items: MenuItem[] }
type OrderLine = { id?: string; quote?: { targetName?: string; targetCode?: string; quantity?: number | string } }
type RestaurantOrder = Row & { id: string; branchId: string; status: string; sourceType?: string; salesOrderId?: string; subscriptionId?: string; memberName?: string; memberNumber?: string; createdAt?: string; grossMinor?: string; currency?: string; version: number; lines?: OrderLine[] }
type MemberOption = { id: string; name: string; memberNumber: string; legacyMemberNumber?: string; phoneE164?: string; nationalId?: string; contacts?: Array<{ type?: string; value?: string; isPrimary?: boolean }>; status?: string }
type SubscriptionOption = { id: string; memberId: string; subscriptionNumber: string; status: string; commercialSnapshot?: { packageName?: string; fulfillmentKind?: string }; entitlements?: Array<{ serviceCodeSnapshot?: string; fulfillmentKind?: string; visitAllowance?: number; visitsUsed?: number }> }

const emptyNutrition: Nutrition = { caloriesKcal: 0, proteinGrams: 0, carbohydratesGrams: 0, fatGrams: 0, fiberGrams: 0, sugarGrams: 0, sodiumMilligrams: 0 }

export function RestaurantManagementPage() {
  const context = useAppContext()
  const toast = useToast()
  const [tab, setTab] = useState<"menu" | "catalog" | "redemptions" | "kitchen">("menu")
  const [date, setDate] = useState(todayRiyadh())
  const [categories, setCategories] = useState<Row[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [menu, setMenu] = useState<Menu | undefined>()
  const [redemptionMenu, setRedemptionMenu] = useState<Menu | undefined>()
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [orders, setOrders] = useState<RestaurantOrder[]>([])
  const [redemptionMemberSelection, setRedemptionMemberSelection] = useState<{ organizationId: string; branchId: string; member?: MemberOption }>({ organizationId: "", branchId: "" })
  const [subscriptions, setSubscriptions] = useState<SubscriptionOption[]>([])
  const [kitchenScope, setKitchenScope] = useState<"CURRENT" | "ALL">("CURRENT")
  const [loading, setLoading] = useState(hasRuntimeApi())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [mealForm, setMealForm] = useState({ code: "", name: "", categoryId: "", description: "", kind: "MEAL", portionClass: "UNRESTRICTED", allergens: "", ...emptyNutrition })
  const [priceForm, setPriceForm] = useState({ mealId: "", amount: "", taxRatePercent: "15", taxInclusive: true })
  const [redemptionForm, setRedemptionForm] = useState({ memberId: "", subscriptionId: "", mealId: "", quantity: "1" })

  const canReadMenu = context.canAccess(["restaurant.menu.read"])
  const canManageMenu = context.canAccess(["restaurant.menu.manage"])
  const canReadCatalog = context.canAccess(["restaurant.catalog.read"])
  const canManageCatalog = context.canAccess(["restaurant.catalog.manage"])
  const canManagePricing = context.canAccess(["restaurant.pricing.manage"])
  const canReadOrders = context.canAccess(["restaurant.orders.read"])
  const canManageOrders = context.canAccess(["restaurant.orders.manage"])
  const canRedeemMealPlans = context.canAccess(["restaurant.meal-plans.redeem"])
  const availableTabs = useMemo(() => [
    ...(canReadMenu ? [{ key: "menu" as const, label: "قائمة اليوم", icon: ClipboardList }] : []),
    ...(canReadCatalog ? [{ key: "catalog" as const, label: "الوجبات والأسعار", icon: ChefHat }] : []),
    ...(canRedeemMealPlans ? [{ key: "redemptions" as const, label: "صرف خطة وجبات", icon: PackageOpen }] : []),
    ...(canReadOrders ? [{ key: "kitchen" as const, label: "المطبخ", icon: ShoppingBag }] : []),
  ], [canReadCatalog, canReadMenu, canReadOrders, canRedeemMealPlans])
  const categoryName = useMemo(() => new Map(categories.map(item => [String(item.id), String(item.name ?? item.nameAr ?? "تصنيف")])) , [categories])
  const branchName = useMemo(() => new Map(context.branches.map(branch => [branch.id, branch.nameAr ?? branch.name ?? "فرع غير مسمى"])), [context.branches])
  const canReadAllRestaurantBranches = context.grants.some(grant => grant.organizationId === context.organizationId && ["restaurant.orders.read", "restaurant.orders.prepare", "restaurant.orders.manage"].includes(grant.permission) && grant.scopeType === "ORGANIZATION")
  const canPrepareOrders = context.canAccess(["restaurant.orders.prepare"])
  const effectiveKitchenScope = canReadAllRestaurantBranches ? kitchenScope : "CURRENT"
  const activeTab = availableTabs.some(item => item.key === tab) ? tab : availableTabs[0]?.key
  const redemptionMember = redemptionMemberSelection.organizationId === context.organizationId && redemptionMemberSelection.branchId === context.branchId ? redemptionMemberSelection.member : undefined
  const scopedRedemptionForm = redemptionMember ? redemptionForm : { ...redemptionForm, memberId: "", subscriptionId: "" }

  async function load() {
    if (!hasRuntimeApi() || !context.organizationId || !context.branchId) { setLoading(false); return }
    setLoading(true); setError("")
    try {
      const base = `/organizations/${context.organizationId}`
      const [categoryResponse, mealResponse] = canReadCatalog ? await Promise.all([
        apiRequest<Row[] | { items: Row[] }>(`${base}/restaurant/meal-categories?branchId=${encodeURIComponent(context.branchId)}&limit=100`),
        apiRequest<Meal[] | { items: Meal[] }>(`${base}/restaurant/meals?branchId=${encodeURIComponent(context.branchId)}&limit=100`),
      ]) : [{ data: [] as Row[] }, { data: [] as Meal[] }]
      const orderBranch = effectiveKitchenScope === "ALL" ? "" : `&branchId=${encodeURIComponent(context.branchId)}`
      const redemptionDate = todayRiyadh()
      const [orderResult, menuResult, redemptionMenuResult] = await Promise.allSettled([
        canReadOrders ? apiRequest<RestaurantOrder[] | { items: RestaurantOrder[] }>(`${base}/restaurant-orders?limit=100${orderBranch}`) : Promise.resolve({ data: [] as RestaurantOrder[] }),
        canReadMenu ? apiRequest<Menu>(`${base}/branches/${context.branchId}/daily-menus/${date}`).catch(reason => isNotFound(reason) ? undefined : Promise.reject(reason)) : Promise.resolve(undefined),
        canRedeemMealPlans && date !== redemptionDate ? apiRequest<Menu>(`${base}/branches/${context.branchId}/daily-menus/${redemptionDate}`).catch(reason => isNotFound(reason) ? undefined : Promise.reject(reason)) : Promise.resolve(undefined),
      ])
      const nextCategories = list(categoryResponse.data)
      const nextMeals = list(mealResponse.data) as Meal[]
      const currentMenu = menuResult.status === "fulfilled" ? menuResult.value?.data : undefined
      const currentRedemptionMenu = date === redemptionDate ? currentMenu : redemptionMenuResult.status === "fulfilled" ? redemptionMenuResult.value?.data : undefined
      if (orderResult.status === "rejected") throw orderResult.reason
      if (redemptionMenuResult.status === "rejected") throw redemptionMenuResult.reason
      setCategories(nextCategories); setMeals(nextMeals); setOrders(orderList(orderResult.value.data)); setMenu(currentMenu); setRedemptionMenu(currentRedemptionMenu)
      setMenuItems(currentMenu?.items ?? [])
      setMealForm(current => current.categoryId || !nextCategories[0]?.id ? current : { ...current, categoryId: String(nextCategories[0].id) })
    } catch (reason) { setError(humanError(reason, "تعذر تحميل بيانات المطعم.")) }
    finally { setLoading(false) }
  }

  useEffect(() => { const frame = requestAnimationFrame(() => { void load() }); return () => cancelAnimationFrame(frame) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.organizationId, context.branchId, date, effectiveKitchenScope, canReadCatalog, canReadMenu, canReadOrders, canRedeemMealPlans])

  useEffect(() => {
    let active = true
    const frame = requestAnimationFrame(() => {
      setSubscriptions([])
      setRedemptionForm(current => ({ ...current, subscriptionId: "", mealId: "" }))
      if (!hasRuntimeApi() || !context.organizationId || !context.branchId || !canRedeemMealPlans || !redemptionMember?.id) return
      void apiRequest<SubscriptionOption[] | { items: SubscriptionOption[] }>(`/organizations/${context.organizationId}/subscriptions?memberId=${encodeURIComponent(redemptionMember.id)}&branchId=${encodeURIComponent(context.branchId)}&limit=100`)
        .then(response => {
          if (!active) return
          const eligible = (list(response.data) as SubscriptionOption[]).filter(subscription =>
            ["ACTIVE", "ACTIVE_PROVISIONAL"].includes(subscription.status) && subscription.commercialSnapshot?.fulfillmentKind === "MEAL_PLAN",
          )
          setSubscriptions(eligible)
          setRedemptionForm(current => ({ ...current, subscriptionId: eligible[0]?.id ?? "", mealId: "" }))
        })
        .catch(reason => { if (active) setError(humanError(reason, "تعذر تحميل خطط الوجبات النشطة لهذا العضو.")) })
    })
    return () => { active = false; cancelAnimationFrame(frame) }
  }, [canRedeemMealPlans, context.branchId, context.organizationId, redemptionMember?.id])

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
      setMenu(active); if (date === todayRiyadh()) setRedemptionMenu(active); setMenuItems(active.items); toast.success("تم نشر قائمة اليوم وتحديث ما يظهر للمشتركين.")
    } catch (reason) { setError(humanError(reason, "تعذر حفظ قائمة اليوم.")) } finally { setSaving(false) }
  }

  async function hideMenu() {
    if (!context.organizationId || !context.branchId || !menu || menu.status !== "PUBLISHED") return
    setSaving(true); setError("")
    try {
      const hiddenItems = menuItems.map(item => ({ mealId: item.mealId, enabled: false, ...(item.availableQuantity === undefined ? {} : { availableQuantity: item.availableQuantity }), ...(item.specialPriceMinor === undefined ? {} : { specialPriceMinor: item.specialPriceMinor }) }))
      const response = await apiRequest<Menu>(`/organizations/${context.organizationId}/branches/${context.branchId}/daily-menus/${date}`, { method: "PUT", body: JSON.stringify({ expectedVersion: menu.version, items: hiddenItems }) })
      setMenu(response.data); if (date === todayRiyadh()) setRedemptionMenu(response.data); setMenuItems(response.data.items); toast.success("تم إيقاف عرض قائمة اليوم للمشتركين. يمكنك إعادة تفعيل أي وجبة ونشر التحديث في أي وقت.")
    } catch (reason) { setError(humanError(reason, "تعذر إيقاف عرض القائمة.")) } finally { setSaving(false) }
  }

  async function transitionOrder(order: RestaurantOrder, action: "START_PREPARING" | "MARK_READY" | "COMPLETE") {
    if (!context.organizationId || !order.id) return
    setSaving(true); setError("")
    try { await apiRequest(`/organizations/${context.organizationId}/restaurant-orders/${order.id}/transitions`, { method: "POST", body: JSON.stringify({ expectedVersion: order.version, action }) }); toast.success("تم تحديث حالة الطلب بنجاح."); await load() }
    catch (reason) { setError(humanError(reason, "تعذر تحديث حالة الطلب.")) } finally { setSaving(false) }
  }

  async function cancelOrder(order: RestaurantOrder, reason: string) {
    if (!context.organizationId || !order.id) return
    setSaving(true); setError("")
    try { await apiRequest(`/organizations/${context.organizationId}/restaurant-orders/${order.id}/cancellations`, { method: "POST", body: JSON.stringify({ expectedVersion: order.version, reason }) }); toast.success("تم إلغاء طلب المطعم وتسجيل السبب."); await load() }
    catch (failure) { setError(humanError(failure, "تعذر إلغاء طلب المطعم.")) } finally { setSaving(false) }
  }

  async function redeemMealPlan() {
    if (!context.organizationId || !context.branchId || !redemptionForm.memberId || !redemptionForm.subscriptionId || !redemptionForm.mealId) return
    setSaving(true); setError("")
    try {
      await apiRequest(`/organizations/${context.organizationId}/restaurant-orders/meal-plan-redemptions`, { method: "POST", body: JSON.stringify({ branchId: context.branchId, memberId: redemptionForm.memberId, subscriptionId: redemptionForm.subscriptionId, mealId: redemptionForm.mealId, quantity: Math.max(1, Math.trunc(number(redemptionForm.quantity))) }) })
      setRedemptionForm(current => ({ ...current, mealId: "", quantity: "1" }))
      toast.success("تم صرف الوجبة من رصيد الخطة وإرسال الطلب إلى المطبخ.")
      await load()
    } catch (reason) { setError(humanError(reason, "تعذر صرف الوجبة من خطة العضو.")) } finally { setSaving(false) }
  }

  return <div className="fade-up space-y-5">
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><Badge variant="outline" className="mb-3 border-primary/30 bg-primary/10 text-amber-700 dark:text-primary">تشغيل المطعم</Badge><h1 className="text-2xl font-black sm:text-3xl">المطبخ وقائمة الوجبات</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">الوجبة تُعرّف مرة واحدة بقيمها الغذائية، ثم يحدد الشيف سعرها وإتاحتها لكل فرع ولكل يوم.</p></div><nav aria-label="أقسام تشغيل المطعم" className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:flex-wrap">{availableTabs.map(item => <Button key={item.key} className="w-full justify-center lg:w-auto" variant={activeTab === item.key ? "default" : "outline"} onClick={() => setTab(item.key)}><item.icon />{item.label}</Button>)}</nav></header>
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    {loading ? <Card><CardContent className="grid min-h-72 place-items-center"><span className="size-9 animate-spin rounded-full border-4 border-primary border-t-transparent" /></CardContent></Card> : !availableTabs.length ? <Card><CardContent className="grid min-h-72 place-items-center text-sm text-muted-foreground">لا توجد صلاحيات مطعم متاحة لهذا الحساب.</CardContent></Card> : activeTab === "menu" ? <MenuPanel date={date} setDate={setDate} meals={meals} menu={menu} menuItems={menuItems} add={addMenuMeal} remove={removeMenuMeal} update={updateMenuMeal} publish={publishMenu} hide={hideMenu} saving={saving} canManage={canManageMenu} /> : activeTab === "catalog" ? <CatalogPanel categories={categories} categoryName={categoryName} meals={meals} mealForm={mealForm} setMealField={setMealField} priceForm={priceForm} setPriceForm={setPriceForm} createMeal={createMeal} createPrice={createPrice} saving={saving} canManageCatalog={canManageCatalog} canManagePricing={canManagePricing} /> : activeTab === "redemptions" ? <MealPlanRedemptionPanel member={redemptionMember} setMember={member => setRedemptionMemberSelection({ organizationId: context.organizationId, branchId: context.branchId, ...(member ? { member } : {}) })} subscriptions={subscriptions} meals={meals} menu={redemptionMenu} form={scopedRedemptionForm} setForm={setRedemptionForm} redeem={redeemMealPlan} saving={saving} /> : <KitchenPanel orders={orders} transition={transitionOrder} cancel={cancelOrder} saving={saving} scope={effectiveKitchenScope} setScope={setKitchenScope} canReadAllBranches={canReadAllRestaurantBranches} canPrepare={canPrepareOrders} canManage={canManageOrders} currentBranchName={branchName.get(context.branchId) ?? "الفرع الحالي"} branchName={branchName} />}
  </div>
}

function MenuPanel({ date, setDate, meals, menu, menuItems, add, remove, update, publish, hide, saving, canManage }: { date: string; setDate: (value: string) => void; meals: Meal[]; menu?: Menu; menuItems: MenuItem[]; add: (id: string) => void; remove: (id: string) => void; update: (id: string, value: Partial<MenuItem>) => void; publish: () => void; hide: () => void; saving: boolean; canManage: boolean }) {
  const selected = new Map(menuItems.map(item => [item.mealId, item]))
  const closed = menu?.status === "CLOSED"
  const hasVisibleItems = menuItems.some(item => item.enabled)
  return <Card><CardContent className="p-5"><div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-end"><div><h2 className="font-black">قائمة الفرع اليومية</h2><p className="mt-1 text-xs text-muted-foreground">{menu?.status === "PUBLISHED" ? (hasVisibleItems ? "منشورة للمشتركين. يمكنك تعديل الوجبات أو إخفاء أي وجبة ثم حفظ التحديث." : "القائمة محفوظة لكن لا توجد وجبة معروضة للمشتركين حاليًا.") : closed ? "تم إيقاف عرض هذه القائمة للمشتركين." : "أضف الوجبات ثم انشرها مباشرة للمشتركين."}</p></div><DateTimeInput type="date" value={date} onChange={event => setDate(event.target.value)} className="w-full sm:w-48" /></div>{!canManage ? <p className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">عرض القائمة فقط — تعديل قائمة اليوم يحتاج صلاحية إدارة قائمة المطعم.</p> : null}<div className="mt-4 divide-y">{meals.map(meal => { const item = selected.get(meal.id); return <div key={meal.id} className="grid gap-3 py-4 md:grid-cols-[auto_1fr_130px_150px_auto]"><div className="self-center">{item ? <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={item.enabled} disabled={!canManage || closed} onChange={event => update(meal.id, { enabled: event.target.checked })} className="size-4 accent-primary" />ظاهر للمشتركين</label> : canManage ? <Button variant="outline" size="sm" disabled={closed} onClick={() => add(meal.id)}><Plus />إضافة</Button> : <span className="text-xs text-muted-foreground">غير مضافة</span>}</div><div><p className="font-bold">{meal.name}</p><p className="mt-1 text-xs text-muted-foreground">{meal.nutrition?.caloriesKcal ?? 0} سعرة · بروتين {meal.nutrition?.proteinGrams ?? 0}غ · كربوهيدرات {meal.nutrition?.carbohydratesGrams ?? 0}غ</p></div><Input type="number" min="1" disabled={!canManage || !item || closed} value={item?.availableQuantity ?? ""} onChange={event => update(meal.id, { availableQuantity: event.target.value ? number(event.target.value) : undefined })} placeholder="الكمية المتاحة" /><Input type="number" min="0" step="0.01" disabled={!canManage || !item || closed} value={item?.specialPriceMinor === undefined ? "" : String(Number(item.specialPriceMinor) / 100)} onChange={event => update(meal.id, { specialPriceMinor: event.target.value ? String(Math.round(number(event.target.value) * 100)) : undefined })} placeholder="سعر خاص (ر.س)" />{item && canManage ? <Button variant="ghost" size="icon" disabled={closed} onClick={() => remove(meal.id)} aria-label={`حذف ${meal.name} من قائمة اليوم`}><Trash2 className="size-4 text-destructive" /></Button> : <span />}</div> })}</div>{canManage ? <div className="mt-5 flex flex-wrap gap-2"><Button onClick={publish} disabled={saving || closed || menuItems.length === 0}><Send />{menu ? "حفظ التحديثات" : "نشر قائمة اليوم"}</Button><Button variant="outline" onClick={hide} disabled={saving || menu?.status !== "PUBLISHED" || !hasVisibleItems}><Save />إيقاف العرض للمشتركين</Button></div> : null}</CardContent></Card>
}

function CatalogPanel({ categories, categoryName, meals, mealForm, setMealField, priceForm, setPriceForm, createMeal, createPrice, saving, canManageCatalog, canManagePricing }: { categories: Row[]; categoryName: Map<string, string>; meals: Meal[]; mealForm: Record<string, string | boolean | number>; setMealField: (key: keyof typeof mealForm, value: string | boolean) => void; priceForm: { mealId: string; amount: string; taxRatePercent: string; taxInclusive: boolean }; setPriceForm: React.Dispatch<React.SetStateAction<{ mealId: string; amount: string; taxRatePercent: string; taxInclusive: boolean }>>; createMeal: () => void; createPrice: () => void; saving: boolean; canManageCatalog: boolean; canManagePricing: boolean }) {
  const nutrition = Object.entries(emptyNutrition) as [keyof Nutrition, number][]
  const breakdown = priceBreakdown(priceForm.amount, priceForm.taxRatePercent, priceForm.taxInclusive)

  return <div className="grid gap-5 xl:grid-cols-2">
    {canManageCatalog ? <Card><CardContent className="p-5">
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
    </CardContent></Card> : null}
    <div className="space-y-5">{canManagePricing ? <Card><CardContent className="p-5">
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
    </CardContent></Card> : null}<Card><CardContent className="p-5"><h2 className="font-black">الكتالوج الحالي</h2>{!canManageCatalog && !canManagePricing ? <p className="mt-1 text-xs text-muted-foreground">يمكنك استعراض الوجبات. التعديل والتسعير يظهران فقط عند منح الصلاحية المناسبة.</p> : null}<div className="mt-3 max-h-72 divide-y overflow-auto">{meals.map(meal => <div key={meal.id} className="py-3"><div className="flex justify-between gap-3"><p className="font-bold">{meal.name}</p><span className="text-xs text-muted-foreground">{categoryName.get(meal.categoryId) ?? "—"}</span></div><p className="mt-1 text-xs text-muted-foreground"><Flame className="ml-1 inline size-3 text-orange-500" />{meal.nutrition?.caloriesKcal ?? 0} kcal · P {meal.nutrition?.proteinGrams ?? 0}g · C {meal.nutrition?.carbohydratesGrams ?? 0}g · F {meal.nutrition?.fatGrams ?? 0}g</p>{meal.allergens?.length ? <p className="mt-1 text-[11px] text-amber-700">حساسيات: {meal.allergens.join("، ")}</p> : null}</div>)}</div></CardContent></Card></div>
  </div>
}

function MealPlanRedemptionPanel({ member, setMember, subscriptions, meals, menu, form, setForm, redeem, saving }: { member?: MemberOption; setMember: (member?: MemberOption) => void; subscriptions: SubscriptionOption[]; meals: Meal[]; menu?: Menu; form: { memberId: string; subscriptionId: string; mealId: string; quantity: string }; setForm: Dispatch<SetStateAction<{ memberId: string; subscriptionId: string; mealId: string; quantity: string }>>; redeem: () => void; saving: boolean }) {
  const context = useAppContext()
  const searchRoot = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<MemberOption[]>([])
  const [searching, setSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchError, setSearchError] = useState("")
  const selectedSubscription = subscriptions.find(subscription => subscription.id === form.subscriptionId)
  const requiredPortionClass = mealPlanPortionClass(selectedSubscription)
  const publishedMealIds = new Set(menu?.status === "PUBLISHED" ? menu.items.filter(item => item.enabled).map(item => item.mealId) : [])
  const redeemableMeals = meals.filter(meal =>
    (meal.kind === undefined || meal.kind === "MEAL") &&
    (meal.status === undefined || meal.status === "ACTIVE") &&
    publishedMealIds.has(meal.id) &&
    requiredPortionClass !== undefined && meal.portionClass === requiredPortionClass,
  )
  const selectedEntitlement = selectedSubscription?.entitlements?.find(entitlement => entitlement.fulfillmentKind === "MEAL_PLAN")
  const remainingMeals = selectedEntitlement?.visitAllowance === undefined ? undefined : Math.max(0, selectedEntitlement.visitAllowance - (selectedEntitlement.visitsUsed ?? 0))

  useEffect(() => {
    const search = query.trim()
    if (member || search.length < 2 || !context.organizationId || !context.branchId || !hasRuntimeApi()) {
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      setSearchError("")
      void apiRequest<MemberOption[] | { items: MemberOption[] }>(`/organizations/${context.organizationId}/members?branchId=${encodeURIComponent(context.branchId)}&status=ACTIVE&search=${encodeURIComponent(search)}&limit=20`)
        .then(response => {
          if (cancelled) return
          setResults((list(response.data) as MemberOption[]).filter(item => item.id && item.name))
          setSearchOpen(true)
        })
        .catch(reason => {
          if (cancelled) return
          setResults([])
          setSearchError(humanError(reason, "تعذر البحث عن الأعضاء في الفرع الحالي."))
          setSearchOpen(true)
        })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 300)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [context.branchId, context.organizationId, member, query])

  useEffect(() => {
    function close(event: MouseEvent) { if (!searchRoot.current?.contains(event.target as Node)) setSearchOpen(false) }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setSearchOpen(false) }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", escape)
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape) }
  }, [])

  function selectMember(selected: MemberOption) {
    setMember(selected)
    setQuery("")
    setResults([])
    setSearching(false)
    setSearchOpen(false)
    setSearchError("")
    setForm(current => ({ ...current, memberId: selected.id, subscriptionId: "", mealId: "" }))
  }

  function clearMember(nextQuery = "") {
    setMember(undefined)
    setQuery(nextQuery)
    setResults([])
    setSearching(nextQuery.trim().length >= 2)
    setSearchError("")
    setSearchOpen(nextQuery.trim().length >= 2)
    setForm(current => ({ ...current, memberId: "", subscriptionId: "", mealId: "" }))
  }

  return <Card><CardContent className="p-5 sm:p-6">
    <div className="flex flex-col justify-between gap-3 border-b pb-5 sm:flex-row sm:items-start"><div><h2 className="text-lg font-black">صرف وجبة من خطة عضو</h2><p className="mt-1 max-w-2xl text-sm leading-7 text-muted-foreground">اختر العضو أولًا، ثم خطته النشطة والوجبة والكمية. عند التأكيد يُخصم الرصيد مرة واحدة ويصل الطلب مباشرة إلى لوحة المطبخ.</p></div><Badge variant="outline" className="w-fit">الفرع الحالي فقط</Badge></div>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold"><span>ابحث واختر العضو</span><div ref={searchRoot} className="relative">
        {searching ? <Loader2 className="pointer-events-none absolute right-3 top-1/2 z-10 size-4 -translate-y-1/2 animate-spin text-primary" /> : <Search className="pointer-events-none absolute right-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />}
        <input role="combobox" aria-expanded={searchOpen && !member && query.trim().length >= 2} aria-controls="meal-plan-member-results" aria-autocomplete="list" autoComplete="off" className="h-12 w-full rounded-xl border bg-background pr-10 pl-10 text-sm font-normal outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/15" value={member ? `${member.name} — ${member.memberNumber}` : query} placeholder="الاسم أو الجوال أو الهوية أو العضوية أو رقم النظام أو الباركود" onFocus={() => setSearchOpen(true)} onChange={event => clearMember(event.target.value)} />
        {(member || query) && <button type="button" onClick={() => clearMember()} className="absolute left-2 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground" aria-label="مسح العضو المختار"><X className="size-4" /></button>}
        {searchOpen && !member && query.trim().length >= 2 && <div id="meal-plan-member-results" role="listbox" className="absolute inset-x-0 top-[calc(100%+.45rem)] z-40 max-h-72 overflow-y-auto rounded-2xl border bg-popover p-2 shadow-2xl">
          {searching ? <div className="grid min-h-24 place-items-center"><Loader2 className="animate-spin text-primary" /></div> : results.length ? results.map(result => <button key={result.id} type="button" role="option" aria-selected={false} onClick={() => selectMember(result)} className="flex w-full items-center gap-3 rounded-xl p-3 text-right transition hover:bg-secondary"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 font-black text-primary">{result.name.charAt(0) || "ع"}</span><span className="min-w-0 flex-1"><span className="block truncate font-black">{result.name}</span><span className="mt-1 block truncate text-[11px] font-normal text-muted-foreground" dir="ltr">{memberSecondary(result)}</span></span><Check className="size-4 opacity-0" /></button>) : <p className="p-5 text-center text-xs font-normal leading-6 text-muted-foreground">{searchError || "لا توجد نتائج مطابقة في الفرع الحالي."}</p>}
        </div>}
      </div><span className="text-[10px] font-normal leading-5 text-muted-foreground">{member ? `تم اختيار ${member.name}.` : query.trim().length > 0 && query.trim().length < 2 ? "اكتب حرفين أو رقمين على الأقل لبدء البحث." : "يبحث النظام في أعضاء الفرع الحالي فقط."}</span></label>
      <label className="grid gap-2 text-sm font-bold"><span>خطة الوجبات النشطة</span><select value={form.subscriptionId} disabled={!form.memberId || subscriptions.length === 0} onChange={event => setForm(current => ({ ...current, subscriptionId: event.target.value, mealId: "" }))} className="h-12 rounded-xl border bg-background px-3"><option value="">{!form.memberId ? "اختر العضو أولًا" : subscriptions.length === 0 ? "لا توجد خطة وجبات نشطة لهذا العضو" : "اختر الخطة"}</option>{subscriptions.map(subscription => <option key={subscription.id} value={subscription.id}>{subscription.commercialSnapshot?.packageName ?? "خطة وجبات"} — {subscription.subscriptionNumber}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-bold"><span>الوجبة</span><select value={form.mealId} disabled={!selectedSubscription || menu?.status !== "PUBLISHED" || redeemableMeals.length === 0} onChange={event => setForm(current => ({ ...current, mealId: event.target.value }))} className="h-12 rounded-xl border bg-background px-3"><option value="">{!selectedSubscription ? "اختر الخطة أولًا" : menu?.status !== "PUBLISHED" ? "يجب نشر قائمة اليوم أولًا" : redeemableMeals.length === 0 ? "لا توجد وجبة منشورة متوافقة مع الخطة" : "اختر الوجبة"}</option>{redeemableMeals.map(meal => <option key={meal.id} value={meal.id}>{meal.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-bold"><span>الكمية</span><Input type="number" min="1" max="100" step="1" value={form.quantity} onChange={event => setForm(current => ({ ...current, quantity: event.target.value }))} /></label>
    </div>
    {menu?.status !== "PUBLISHED" ? <div role="status" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"><p className="font-black">لا توجد قائمة يوم منشورة لهذا الفرع.</p><p>افتح تبويب «قائمة اليوم»، أضف الوجبات وحدد أسعارها ثم انشر القائمة قبل صرف أي وجبة.</p></div> : selectedSubscription && requiredPortionClass === undefined ? <div role="status" className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">الخطة المختارة لا تحدد حجم وجبة مدعومًا. راجع خدمة الباقة قبل الصرف.</div> : selectedSubscription && redeemableMeals.length === 0 ? <div role="status" className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">قائمة اليوم منشورة، لكن لا تحتوي على وجبة {portionLabel(requiredPortionClass)} متاحة لهذه الخطة.</div> : null}
    {member && selectedSubscription ? <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><p className="font-black">ملخص العملية</p><p className="mt-2 text-muted-foreground">العضو: <span className="font-bold text-foreground">{member.name} — {member.memberNumber}</span></p><p className="mt-1 text-muted-foreground">الخطة: <span className="font-bold text-foreground">{selectedSubscription.commercialSnapshot?.packageName ?? selectedSubscription.subscriptionNumber}</span></p>{requiredPortionClass ? <p className="mt-1 text-muted-foreground">الحجم المسموح: <span className="font-bold text-foreground">{portionLabel(requiredPortionClass)}</span></p> : null}{remainingMeals !== undefined ? <p className="mt-1 text-muted-foreground">الرصيد المتبقي: <span className="font-bold text-foreground">{remainingMeals} وجبة</span></p> : null}</div> : null}
    <Button className="mt-5" disabled={saving || !form.memberId || !form.subscriptionId || !form.mealId || number(form.quantity) < 1} onClick={redeem}><PackageOpen />صرف الوجبة وإرسالها للمطبخ</Button>
  </CardContent></Card>
}

function KitchenPanel({ orders, transition, cancel, saving, scope, setScope, canReadAllBranches, canPrepare, canManage, currentBranchName, branchName }: { orders: RestaurantOrder[]; transition: (order: RestaurantOrder, action: "START_PREPARING" | "MARK_READY" | "COMPLETE") => void; cancel: (order: RestaurantOrder, reason: string) => void; saving: boolean; scope: "CURRENT" | "ALL"; setScope: (scope: "CURRENT" | "ALL") => void; canReadAllBranches: boolean; canPrepare: boolean; canManage: boolean; currentBranchName: string; branchName: Map<string, string> }) {
  const [cancelTarget, setCancelTarget] = useState<RestaurantOrder | undefined>()
  const [cancelReason, setCancelReason] = useState("")
  const active = orders.filter(order => ["CONFIRMED", "PREPARING", "READY"].includes(String(order.status)))
  return <div className="space-y-4"><Card><CardContent className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"><div><p className="font-black">نطاق طلبات المطبخ</p><p className="mt-1 text-xs text-muted-foreground">تعرض اللوحة طلبات {scope === "ALL" ? "جميع الفروع" : currentBranchName} فقط.</p></div><select aria-label="نطاق طلبات المطبخ" value={scope} onChange={event => setScope(event.target.value as "CURRENT" | "ALL")} className="h-11 min-w-56 rounded-xl border bg-background px-3 text-sm font-bold"><option value="CURRENT">الفرع الحالي — {currentBranchName}</option>{canReadAllBranches ? <option value="ALL">كل الفروع</option> : null}</select></CardContent></Card>{cancelTarget ? <Card className="border-red-300"><CardContent className="p-5"><h2 className="font-black text-destructive">إلغاء طلب #{cancelTarget.id.slice(0, 8).toUpperCase()}</h2><p className="mt-1 text-xs text-muted-foreground">اكتب سببًا واضحًا ليظهر في السجل التشغيلي، ثم أكد الإلغاء.</p><textarea autoFocus value={cancelReason} onChange={event => setCancelReason(event.target.value)} className="mt-3 min-h-24 w-full rounded-xl border bg-background p-3 text-sm" placeholder="مثال: طلب العضو الإلغاء قبل بدء التحضير" /><div className="mt-3 flex gap-2"><Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={saving || cancelReason.trim().length < 3} onClick={() => { cancel(cancelTarget, cancelReason.trim()); setCancelTarget(undefined); setCancelReason("") }}><Trash2 />تأكيد إلغاء الطلب</Button><Button variant="outline" onClick={() => { setCancelTarget(undefined); setCancelReason("") }}>تراجع</Button></div></CardContent></Card> : null}<div className="grid gap-4 xl:grid-cols-3">{(["CONFIRMED", "PREPARING", "READY"] as const).map(status => <Card key={status}><CardContent className="p-5"><div className="flex items-center justify-between"><h2 className="font-black">{status === "CONFIRMED" ? "طلبات جديدة" : status === "PREPARING" ? "قيد التحضير" : "جاهز للاستلام"}</h2><Badge>{active.filter(order => order.status === status).length}</Badge></div><div className="mt-4 space-y-3">{active.filter(order => order.status === status).map(order => <OrderCard key={order.id} order={order} branch={branchName.get(order.branchId) ?? "فرع غير معروف"} canPrepare={canPrepare} canManage={canManage} saving={saving} action={status === "CONFIRMED" ? "START_PREPARING" : status === "PREPARING" ? "MARK_READY" : "COMPLETE"} actionLabel={status === "CONFIRMED" ? "بدء التحضير" : status === "PREPARING" ? "جاهز للاستلام" : "تسليم وإكمال"} transition={transition} onCancel={() => setCancelTarget(order)} />)}{active.filter(order => order.status === status).length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">لا توجد طلبات في هذا النطاق.</p> : null}</div></CardContent></Card>)}</div></div>
}

function OrderCard({ order, branch, canPrepare, canManage, saving, action, actionLabel, transition, onCancel }: { order: RestaurantOrder; branch: string; canPrepare: boolean; canManage: boolean; saving: boolean; action: "START_PREPARING" | "MARK_READY" | "COMPLETE"; actionLabel: string; transition: (order: RestaurantOrder, action: "START_PREPARING" | "MARK_READY" | "COMPLETE") => void; onCancel: () => void }) {
  const lines = order.lines ?? []
  const itemCount = lines.reduce((total, line) => total + Math.max(1, number(line.quote?.quantity ?? 1)), 0)
  const customer = order.memberName ? `${order.memberName}${order.memberNumber ? ` · ${order.memberNumber}` : ""}` : order.sourceType === "SALES" ? "طلب نقطة بيع غير مرتبط بعضو" : "بيانات العضو غير متاحة"
  const sourceReference = order.salesOrderId ?? order.subscriptionId
  const total = number(order.grossMinor) === 0 && order.sourceType === "MEAL_PLAN" ? "ضمن خطة الوجبات" : sar(number(order.grossMinor) / 100)
  return <article className="rounded-2xl border bg-background/40 p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-black">طلب #{order.id.slice(0, 8).toUpperCase()}</p><div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline">{order.sourceType === "MEAL_PLAN" ? "خطة وجبات" : "شراء مباشر"}</Badge>{sourceReference ? <Badge variant="secondary">مرجع #{sourceReference.slice(0, 8).toUpperCase()}</Badge> : null}</div></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">{itemCount} {itemCount === 1 ? "وحدة" : "وحدات"}</span></div><div className="mt-4 space-y-2 text-xs text-muted-foreground"><p className="flex items-center gap-2"><UserRound className="size-4 shrink-0" /><span className="font-bold text-foreground">{customer}</span></p><p className="flex items-center gap-2"><MapPin className="size-4 shrink-0" />{branch}</p>{order.createdAt ? <p className="flex items-center gap-2"><Clock3 className="size-4 shrink-0" />{formatOrderDate(order.createdAt)}</p> : null}</div><div className="mt-4 space-y-2 rounded-xl bg-muted/40 p-3">{lines.length ? lines.map((line, index) => <div key={line.id ?? `${order.id}-${index}`} className="flex items-start justify-between gap-3 text-sm"><span className="font-bold">{line.quote?.targetName ?? line.quote?.targetCode ?? "صنف غير مسمى"}</span><span className="shrink-0 font-black text-primary">الكمية: {Math.max(1, number(line.quote?.quantity ?? 1))}</span></div>) : <p className="flex items-center gap-2 text-xs text-muted-foreground"><PackageOpen className="size-4" />لا تتوفر تفاصيل الأصناف لهذا الطلب.</p>}</div><div className="mt-3 flex items-center justify-between border-t pt-3 text-sm"><span className="text-muted-foreground">الإجمالي</span><span className="font-black">{total}</span></div>{canPrepare ? <Button className="mt-4 w-full" size="sm" onClick={() => transition(order, action)} disabled={saving}>{actionLabel}</Button> : <p className="mt-4 rounded-xl bg-muted px-3 py-2 text-center text-xs text-muted-foreground">للعرض فقط — لا تملك صلاحية تحديث حالة الطلب.</p>}{canManage ? <Button className="mt-2 w-full text-destructive hover:text-destructive" variant="outline" size="sm" onClick={onCancel} disabled={saving}><Trash2 />إلغاء الطلب</Button> : null}</article>
}

function list(value: unknown): Row[] { if (Array.isArray(value)) return value.filter((item): item is Row => Boolean(item) && typeof item === "object"); if (value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)) return (value as { items: Row[] }).items; return [] }
function memberSecondary(member: MemberOption): string { const phone = member.phoneE164 ?? member.contacts?.find(contact => contact.type === "PHONE" && contact.isPrimary)?.value ?? member.contacts?.find(contact => contact.type === "PHONE")?.value; return [member.memberNumber, member.legacyMemberNumber ? `رقم النظام ${member.legacyMemberNumber}` : undefined, phone].filter(Boolean).join(" · ") || "لا توجد بيانات تعريف إضافية" }
function mealPlanPortionClass(subscription?: SubscriptionOption): Exclude<MealPortionClass, "UNRESTRICTED"> | undefined { const code = subscription?.entitlements?.find(entitlement => entitlement.fulfillmentKind === "MEAL_PLAN")?.serviceCodeSnapshot; return code === "DIET_MEAL_150G" ? "STANDARD_150G" : code === "DIET_MEAL_200G" ? "LARGE_200G" : undefined }
function portionLabel(portion?: MealPortionClass): string { return portion === "STANDARD_150G" ? "150 جم" : portion === "LARGE_200G" ? "200 جم" : "محدد" }
function orderList(value: unknown): RestaurantOrder[] { return list(value).filter((item): item is RestaurantOrder => typeof item.id === "string" && typeof item.branchId === "string" && typeof item.status === "string" && typeof item.version === "number") }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
function priceBreakdown(amount: string, taxRatePercent: string, taxInclusive: boolean): { net: number; tax: number; gross: number } | undefined { if (amount.trim() === "" || taxRatePercent.trim() === "") return undefined; const entered = Number(amount); const rate = Number(taxRatePercent); if (!Number.isFinite(entered) || entered < 0 || !Number.isFinite(rate) || rate < 0 || rate > 100) return undefined; const factor = 1 + rate / 100; const net = taxInclusive ? entered / factor : entered; const tax = net * rate / 100; return { net, tax, gross: net + tax } }
function sar(value: number): string { return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) }
function split(value: string): string[] { return value.split(/[،,]/u).map(item => item.trim()).filter(Boolean) }
function isNotFound(value: unknown): boolean { return typeof value === "object" && value !== null && "problem" in value && Number((value as { problem?: { status?: number } }).problem?.status) === 404 }
function nutritionLabel(key: keyof Nutrition): string { return ({ caloriesKcal: "السعرات kcal", proteinGrams: "البروتين (غ)", carbohydratesGrams: "الكربوهيدرات (غ)", fatGrams: "الدهون (غ)", fiberGrams: "الألياف (غ)", sugarGrams: "السكريات (غ)", sodiumMilligrams: "الصوديوم (ملغ)" } as const)[key] }
function todayRiyadh(): string { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const get = (type: string) => parts.find(part => part.type === type)?.value ?? ""; return `${get("year")}-${get("month")}-${get("day")}` }
function formatOrderDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "وقت غير متاح" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date) }
