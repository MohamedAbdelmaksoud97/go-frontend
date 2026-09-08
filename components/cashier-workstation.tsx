"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Check,
  CircleDollarSign,
  CreditCard,
  Loader2,
  ReceiptText,
  Search,
  ShoppingCart,
  UserRound,
  X,
} from "lucide-react";
import { useAppContext } from "@/components/app-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast-provider";
import {
  ApiError,
  apiRequest,
  createIdempotencyKey,
  hasRuntimeApi,
} from "@/lib/api-client";
import { humanError } from "@/lib/human-errors";
import { permissionArabicLabel } from "@/lib/permission-display";

type Meal = { id: string; name: string };
type RetailProduct = { id: string; name: string; code?: string; barcode?: string; grossMinor?: string; amountMinor?: string; quantityAvailable?: number };
type Menu = {
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  items: Array<{ mealId: string; enabled: boolean }>;
};
type Shift = { id: string; cashPointId: string; status: "OPEN" | "CLOSED" };
type CashPoint = { id: string; name?: string; code?: string };
type PaymentMethodCode = "CASH" | "CARD" | "BANK_TRANSFER";
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
  legacyMemberNumber?: string;
  phoneE164?: string;
  nationalId?: string;
  contacts?: Array<{ type?: string; value?: string; isPrimary?: boolean }>;
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
  "finance.cash-points.read",
  "finance.cash-shifts.manage",
];

export function CashierWorkstation() {
  const context = useAppContext();
  const toast = useToast();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [retailProducts, setRetailProducts] = useState<RetailProduct[]>([]);
  const [menu, setMenu] = useState<Menu>();
  const [cashPoints, setCashPoints] = useState<CashPoint[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customerMode, setCustomerMode] = useState<"GUEST" | "MEMBER">("GUEST");
  const [memberSelection, setMemberSelection] = useState<{ organizationId: string; branchId: string; member?: Member }>({ organizationId: "", branchId: "" });
  const [mealId, setMealId] = useState("");
  const [productId, setProductId] = useState("");
  const [saleKind, setSaleKind] = useState<"MEAL" | "RETAIL">("MEAL");
  const [quantity, setQuantity] = useState("1");
  const [paymentInvoiceId, setPaymentInvoiceId] = useState("");
  const [method, setMethod] = useState<PaymentMethodCode>("CASH");
  const [invoicePaymentMode, setInvoicePaymentMode] = useState<"SINGLE" | "SPLIT">("SINGLE");
  const [splitFirstMethod, setSplitFirstMethod] = useState<PaymentMethodCode>("CASH");
  const [splitSecondMethod, setSplitSecondMethod] = useState<PaymentMethodCode>("CARD");
  const [splitFirstAmount, setSplitFirstAmount] = useState("");
  const [splitFirstReference, setSplitFirstReference] = useState("");
  const [splitSecondReference, setSplitSecondReference] = useState("");
  const [collectionSuccess, setCollectionSuccess] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [closingBalance, setClosingBalance] = useState("0");
  const [closingReason, setClosingReason] = useState("إغلاق الوردية وتسليم الصندوق");
  const [cashPointId, setCashPointId] = useState("");
  const [loading, setLoading] = useState(hasRuntimeApi());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
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
  const selectedPaymentInvoice = invoices.find((invoice) => invoice.id === paymentInvoiceId);
  const selectedInvoiceOutstanding = selectedPaymentInvoice ? outstanding(selectedPaymentInvoice) : 0;
  const splitFirstMinor = Number(minor(splitFirstAmount));
  const splitSecondMinor = Math.max(0, selectedInvoiceOutstanding - splitFirstMinor);
  const splitUsesCash = splitFirstMethod === "CASH" || splitSecondMethod === "CASH";
  const splitIsValid = selectedInvoiceOutstanding > 0 && splitFirstMinor > 0 && splitFirstMinor < selectedInvoiceOutstanding && splitFirstMethod !== splitSecondMethod && (!splitUsesCash || selectedShift !== undefined);
  const selectedMember = memberSelection.organizationId === context.organizationId && memberSelection.branchId === context.branchId ? memberSelection.member : undefined;
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
    setLoadWarnings([]);
    try {
      const base = `/organizations/${context.organizationId}`;
      const menuPath = `${base}/branches/${context.branchId}/daily-menus/${todayRiyadh()}`;
      const [
        mealResponse,
        pointResponse,
        shiftResponse,
        invoiceResponse,
        menuResponse,
        retailResponse,
      ] = await Promise.all([
        loadSource(
          "وجبات المطعم",
          "restaurant.catalog.read",
          apiRequest<Meal[] | { items: Meal[] }>(
            `${base}/restaurant/meals?branchId=${context.branchId}&limit=100`,
          ).then((response) => list<Meal>(response.data)),
          [] as Meal[],
        ),
        loadSource(
          "نقاط التحصيل",
          "finance.cash-points.read",
          apiRequest<CashPoint[] | { items: CashPoint[] }>(
            `${base}/cash-points?branchId=${context.branchId}&limit=100`,
          ).then((response) => list<CashPoint>(response.data)),
          [] as CashPoint[],
        ),
        loadSource(
          "ورديات الصندوق",
          "finance.cash-shifts.manage",
          apiRequest<Shift[] | { items: Shift[] }>(
            `${base}/cashier-shifts?branchId=${context.branchId}&limit=100`,
          ).then((response) => list<Shift>(response.data)),
          [] as Shift[],
        ),
        loadSource(
          "الفواتير المعلقة",
          "finance.invoices.read",
          apiRequest<Invoice[] | { items: Invoice[] }>(
            `${base}/invoices?branchId=${context.branchId}&limit=100`,
          ).then((response) => list<Invoice>(response.data)),
          [] as Invoice[],
        ),
        loadSource<Menu | undefined>(
          "قائمة وجبات اليوم",
          "restaurant.menu.read",
          apiRequest<Menu>(menuPath)
            .then((response) => response.data)
            .catch((reason) =>
              isNotFound(reason) ? undefined : Promise.reject(reason),
            ),
          undefined,
        ),
        loadSource(
          "منتجات المتجر",
          "sales.checkout",
          apiRequest<RetailProduct[] | { items: RetailProduct[] }>(
            `${base}/retail/sellable-products?branchId=${context.branchId}&limit=200`,
          ).then((response) => list<RetailProduct>(response.data)),
          [] as RetailProduct[],
        ),
      ]);
      const responses = [
        mealResponse,
        pointResponse,
        shiftResponse,
        invoiceResponse,
        menuResponse,
        retailResponse,
      ];
      setLoadWarnings(
        responses.flatMap((response) =>
          response.warning ? [response.warning] : [],
        ),
      );
      setMeals(mealResponse.data);
      setCashPoints(pointResponse.data);
      setShifts(shiftResponse.data);
      setInvoices(invoiceResponse.data);
      setMenu(menuResponse.data);
      setRetailProducts(retailResponse.data);
      const nextShift = shiftResponse.data.find(
        (shift) => shift.status === "OPEN",
      );
      setShiftId((current) =>
        shiftResponse.data.some(
          (shift) => shift.id === current && shift.status === "OPEN",
        )
          ? current
          : nextShift?.id || "",
      );
      setCashPointId(
        (current) =>
          pointResponse.data.some((point) => point.id === current)
            ? current
            : pointResponse.data[0]?.id || "",
      );
      setMealId((current) =>
        mealResponse.data.some((meal) => meal.id === current) ? current : "",
      );
      setProductId((current) =>
        retailResponse.data.some((product) => product.id === current)
          ? current
          : "",
      );
      setPaymentInvoiceId((current) =>
        invoiceResponse.data.some((invoice) => invoice.id === current)
          ? current
          : "",
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
    if (customerMode === "MEMBER" && !selectedMember) {
      setError("ابحث عن العضو واختره، أو بدّل إلى «بيع لزائر».");
      return;
    }
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
            ...(customerMode === "MEMBER" && selectedMember ? { memberId: selectedMember.id } : {}),
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

  async function recordSplitInvoicePayment(invoiceId: string) {
    if (!context.organizationId || !context.branchId) return;
    const invoice = (
      await apiRequest<Invoice>(
        `/organizations/${context.organizationId}/invoices/${invoiceId}`,
      )
    ).data;
    const amountDueMinor = outstanding(invoice);
    if (selectedInvoiceOutstanding > 0 && amountDueMinor !== selectedInvoiceOutstanding)
      throw new Error("تغيّر الرصيد المستحق للفاتورة. حدّث البيانات ثم أعد توزيع المبلغ.");
    const firstAmountMinor = Number(minor(splitFirstAmount));
    const secondAmountMinor = amountDueMinor - firstAmountMinor;
    if (amountDueMinor <= 0) throw new Error("لا يوجد رصيد مستحق لهذه الفاتورة.");
    if (firstAmountMinor <= 0 || secondAmountMinor <= 0)
      throw new Error("يجب أن يكون مبلغ كل جزء أكبر من صفر وأقل من الرصيد المستحق.");
    if (splitFirstMethod === splitSecondMethod)
      throw new Error("اختر وسيلتي دفع مختلفتين لتقسيم التحصيل.");
    if ((splitFirstMethod === "CASH" || splitSecondMethod === "CASH") && selectedShift === undefined)
      throw new Error("افتح وردية صندوق أو اختر وردية مفتوحة قبل تحصيل الجزء النقدي.");

    const part = (paymentMethod: PaymentMethodCode, amountMinor: number, externalReference: string) => ({
      method: paymentMethod,
      amountMinor: String(amountMinor),
      allocations: [{ invoiceId, amountMinor: String(amountMinor) }],
      ...(paymentMethod === "CASH"
        ? { cashierShiftId: selectedShift!.id, cashPointId: selectedShift!.cashPointId }
        : externalReference.trim() ? { externalReference: externalReference.trim() } : {}),
    });

    await apiRequest(`/organizations/${context.organizationId}/payments`, {
      method: "POST",
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({
        collectionBranchId: context.branchId,
        parts: [
          part(splitFirstMethod, firstAmountMinor, splitFirstReference),
          part(splitSecondMethod, secondAmountMinor, splitSecondReference),
        ],
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
    setCollectionSuccess("");
    try {
      const invoiceNumber = selectedPaymentInvoice?.invoiceNumber ?? "الفاتورة";
      if (invoicePaymentMode === "SPLIT") {
        await recordSplitInvoicePayment(paymentInvoiceId);
        setCollectionSuccess(`تم تحصيل ${invoiceNumber} على دفعتين وتحديث حالة الفاتورة.`);
        toast.success("تم تسجيل جزأي الدفع معًا وتحديث حالة الفاتورة.");
      } else {
        await recordPayment(paymentInvoiceId);
        setCollectionSuccess(`تم تحصيل ${invoiceNumber} بالكامل وتحديث حالتها.`);
        toast.success("تم تسجيل الدفعة وتحديث حالة الفاتورة والطلب المرتبط بها.");
      }
      await load();
      setPaymentInvoiceId("");
      setSplitFirstAmount("");
      setSplitFirstReference("");
      setSplitSecondReference("");
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
      {loadWarnings.length > 0 && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-bold">تم تحميل نقطة البيع، لكن تعذر تحديث بعض البيانات:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {loadWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {missing.length ? (
        <Card>
          <CardContent className="p-5">
            <h2 className="font-black">صلاحيات مطلوبة لإكمال محطة الكاشير</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              تُخفى الأفعال غير المسموح بها. أضف الصلاحيات التالية لهذا الموظف
              وعلى الفرع الحالي ليعمل المسار كاملًا. ستجدها بالأسماء نفسها في
              شاشة المسميات الوظيفية والصلاحيات:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {missing.map((permission) => (
                <Badge key={permission} variant="outline">
                  {permissionArabicLabel(permission)}
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
                  {collectionSuccess && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-3 text-xs font-bold leading-6 text-emerald-700 dark:text-emerald-300"><Check className="mt-0.5 size-4 shrink-0"/>{collectionSuccess}</div>}
                  <select
                    value={paymentInvoiceId}
                    onChange={(event) => {
                      const invoiceId = event.target.value;
                      const invoice = invoices.find((item) => item.id === invoiceId);
                      setPaymentInvoiceId(invoiceId);
                      setSplitFirstAmount(invoice ? (outstanding(invoice) / 200).toFixed(2) : "");
                      setCollectionSuccess("");
                      setError("");
                    }}
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
                  {selectedPaymentInvoice && <div className="grid grid-cols-3 gap-2 rounded-2xl border bg-secondary/35 p-3 text-center text-xs">
                    <PaymentMetric label="إجمالي الفاتورة" value={`${money(Number(selectedPaymentInvoice.grossMinor ?? 0))} ر.س`}/>
                    <PaymentMetric label="المدفوع سابقًا" value={`${money(Number(selectedPaymentInvoice.paidMinor ?? 0))} ر.س`}/>
                    <PaymentMetric label="المطلوب الآن" value={`${money(selectedInvoiceOutstanding)} ر.س`} highlight/>
                  </div>}
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary/40 p-1">
                    <Button type="button" size="sm" variant={invoicePaymentMode === "SINGLE" ? "default" : "ghost"} onClick={() => { setInvoicePaymentMode("SINGLE"); setError(""); }}>وسيلة دفع واحدة</Button>
                    <Button type="button" size="sm" variant={invoicePaymentMode === "SPLIT" ? "default" : "ghost"} onClick={() => { setInvoicePaymentMode("SPLIT"); if (!splitFirstAmount && selectedInvoiceOutstanding > 0) setSplitFirstAmount((selectedInvoiceOutstanding / 200).toFixed(2)); setError(""); }}>تقسيم على وسيلتين</Button>
                  </div>
                  {invoicePaymentMode === "SINGLE" ? <div className="grid gap-2">
                    <label className="text-xs font-bold">طريقة دفع كامل الرصيد<PaymentMethod className="mt-2 w-full" value={method} onChange={setMethod} /></label>
                    {method === "CASH" && !selectedShift && <p className="rounded-xl bg-amber-500/10 p-3 text-xs font-semibold leading-6 text-amber-700 dark:text-amber-300">افتح وردية صندوق أولًا لتحصيل المبلغ نقدًا.</p>}
                  </div> : <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/[.035] p-4">
                    <div><h3 className="text-sm font-black">توزيع المبلغ</h3><p className="mt-1 text-[11px] leading-5 text-muted-foreground">أدخل قيمة الجزء الأول، وسيحسب النظام الجزء الثاني تلقائيًا حتى يطابق الرصيد دون فروق.</p></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <PaymentPartEditor title="الجزء الأول" method={splitFirstMethod} onMethodChange={setSplitFirstMethod} amount={splitFirstAmount} onAmountChange={setSplitFirstAmount} reference={splitFirstReference} onReferenceChange={setSplitFirstReference}/>
                      <PaymentPartEditor title="الجزء الثاني · المتبقي تلقائيًا" method={splitSecondMethod} onMethodChange={setSplitSecondMethod} amount={(splitSecondMinor / 100).toFixed(2)} reference={splitSecondReference} onReferenceChange={setSplitSecondReference} readOnlyAmount/>
                    </div>
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-background/80 p-3 text-center text-xs">
                      <PaymentMetric label={paymentMethodLabel(splitFirstMethod)} value={`${money(splitFirstMinor)} ر.س`}/>
                      <PaymentMetric label={paymentMethodLabel(splitSecondMethod)} value={`${money(splitSecondMinor)} ر.س`}/>
                      <PaymentMetric label="الإجمالي" value={`${money(splitFirstMinor + splitSecondMinor)} ر.س`} highlight={splitIsValid}/>
                    </div>
                    {splitFirstMethod === splitSecondMethod && <p className="rounded-xl bg-red-500/10 p-3 text-xs font-semibold text-red-600">اختر وسيلتي دفع مختلفتين.</p>}
                    {(splitFirstMinor <= 0 || splitFirstMinor >= selectedInvoiceOutstanding) && <p className="rounded-xl bg-amber-500/10 p-3 text-xs font-semibold leading-6 text-amber-700 dark:text-amber-300">أدخل للجزء الأول مبلغًا أكبر من صفر وأقل من الرصيد المطلوب.</p>}
                    {splitUsesCash && !selectedShift && <p className="rounded-xl bg-red-500/10 p-3 text-xs font-semibold leading-6 text-red-600">الجزء النقدي يحتاج إلى وردية صندوق مفتوحة.</p>}
                    {splitUsesCash && selectedShift && <p className="rounded-xl bg-emerald-500/8 p-3 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">سيُربط الجزء النقدي تلقائيًا بالوردية المفتوحة ونقطة التحصيل الحالية.</p>}
                  </div>}
                  <Button
                    variant="outline"
                    onClick={() => void collectExistingInvoice()}
                    disabled={saving || !paymentInvoiceId || (invoicePaymentMode === "SINGLE" ? method === "CASH" && !selectedShift : !splitIsValid)}
                  >
                    {saving ? <Loader2 className="animate-spin"/> : <CreditCard />}
                    {invoicePaymentMode === "SPLIT" ? "تأكيد وتسجيل الدفعتين" : "تحصيل كامل الرصيد"}
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
              <CustomerSelector
                organizationId={context.organizationId}
                branchId={context.branchId}
                mode={customerMode}
                member={selectedMember}
                onModeChange={(mode) => {
                  setCustomerMode(mode);
                  if (mode === "GUEST") setMemberSelection({ organizationId: context.organizationId, branchId: context.branchId });
                  setError("");
                }}
                onMemberChange={(member) => {
                  setMemberSelection({ organizationId: context.organizationId, branchId: context.branchId, ...(member ? { member } : {}) });
                  setError("");
                }}
              />
              <div className="mt-4 grid gap-3 md:grid-cols-3">
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
                  (customerMode === "MEMBER" && !selectedMember) ||
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

function CustomerSelector({
  organizationId,
  branchId,
  mode,
  member,
  onModeChange,
  onMemberChange,
}: {
  organizationId: string;
  branchId: string;
  mode: "GUEST" | "MEMBER";
  member?: Member;
  onModeChange: (mode: "GUEST" | "MEMBER") => void;
  onMemberChange: (member?: Member) => void;
}) {
  const searchRoot = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    const search = query.trim();
    if (mode !== "MEMBER" || member || search.length < 2 || !organizationId || !branchId || !hasRuntimeApi()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError("");
      void apiRequest<Member[] | { items: Member[] }>(`/organizations/${organizationId}/members?branchId=${encodeURIComponent(branchId)}&status=ACTIVE&search=${encodeURIComponent(search)}&limit=20`)
        .then((response) => {
          if (cancelled) return;
          setResults(list<Member>(response.data).filter((item) => item.id));
          setSearchOpen(true);
        })
        .catch((reason) => {
          if (cancelled) return;
          setResults([]);
          setSearchError(humanError(reason, "تعذر البحث عن الأعضاء في الفرع الحالي."));
          setSearchOpen(true);
        })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [branchId, member, mode, organizationId, query]);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!searchRoot.current?.contains(event.target as Node)) setSearchOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setSearchOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  function selectMember(selected: Member) {
    onMemberChange(selected);
    setQuery("");
    setResults([]);
    setSearchOpen(false);
    setSearchError("");
  }

  function changeMode(nextMode: "GUEST" | "MEMBER") {
    if (nextMode === "GUEST") {
      setQuery("");
      setResults([]);
      setSearching(false);
      setSearchOpen(false);
      setSearchError("");
    }
    onModeChange(nextMode);
  }

  function clearMember(nextQuery = "") {
    onMemberChange(undefined);
    setQuery(nextQuery);
    setResults([]);
    setSearchError("");
    setSearchOpen(nextQuery.trim().length >= 2);
  }

  const memberName = member?.name ?? member?.fullNameAr ?? "عضو";
  return (
    <section className="mt-4 rounded-2xl border bg-secondary/20 p-3 sm:p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-black">العميل</p>
          <p className="mt-1 text-[11px] text-muted-foreground">اربط البيع بعضو، أو أكمل العملية كبيع مباشر لزائر.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button type="button" size="sm" variant={mode === "GUEST" ? "default" : "outline"} aria-pressed={mode === "GUEST"} onClick={() => changeMode("GUEST")}><UserRound />بيع لزائر</Button>
          <Button type="button" size="sm" variant={mode === "MEMBER" ? "default" : "outline"} aria-pressed={mode === "MEMBER"} onClick={() => changeMode("MEMBER")}><Search />بحث عن عضو</Button>
        </div>
      </div>
      {mode === "GUEST" ? (
        <p className="mt-3 rounded-xl border border-dashed bg-background/60 px-3 py-2.5 text-xs text-muted-foreground">زائر / بيع بدون ربط بعضو. ستُصدر الفاتورة دون إضافتها إلى ملف عضو.</p>
      ) : (
        <label className="mt-3 grid gap-2 text-xs font-bold"><span>ابحث واختر العضو</span><div ref={searchRoot} className="relative">
          {searching ? <Loader2 className="pointer-events-none absolute right-3 top-1/2 z-10 size-4 -translate-y-1/2 animate-spin text-primary" /> : <Search className="pointer-events-none absolute right-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />}
          <input role="combobox" aria-expanded={searchOpen && !member && query.trim().length >= 2} aria-controls="cashier-member-results" aria-autocomplete="list" autoComplete="off" className="h-11 w-full rounded-xl border bg-background pr-10 pl-10 text-sm font-normal outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/15" value={member ? `${memberName} — ${member.memberNumber ?? "بدون رقم عضوية"}` : query} placeholder="الاسم أو الجوال أو الهوية أو العضوية أو رقم النظام أو الباركود" onFocus={() => setSearchOpen(true)} onChange={(event) => clearMember(event.target.value)} />
          {(member || query) && <button type="button" onClick={() => clearMember()} className="absolute left-2 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground" aria-label="مسح العضو المختار"><X className="size-4" /></button>}
          {searchOpen && !member && query.trim().length >= 2 && <div id="cashier-member-results" role="listbox" className="absolute inset-x-0 top-[calc(100%+.45rem)] z-40 max-h-72 overflow-y-auto rounded-2xl border bg-popover p-2 shadow-2xl">
            {searching ? <div className="grid min-h-24 place-items-center"><Loader2 className="animate-spin text-primary" /></div> : results.length ? results.map((result) => { const name = result.name ?? result.fullNameAr ?? "عضو"; return <button key={result.id} type="button" role="option" aria-selected={false} onClick={() => selectMember(result)} className="flex w-full items-center gap-3 rounded-xl p-3 text-right transition hover:bg-secondary"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 font-black text-primary">{name.charAt(0) || "ع"}</span><span className="min-w-0 flex-1"><span className="block truncate font-black">{name}</span><span className="mt-1 block truncate text-[11px] font-normal text-muted-foreground" dir="ltr">{memberSecondary(result)}</span></span><Check className="size-4 opacity-0" /></button>; }) : <p className="p-5 text-center text-xs font-normal leading-6 text-muted-foreground">{searchError || "لا توجد نتائج مطابقة في الفرع الحالي."}</p>}
          </div>}
        </div><span className="text-[10px] font-normal leading-5 text-muted-foreground">{member ? `تم اختيار ${memberName}.` : query.trim().length > 0 && query.trim().length < 2 ? "اكتب حرفين أو رقمين على الأقل لبدء البحث." : "يبحث النظام في أعضاء الفرع الحالي فقط."}</span></label>
      )}
    </section>
  );
}

function PaymentPartEditor({ title, method, onMethodChange, amount, onAmountChange, reference, onReferenceChange, readOnlyAmount = false }: {
  title: string;
  method: PaymentMethodCode;
  onMethodChange: (value: PaymentMethodCode) => void;
  amount: string;
  onAmountChange?: (value: string) => void;
  reference: string;
  onReferenceChange: (value: string) => void;
  readOnlyAmount?: boolean;
}) {
  return <div className="rounded-xl border bg-background p-3">
    <p className="mb-3 text-xs font-black">{title}</p>
    <div className="grid gap-3">
      <label className="text-[11px] font-bold">طريقة الدفع<PaymentMethod className="mt-2 w-full" value={method} onChange={onMethodChange}/></label>
      <label className="text-[11px] font-bold">المبلغ (ر.س)<Input className="mt-2" type="number" min="0.01" step="0.01" value={amount} readOnly={readOnlyAmount} onChange={event => onAmountChange?.(event.target.value)} /></label>
      {method !== "CASH" && <label className="text-[11px] font-bold">مرجع العملية (اختياري)<Input className="mt-2" value={reference} onChange={event => onReferenceChange(event.target.value)} placeholder={method === "CARD" ? "رقم إيصال جهاز الدفع" : "رقم التحويل"} /></label>}
    </div>
  </div>;
}

function PaymentMetric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`rounded-lg px-2 py-2 ${highlight ? "bg-emerald-500/10" : "bg-background/70"}`}><p className="text-[10px] text-muted-foreground">{label}</p><p className={`mt-1 font-black ${highlight ? "text-emerald-700 dark:text-emerald-300" : ""}`}>{value}</p></div>;
}

function PaymentMethod({
  value,
  onChange,
  className = "",
}: {
  value: PaymentMethodCode;
  onChange: (value: PaymentMethodCode) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) =>
        onChange(event.target.value as PaymentMethodCode)
      }
      className={`h-11 rounded-xl border bg-background px-3 text-sm ${className}`}
    >
      <option value="CASH">نقدًا</option>
      <option value="CARD">بطاقة بنكية</option>
      <option value="BANK_TRANSFER">تحويل بنكي</option>
    </select>
  );
}
function paymentMethodLabel(method: PaymentMethodCode) {
  return method === "CASH" ? "نقدًا" : method === "CARD" ? "بطاقة بنكية" : "تحويل بنكي";
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
function memberSecondary(member: Member) {
  const phone = member.phoneE164 ?? member.contacts?.find((contact) => contact.type === "PHONE" && contact.isPrimary)?.value ?? member.contacts?.find((contact) => contact.type === "PHONE")?.value;
  return [member.memberNumber, member.legacyMemberNumber ? `رقم النظام ${member.legacyMemberNumber}` : undefined, phone].filter(Boolean).join(" · ") || "لا توجد بيانات تعريف إضافية";
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
async function loadSource<T>(
  label: string,
  permission: string,
  operation: Promise<T>,
  fallback: T,
): Promise<{ data: T; warning?: string }> {
  try {
    return { data: await operation };
  } catch (reason) {
    if (reason instanceof ApiError && reason.problem.status === 403) {
      return {
        data: fallback,
        warning: `${label}: تأكد من منح صلاحية «${permissionArabicLabel(permission)}» على الفرع الحالي.`,
      };
    }
    return {
      data: fallback,
      warning: `${label}: ${humanError(reason, `تعذر تحميل ${label}.`)}`,
    };
  }
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
