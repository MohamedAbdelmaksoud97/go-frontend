"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CircleDollarSign,
  CreditCard,
  Loader2,
  ReceiptText,
  ShoppingCart,
} from "lucide-react";
import { useAppContext } from "@/components/app-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast-provider";
import {
  apiRequest,
  createIdempotencyKey,
  hasRuntimeApi,
} from "@/lib/api-client";
import { humanError } from "@/lib/human-errors";

type Meal = { id: string; name: string };
type RetailProduct = { id: string; name: string; code?: string; barcode?: string; grossMinor?: string; amountMinor?: string; quantityAvailable?: number };
type Menu = {
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  items: Array<{ mealId: string; enabled: boolean }>;
};
type Shift = { id: string; cashPointId: string; status: "OPEN" | "CLOSED" };
type CashPoint = { id: string; name?: string; code?: string };
type Invoice = {
  id: string;
  invoiceNumber?: string;
  grossMinor?: string;
  paidMinor?: string;
  buyerName?: string;
  memberName?: string;
  status?: string;
};
type Member = {
  id: string;
  name?: string;
  fullNameAr?: string;
  memberNumber?: string;
};

const cashierPermissions = [
  "sales.checkout",
  "sales.read",
  "members.read",
  "restaurant.catalog.read",
  "restaurant.menu.read",
  "finance.invoices.read",
  "finance.payments.read",
  "finance.payments.record",
  "finance.cash-points.manage",
  "finance.cash-shifts.manage",
];

export function CashierWorkstation() {
  const context = useAppContext();
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [retailProducts, setRetailProducts] = useState<RetailProduct[]>([]);
  const [menu, setMenu] = useState<Menu>();
  const [cashPoints, setCashPoints] = useState<CashPoint[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [memberId, setMemberId] = useState("");
  const [mealId, setMealId] = useState("");
  const [productId, setProductId] = useState("");
  const [saleKind, setSaleKind] = useState<"MEAL" | "RETAIL">("MEAL");
  const [quantity, setQuantity] = useState("1");
  const [paymentInvoiceId, setPaymentInvoiceId] = useState("");
  const [method, setMethod] = useState<"CASH" | "CARD" | "BANK_TRANSFER">(
    "CASH",
  );
  const [shiftId, setShiftId] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [closingBalance, setClosingBalance] = useState("0");
  const [closingReason, setClosingReason] = useState("إغلاق الوردية وتسليم الصندوق");
  const [cashPointId, setCashPointId] = useState("");
  const [loading, setLoading] = useState(hasRuntimeApi());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const authorized = cashierPermissions.filter((permission) =>
    context.canAccess([permission]),
  );
  const missing = cashierPermissions.filter(
    (permission) => !context.canAccess([permission]),
  );
  const openShifts = useMemo(
    () => shifts.filter((shift) => shift.status === "OPEN"),
    [shifts],
  );
  const selectedShift = openShifts.find((shift) => shift.id === shiftId);
  const publishedMeals = useMemo(() => {
    const allowed = new Set(
      (menu?.status === "PUBLISHED" ? menu.items : [])
        .filter((item) => item.enabled)
        .map((item) => item.mealId),
    );
    return meals.filter((meal) => allowed.has(meal.id));
  }, [meals, menu]);

  async function load() {
    if (!hasRuntimeApi() || !context.organizationId || !context.branchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const base = `/organizations/${context.organizationId}`;
      const menuPath = `${base}/branches/${context.branchId}/daily-menus/${todayRiyadh()}`;
      const [
        memberResponse,
        mealResponse,
        pointResponse,
        shiftResponse,
        invoiceResponse,
        menuResponse,
        retailResponse,
      ] = await Promise.all([
        apiRequest<Member[] | { items: Member[] }>(
          `${base}/members?branchId=${context.branchId}&limit=100`,
        ),
        apiRequest<Meal[] | { items: Meal[] }>(
          `${base}/restaurant/meals?limit=100`,
        ),
        apiRequest<CashPoint[] | { items: CashPoint[] }>(
          `${base}/cash-points?branchId=${context.branchId}&limit=100`,
        ),
        apiRequest<Shift[] | { items: Shift[] }>(
          `${base}/cashier-shifts?branchId=${context.branchId}&limit=100`,
        ),
        apiRequest<Invoice[] | { items: Invoice[] }>(
          `${base}/invoices?branchId=${context.branchId}&limit=100`,
        ),
        apiRequest<Menu>(menuPath).catch((reason) =>
          isNotFound(reason) ? undefined : Promise.reject(reason),
        ),
        apiRequest<RetailProduct[] | { items: RetailProduct[] }>(
          `${base}/retail/sellable-products?branchId=${context.branchId}&limit=200`,
        ),
      ]);
      setMembers(list<Member>(memberResponse.data));
      setMeals(list<Meal>(mealResponse.data));
      setCashPoints(list<CashPoint>(pointResponse.data));
      setShifts(list<Shift>(shiftResponse.data));
      setInvoices(list<Invoice>(invoiceResponse.data));
      setMenu(menuResponse?.data);
      setRetailProducts(list<RetailProduct>(retailResponse.data));
      const nextShift = list<Shift>(shiftResponse.data).find(
        (shift) => shift.status === "OPEN",
      );
      setShiftId((current) => current || nextShift?.id || "");
      setCashPointId(
        (current) =>
          current || list<CashPoint>(pointResponse.data)[0]?.id || "",
      );
    } catch (reason) {
      setError(humanError(reason, "تعذر تجهيز بيانات نقطة البيع."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.organizationId, context.branchId]);

  async function openShift() {
    if (!context.organizationId || !context.branchId || !cashPointId) return;
    setSaving(true);
    setError("");
    try {
      await apiRequest(
        `/organizations/${context.organizationId}/cashier-shifts`,
        {
          method: "POST",
          body: JSON.stringify({
            branchId: context.branchId,
            cashPointId,
            openingBalanceMinor: minor(openingBalance),
          }),
        },
      );
      toast.success("تم فتح وردية الصندوق. يمكنك الآن استقبال المدفوعات النقدية.");
      await load();
    } catch (reason) {
      setError(humanError(reason, "تعذر فتح وردية الصندوق."));
    } finally {
      setSaving(false);
    }
  }

  async function closeShift() {
    if (!context.organizationId || !context.branchId || !selectedShift) return;
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/organizations/${context.organizationId}/cashier-shifts/${selectedShift.id}/closures`, {
        method: "POST",
        body: JSON.stringify({ branchId: context.branchId, actualClosingMinor: minor(closingBalance), reason: closingReason }),
      });
      toast.success("تم إغلاق وردية الصندوق وتسجيل الرصيد الفعلي والفرق للمراجعة.");
      setShiftId("");
      setClosingBalance("0");
      await load();
    } catch (reason) {
      setError(humanError(reason, "تعذر إغلاق وردية الصندوق."));
    } finally {
      setSaving(false);
    }
  }

  async function checkoutAndPay() {
    const targetId = saleKind === "MEAL" ? mealId : productId;
    if (!context.organizationId || !context.branchId || !targetId)
      return;
    if (method === "CASH" && selectedShift === undefined) {
      setError("اختر وردية صندوق مفتوحة قبل تحصيل النقد.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const order = await apiRequest<{ invoiceId?: string }>(
        `/organizations/${context.organizationId}/orders`,
        {
          method: "POST",
          idempotencyKey: createIdempotencyKey(),
          body: JSON.stringify({
            sellingBranchId: context.branchId,
            ...(memberId ? { memberId } : {}),
            memberSegment: "OTHER",
            lines: [
              {
                type: saleKind === "MEAL" ? "RESTAURANT" : "RETAIL",
                targetId,
                quantity: Math.max(1, Number(quantity) || 1),
              },
            ],
          }),
        },
      );
      if (!order.data.invoiceId) throw new Error("لم تُنشأ فاتورة للطلب.");
      await recordPayment(order.data.invoiceId);
      toast.success(saleKind === "MEAL" ? "تم التحصيل وتأكيد الطلب. وصل الآن إلى طابور المطبخ." : "تم التحصيل وتأكيد بيع المنتج وخصم الكمية من مخزون الفرع.");
      setMealId("");
      setProductId("");
      setQuantity("1");
      await load();
    } catch (reason) {
      setError(humanError(reason, "تعذر إكمال البيع والتحصيل."));
    } finally {
      setSaving(false);
    }
  }

  async function recordPayment(invoiceId: string) {
    if (!context.organizationId || !context.branchId) return;
    const invoice =
      invoices.find((item) => item.id === invoiceId) ??
      (
        await apiRequest<Invoice>(
          `/organizations/${context.organizationId}/invoices/${invoiceId}`,
        )
      ).data;
    const amountMinor = invoice
      ? String(
          Math.max(
            0,
            Number(invoice.grossMinor ?? 0) - Number(invoice.paidMinor ?? 0),
          ),
        )
      : "0";
    if (Number(amountMinor) <= 0)
      throw new Error("لا يوجد رصيد مستحق لهذه الفاتورة.");
    if (method === "CASH" && selectedShift === undefined)
      throw new Error("اختر وردية صندوق مفتوحة قبل تحصيل النقد.");
    await apiRequest(`/organizations/${context.organizationId}/payments`, {
      method: "POST",
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({
        collectionBranchId: context.branchId,
        method,
        amountMinor,
        allocations: [{ invoiceId, amountMinor }],
        ...(method === "CASH"
          ? {
              cashierShiftId: selectedShift!.id,
              cashPointId: selectedShift!.cashPointId,
            }
          : {}),
      }),
    });
  }

  async function collectExistingInvoice() {
    if (!paymentInvoiceId) {
      setError("اختر فاتورة أولًا.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await recordPayment(paymentInvoiceId);
      toast.success("تم تسجيل الدفعة وتحديث حالة الفاتورة والطلب المرتبط بها.");
      await load();
    } catch (reason) {
      setError(humanError(reason, "تعذر تسجيل الدفعة."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fade-up space-y-5">
      <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <Badge
            variant="outline"
            className="mb-3 border-primary/30 bg-primary/10 text-amber-700 dark:text-primary"
          >
            نقطة البيع
          </Badge>
          <h1 className="text-2xl font-black sm:text-3xl">مساحة الكاشير</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
            بيع وجبات ومنتجات المتجر، تحصيل الفواتير، وإدارة وردية الصندوق في الفرع الحالي.
          </p>
        </div>
        <Badge variant={missing.length ? "outline" : "success"}>
          {authorized.length} صلاحيات تشغيلية فعالة
        </Badge>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {missing.length ? (
        <Card>
          <CardContent className="p-5">
            <h2 className="font-black">صلاحيات مطلوبة لإكمال محطة الكاشير</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              تُخفى الأفعال غير المسموح بها. أضف الصلاحيات التالية لهذا الموظف
              وعلى الفرع الحالي ليعمل المسار كاملًا:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {missing.map((permission) => (
                <Badge key={permission} variant="outline" dir="ltr">
                  {permission}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="grid min-h-64 place-items-center">
            <Loader2 className="animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-700">
                    <Banknote />
                  </span>
                  <div>
                    <h2 className="font-black">وردية الصندوق</h2>
                    <p className="text-xs text-muted-foreground">
                      لا يُقبل النقد إلا داخل وردية مفتوحة.
                    </p>
                  </div>
                </div>
                {openShifts.length ? (
                  <div className="mt-4 grid gap-3">
                    <label className="text-xs font-bold">
                      الوردية النشطة
                      <select
                        value={shiftId}
                        onChange={(event) => setShiftId(event.target.value)}
                        className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm"
                      >
                        {openShifts.map((shift) => (
                          <option key={shift.id} value={shift.id}>
                            صندوق{" "}
                            {cashPoints.find(
                              (point) => point.id === shift.cashPointId,
                            )?.name ??
                              cashPoints.find(
                                (point) => point.id === shift.cashPointId,
                              )?.code ??
                              "نقطة التحصيل"}{" "}
                            — مفتوحة
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-bold">الرصيد النقدي الفعلي عند الإغلاق (ر.س)<Input className="mt-2" type="number" min="0" step="0.01" value={closingBalance} onChange={(event) => setClosingBalance(event.target.value)} /></label>
                      <label className="text-xs font-bold">سبب الإغلاق<Input className="mt-2" value={closingReason} onChange={(event) => setClosingReason(event.target.value)} /></label>
                    </div>
                    <Button variant="outline" onClick={() => void closeShift()} disabled={saving || closingReason.trim().length < 3}>إغلاق الوردية وتسوية الصندوق</Button>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold">
                      نقطة التحصيل
                      <select
                        value={cashPointId}
                        onChange={(event) => setCashPointId(event.target.value)}
                        className="mt-2 h-11 w-full rounded-xl border bg-background px-3 text-sm"
                      >
                        <option value="">اختر الصندوق</option>
                        {cashPoints.map((point) => (
                          <option key={point.id} value={point.id}>
                            {point.name ?? point.code ?? "نقطة تحصيل"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-bold">
                      رصيد الافتتاح (ر.س)
                      <Input
                        className="mt-2"
                        type="number"
                        min="0"
                        value={openingBalance}
                        onChange={(event) =>
                          setOpeningBalance(event.target.value)
                        }
                      />
                    </label>
                    <Button
                      className="sm:col-span-2"
                      onClick={() => void openShift()}
                      disabled={saving || !cashPointId}
                    >
                      <CircleDollarSign />
                      فتح وردية الصندوق
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-blue-500/10 text-blue-700">
                    <ReceiptText />
                  </span>
                  <div>
                    <h2 className="font-black">تحصيل فاتورة معلقة</h2>
                    <p className="text-xs text-muted-foreground">
                      لطلبات الأعضاء القادمة من بوابة الخدمة الذاتية.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3">
                  <select
                    value={paymentInvoiceId}
                    onChange={(event) =>
                      setPaymentInvoiceId(event.target.value)
                    }
                    className="h-11 rounded-xl border bg-background px-3 text-sm"
                  >
                    <option value="">اختر فاتورة مستحقة</option>
                    {invoices
                      .filter((invoice) => outstanding(invoice) > 0)
                      .map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoiceNumber ?? "فاتورة"} —{" "}
                          {invoice.buyerName ??
                            invoice.memberName ??
                            "عميل"} —{" "}
                          {money(outstanding(invoice))} ر.س
                        </option>
                      ))}
                  </select>
                  <PaymentMethod value={method} onChange={setMethod} />
                  <Button
                    variant="outline"
                    onClick={() => void collectExistingInvoice()}
                    disabled={saving || !paymentInvoiceId}
                  >
                    <CreditCard />
                    تسجيل الدفعة
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-amber-700">
                  <ShoppingCart />
                </span>
                <div>
                  <h2 className="font-black">بيع من الكاونتر</h2>
                  <p className="text-xs text-muted-foreground">
                    اختر وجبة منشورة اليوم أو منتجًا متاحًا في مخزون الفرع.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2"><Button type="button" variant={saleKind === "MEAL" ? "default" : "outline"} onClick={() => setSaleKind("MEAL")}>وجبة من قائمة اليوم</Button><Button type="button" variant={saleKind === "RETAIL" ? "default" : "outline"} onClick={() => setSaleKind("RETAIL")}>منتج من المتجر</Button></div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <select
                  value={memberId}
                  onChange={(event) => setMemberId(event.target.value)}
                  className="h-11 rounded-xl border bg-background px-3 text-sm"
                >
                  <option value="">زائر / بيع بدون ربط بعضو</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name ?? member.fullNameAr ?? "عضو"} —{" "}
                      {member.memberNumber ?? "بدون رقم عضوية"}
                    </option>
                  ))}
                </select>
                {saleKind === "MEAL" ? <select
                  value={mealId}
                  onChange={(event) => setMealId(event.target.value)}
                  className="h-11 rounded-xl border bg-background px-3 text-sm"
                >
                  <option value="">اختر وجبة اليوم</option>
                  {publishedMeals.map((meal) => (
                    <option key={meal.id} value={meal.id}>
                      {meal.name}
                    </option>
                  ))}
                </select> : <select value={productId} onChange={(event) => setProductId(event.target.value)} className="h-11 rounded-xl border bg-background px-3 text-sm"><option value="">اختر منتجًا متاحًا</option>{retailProducts.map((product) => <option key={product.id} value={product.id}>{product.name} — {product.barcode ?? product.code ?? "بدون باركود"} — متاح {product.quantityAvailable ?? 0} — {money(Number(product.grossMinor ?? product.amountMinor ?? 0))} ر.س</option>)}</select>}
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  placeholder="الكمية"
                />
                <PaymentMethod value={method} onChange={setMethod} />
              </div>
              <Button
                className="mt-4"
                onClick={() => void checkoutAndPay()}
                disabled={
                  saving ||
                  !(saleKind === "MEAL" ? mealId : productId) ||
                  (method === "CASH" && !selectedShift)
                }
              >
                {saving ? <Loader2 className="animate-spin" /> : <Banknote />}
                {saleKind === "MEAL" ? "تحصيل وإرسال للمطبخ" : "تحصيل وخصم من المخزون"}
              </Button>
              {saleKind === "MEAL" && menu?.status !== "PUBLISHED" && (
                <p className="mt-3 text-xs text-amber-700">
                  لا توجد قائمة مطعم منشورة للفرع اليوم؛ لا يمكن بيع وجبة قبل أن
                  ينشرها الشيف.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function PaymentMethod({
  value,
  onChange,
}: {
  value: "CASH" | "CARD" | "BANK_TRANSFER";
  onChange: (value: "CASH" | "CARD" | "BANK_TRANSFER") => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) =>
        onChange(event.target.value as "CASH" | "CARD" | "BANK_TRANSFER")
      }
      className="h-11 rounded-xl border bg-background px-3 text-sm"
    >
      <option value="CASH">نقدًا</option>
      <option value="CARD">بطاقة بنكية</option>
      <option value="BANK_TRANSFER">تحويل بنكي</option>
    </select>
  );
}
function list<T>(value: unknown): T[] {
  return Array.isArray(value)
    ? (value as T[])
    : value &&
        typeof value === "object" &&
        Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: T[] }).items
      : [];
}
function outstanding(invoice: Invoice) {
  return Math.max(
    0,
    Number(invoice.grossMinor ?? 0) - Number(invoice.paidMinor ?? 0),
  );
}
function money(value: number) {
  return (value / 100).toLocaleString("ar-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function minor(value: string) {
  return String(Math.round(Math.max(0, Number(value) || 0) * 100));
}
function isNotFound(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "problem" in value &&
    Number((value as { problem?: { status?: number } }).problem?.status) === 404
  );
}
function todayRiyadh() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
