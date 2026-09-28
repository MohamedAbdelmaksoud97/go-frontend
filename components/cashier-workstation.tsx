"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Check,
  CircleDollarSign,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Trash2,
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

type Meal = { id: string; name: string; remainingQuantity?: number };
type Service = { id: string; name: string; code?: string };
type ServiceQuote = { grossMinor: string; taxMinor: string; discountMinor: string; currency: string };
type CheckoutQuote = { grossMinor: string; taxMinor: string; discountMinor: string; netMinor: string; currency: "SAR" };
type RetailProduct = { id: string; name: string; code?: string; barcode?: string; grossMinor?: string; amountMinor?: string; quantityAvailable?: number };
type Menu = {
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  items: Array<{ mealId: string; enabled: boolean; remainingQuantity?: number }>;
};
type Shift = { id: string; cashPointId: string; status: "OPEN" | "CLOSED" };
type CashPoint = { id: string; name?: string; code?: string };
type SaleKind = "MEAL" | "RETAIL" | "SERVICE";
type PaymentMethodCode = "CASH" | "CARD" | "BANK_TRANSFER" | "GATEWAY" | "WALLET";
type CartLine = { key: string; type: "RESTAURANT" | "RETAIL" | "SERVICE"; targetId: string; name: string; quantity: number };
type PaymentPart = { id: string; method: PaymentMethodCode; amount: string; reference: string };
type Invoice = {
  id: string;
  orderId?: string;
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

const paymentMethods: ReadonlyArray<{ value: PaymentMethodCode; label: string }> = [
  { value: "CASH", label: "نقدًا" },
  { value: "CARD", label: "بطاقة بنكية" },
  { value: "BANK_TRANSFER", label: "تحويل بنكي" },
  { value: "GATEWAY", label: "بوابة دفع إلكترونية" },
  { value: "WALLET", label: "محفظة رقمية" },
];

export function CashierWorkstation({ initialInvoiceId = "", initialOrderId = "" }: { initialInvoiceId?: string; initialOrderId?: string }) {
  const context = useAppContext();
  const toast = useToast();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [retailProducts, setRetailProducts] = useState<RetailProduct[]>([]);
  const [menu, setMenu] = useState<Menu>();
  const [cashPoints, setCashPoints] = useState<CashPoint[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customerMode, setCustomerMode] = useState<"GUEST" | "MEMBER">("GUEST");
  const [memberSelection, setMemberSelection] = useState<{ organizationId: string; branchId: string; member?: Member }>({ organizationId: "", branchId: "" });
  const [mealId, setMealId] = useState("");
  const [productId, setProductId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [saleKind, setSaleKind] = useState<SaleKind>("MEAL");
  const [quantity, setQuantity] = useState("1");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [serviceQuoteResult, setServiceQuoteResult] = useState<{ key: string; quote?: ServiceQuote; error?: string }>();
  const [cartQuoteResult, setCartQuoteResult] = useState<{ key: string; quote?: CheckoutQuote; error?: string }>();
  const [saleMethod, setSaleMethod] = useState<PaymentMethodCode>("CASH");
  const [salePaymentMode, setSalePaymentMode] = useState<"SINGLE" | "SPLIT">("SINGLE");
  const [salePaymentParts, setSalePaymentParts] = useState<PaymentPart[]>(() => defaultPaymentParts());
  const [paymentInvoiceId, setPaymentInvoiceId] = useState("");
  const [method, setMethod] = useState<PaymentMethodCode>("CASH");
  const [invoicePaymentMode, setInvoicePaymentMode] = useState<"SINGLE" | "SPLIT">("SINGLE");
  const [paymentParts, setPaymentParts] = useState<PaymentPart[]>(() => defaultPaymentParts());
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
  const deepLinkAppliedRef = useRef(false);
  const collectionCardRef = useRef<HTMLDivElement>(null);
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
  const paymentPartsTotal = paymentParts.reduce((total, part) => total + Number(minor(part.amount)), 0);
  const paymentPartsRemaining = selectedInvoiceOutstanding - paymentPartsTotal;
  const splitUsesCash = paymentParts.some((part) => part.method === "CASH");
  const splitMethodsAreUnique = new Set(paymentParts.map((part) => part.method)).size === paymentParts.length;
  const splitIsValid = selectedInvoiceOutstanding > 0 && paymentParts.length >= 2 && paymentParts.every((part) => Number(minor(part.amount)) > 0) && paymentPartsRemaining === 0 && splitMethodsAreUnique && (!splitUsesCash || selectedShift !== undefined);
  const selectedMember = memberSelection.organizationId === context.organizationId && memberSelection.branchId === context.branchId ? memberSelection.member : undefined;
  const cartLineType = cart[0]?.type;
  const quoteMemberId = customerMode === "MEMBER" ? selectedMember?.id : undefined;
  const cartQuoteKey = cart.length > 0 && context.organizationId && context.branchId && (customerMode === "GUEST" || quoteMemberId)
    ? JSON.stringify([context.organizationId, context.branchId, quoteMemberId ?? null, cart.map(({ type, targetId, quantity }) => [type, targetId, quantity])]) : "";
  const cartQuote = cartQuoteResult?.key === cartQuoteKey ? cartQuoteResult.quote : undefined;
  const cartQuoteError = cartQuoteResult?.key === cartQuoteKey ? cartQuoteResult.error ?? "" : "";
  const loadingCartQuote = Boolean(cartQuoteKey && cartQuoteResult?.key !== cartQuoteKey);
  const cartTotalMinor = Number(cartQuote?.grossMinor ?? 0);
  const salePaymentPartsTotal = salePaymentParts.reduce((total, part) => total + Number(minor(part.amount)), 0);
  const salePaymentPartsRemaining = cartTotalMinor - salePaymentPartsTotal;
  const saleSplitUsesCash = salePaymentParts.some((part) => part.method === "CASH");
  const saleSplitMethodsAreUnique = new Set(salePaymentParts.map((part) => part.method)).size === salePaymentParts.length;
  const saleSplitIsValid = cartTotalMinor > 0 && salePaymentParts.length >= 2 && salePaymentParts.every((part) => Number(minor(part.amount)) > 0) && salePaymentPartsRemaining === 0 && saleSplitMethodsAreUnique && (!saleSplitUsesCash || selectedShift !== undefined);
  const quoteQuantity = Number(quantity);
  const serviceQuoteKey = saleKind === "SERVICE" && serviceId && context.organizationId && context.branchId &&
    (customerMode === "GUEST" || quoteMemberId) && Number.isInteger(quoteQuantity) && quoteQuantity >= 1 && quoteQuantity <= 100
    ? JSON.stringify([context.organizationId, context.branchId, serviceId, quoteQuantity, quoteMemberId ?? null]) : "";
  const serviceQuote = serviceQuoteResult?.key === serviceQuoteKey ? serviceQuoteResult.quote : undefined;
  const serviceQuoteError = serviceQuoteResult?.key === serviceQuoteKey ? serviceQuoteResult.error ?? "" : "";
  const loadingServiceQuote = Boolean(serviceQuoteKey && serviceQuoteResult?.key !== serviceQuoteKey);
  const publishedMeals = useMemo(() => {
    const allowed = new Map(
      (menu?.status === "PUBLISHED" ? menu.items : [])
        .filter((item) => item.enabled)
        .map((item) => [item.mealId, item] as const),
    );
    return meals.filter((meal) => allowed.has(meal.id)).map(meal => ({ ...meal, remainingQuantity: allowed.get(meal.id)?.remainingQuantity }));
  }, [meals, menu]);

  useEffect(() => {
    if (!serviceQuoteKey) return;
    let cancelled = false;
    void apiRequest<ServiceQuote>(`/organizations/${context.organizationId}/quotes`, {
      method: "POST",
      body: JSON.stringify({ branchId: context.branchId, targetType: "SERVICE", targetId: serviceId, quantity: quoteQuantity,
        ...(quoteMemberId ? { memberId: quoteMemberId } : {}) }),
    }).then((response) => { if (!cancelled) setServiceQuoteResult({ key: serviceQuoteKey, quote: response.data }); })
      .catch((reason) => { if (!cancelled) setServiceQuoteResult({ key: serviceQuoteKey, error: humanError(reason, "الخدمة غير متاحة للبيع أو لا يوجد لها سعر ساري في هذا الفرع.") }); });
    return () => { cancelled = true; };
  }, [serviceQuoteKey, serviceId, quoteQuantity, quoteMemberId, context.organizationId, context.branchId]);

  useEffect(() => {
    if (!cartQuoteKey) return;
    let cancelled = false;
    void apiRequest<CheckoutQuote>(`/organizations/${context.organizationId}/order-quotes`, {
      method: "POST",
      body: JSON.stringify({
        sellingBranchId: context.branchId,
        ...(quoteMemberId ? { memberId: quoteMemberId } : {}),
        lines: cart.map(({ type, targetId, quantity }) => ({ type, targetId, quantity })),
      }),
    }).then((response) => {
      if (cancelled) return;
      setCartQuoteResult({ key: cartQuoteKey, quote: response.data });
      setSalePaymentParts((current) => distributePaymentParts(Number(response.data.grossMinor), current.length >= 2 ? current : defaultPaymentParts()));
    }).catch((reason) => {
      if (!cancelled) setCartQuoteResult({ key: cartQuoteKey, error: humanError(reason, "تعذر حساب إجمالي الفاتورة الحالية. راجع الأصناف والكميات ثم حاول مرة أخرى.") });
    });
    return () => { cancelled = true; };
  }, [cart, cartQuoteKey, context.branchId, context.organizationId, quoteMemberId]);

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
        serviceResponse,
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
        loadSource(
          "الخدمات المتاحة للبيع",
          "sales.checkout",
          apiRequest<Service[] | { items: Service[] }>(
            `${base}/services?branchId=${context.branchId}`,
          ).then((response) => list<Service>(response.data)),
          [] as Service[],
        ),
      ]);
      const responses = [
        mealResponse,
        pointResponse,
        shiftResponse,
        invoiceResponse,
        menuResponse,
        retailResponse,
        serviceResponse,
      ];
      const requestedInvoice = !deepLinkAppliedRef.current && (initialInvoiceId || initialOrderId)
        ? invoiceResponse.data.find((invoice) => invoice.id === initialInvoiceId || invoice.orderId === initialOrderId)
        : undefined;
      const deepLinkMissing = !deepLinkAppliedRef.current && (initialInvoiceId || initialOrderId) && !requestedInvoice;
      deepLinkAppliedRef.current = true;
      setLoadWarnings([
        ...responses.flatMap((response) => response.warning ? [response.warning] : []),
        ...(deepLinkMissing ? ["تعذر العثور على فاتورة الحجز المطلوبة ضمن فواتير الفرع الحالي. قد تكون محصلة بالفعل أو تخص فرعًا آخر."] : []),
      ]);
      setMeals(mealResponse.data);
      setCashPoints(pointResponse.data);
      setShifts(shiftResponse.data);
      setInvoices(invoiceResponse.data);
      setMenu(menuResponse.data);
      setRetailProducts(retailResponse.data);
      setServices(serviceResponse.data);
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
      setServiceId((current) =>
        serviceResponse.data.some((service) => service.id === current)
          ? current
          : "",
      );
      const requestedOutstanding = requestedInvoice ? outstanding(requestedInvoice) : 0;
      setPaymentInvoiceId((current) => requestedInvoice && requestedOutstanding > 0 ? requestedInvoice.id : (invoiceResponse.data.some((invoice) => invoice.id === current) ? current : ""));
      if (requestedInvoice && outstanding(requestedInvoice) > 0) {
        setPaymentParts(distributePaymentParts(outstanding(requestedInvoice), defaultPaymentParts()));
        setCollectionSuccess(`تم فتح ${requestedInvoice.invoiceNumber ?? "فاتورة الحجز"} وهي جاهزة للتحصيل.`);
        window.setTimeout(() => collectionCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
      } else if (requestedInvoice) {
        setCollectionSuccess(`${requestedInvoice.invoiceNumber ?? "فاتورة الحجز"} محصلة بالفعل ولا يوجد عليها رصيد مستحق.`);
      }
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

  function addCartLine() {
    const targetId = saleKind === "MEAL" ? mealId : saleKind === "RETAIL" ? productId : serviceId;
    const count = Number(quantity);
    if (!targetId) {
      setError("اختر الصنف الذي تريد إضافته إلى الفاتورة.");
      return;
    }
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      setError("أدخل كمية صحيحة بين 1 و100.");
      return;
    }
    if (saleKind === "SERVICE" && !serviceQuote) {
      setError(serviceQuoteError || "انتظر تأكيد السعر النهائي للخدمة قبل إضافتها.");
      return;
    }
    const source = saleKind === "MEAL"
      ? publishedMeals.find((item) => item.id === targetId)
      : saleKind === "RETAIL"
        ? retailProducts.find((item) => item.id === targetId)
        : services.find((item) => item.id === targetId);
    if (!source) {
      setError("الصنف المختار لم يعد متاحًا. حدّث الصفحة ثم أعد المحاولة.");
      return;
    }
    const type: CartLine["type"] = saleKind === "MEAL" ? "RESTAURANT" : saleKind === "RETAIL" ? "RETAIL" : "SERVICE";
    if (cartLineType && cartLineType !== type) {
      setError(`الفاتورة الحالية مخصصة لـ«${saleTypeLabel(cartLineType)}». أتممها أو أفرغها قبل بدء فاتورة من قسم آخر.`);
      return;
    }
    const key = `${type}:${targetId}`;
    const currentQuantity = cart.find((line) => line.key === key)?.quantity ?? 0;
    const nextQuantity = currentQuantity + count;
    if (nextQuantity > 100) {
      setError("إجمالي كمية الصنف داخل الفاتورة يجب ألا يتجاوز 100.");
      return;
    }
    if (saleKind === "RETAIL" && nextQuantity > ((source as RetailProduct).quantityAvailable ?? 0)) {
      setError(`الكمية المتاحة من ${(source as RetailProduct).name} هي ${(source as RetailProduct).quantityAvailable ?? 0} فقط.`);
      return;
    }
    if (saleKind === "MEAL" && (source as Meal).remainingQuantity !== undefined && nextQuantity > ((source as Meal).remainingQuantity ?? 0)) {
      setError(`الكمية المتبقية من ${(source as Meal).name} هي ${(source as Meal).remainingQuantity ?? 0} فقط.`);
      return;
    }
    setCart((current) => current.some((line) => line.key === key)
      ? current.map((line) => line.key === key ? { ...line, quantity: nextQuantity } : line)
      : [...current, { key, type, targetId, name: source.name, quantity: count }]);
    setQuantity("1");
    setError("");
    toast.success(`تمت إضافة ${source.name} إلى الفاتورة الحالية.`);
  }

  function changeCartQuantity(key: string, nextQuantity: number) {
    const line = cart.find((item) => item.key === key);
    if (!line) return;
    if (nextQuantity < 1) {
      setCart((current) => current.filter((item) => item.key !== key));
      return;
    }
    if (nextQuantity > 100) return;
    if (line.type === "RETAIL") {
      const available = retailProducts.find((product) => product.id === line.targetId)?.quantityAvailable ?? 0;
      if (nextQuantity > available) {
        setError(`الكمية المتاحة من ${line.name} هي ${available} فقط.`);
        return;
      }
    }
    if (line.type === "RESTAURANT") {
      const available = publishedMeals.find((meal) => meal.id === line.targetId)?.remainingQuantity;
      if (available !== undefined && nextQuantity > available) {
        setError(`الكمية المتبقية من ${line.name} هي ${available} فقط.`);
        return;
      }
    }
    setCart((current) => current.map((item) => item.key === key ? { ...item, quantity: nextQuantity } : item));
    setError("");
  }

  async function checkoutAndPay() {
    if (!context.organizationId || !context.branchId) return;
    if (cart.length === 0) {
      setError("أضف صنفًا واحدًا على الأقل إلى الفاتورة قبل التحصيل.");
      return;
    }
    if (customerMode === "MEMBER" && !selectedMember) {
      setError("ابحث عن العضو واختره، أو بدّل إلى «بيع لزائر».");
      return;
    }
    if (!cartQuote) {
      setError(cartQuoteError || "انتظر اكتمال حساب إجمالي الفاتورة قبل التحصيل.");
      return;
    }
    if (salePaymentMode === "SINGLE" && saleMethod === "CASH" && selectedShift === undefined) {
      setError("اختر وردية صندوق مفتوحة قبل تحصيل النقد.");
      return;
    }
    if (salePaymentMode === "SPLIT" && !saleSplitIsValid) {
      setError("راجع توزيع الدفعات. يجب أن يساوي مجموعها إجمالي الفاتورة، مع اختيار وسيلة مختلفة لكل دفعة.");
      return;
    }
    setSaving(true);
    setError("");
    let createdInvoiceId: string | undefined;
    try {
      const order = await apiRequest<{ invoiceId?: string }>(
        `/organizations/${context.organizationId}/orders`,
        {
          method: "POST",
          idempotencyKey: createIdempotencyKey(),
          body: JSON.stringify({
            sellingBranchId: context.branchId,
            ...(customerMode === "MEMBER" && selectedMember ? { memberId: selectedMember.id } : {}),
            lines: cart.map(({ type, targetId, quantity }) => ({ type, targetId, quantity })),
          }),
        },
      );
      if (!order.data.invoiceId) throw new Error("لم تُنشأ فاتورة للطلب.");
      createdInvoiceId = order.data.invoiceId;
      if (salePaymentMode === "SPLIT") await recordSplitPayment(createdInvoiceId, salePaymentParts, cartTotalMinor);
      else await recordPayment(createdInvoiceId, saleMethod, cartTotalMinor);
      toast.success(`تم تحصيل فاتورة واحدة تضم ${cart.length} ${cart.length === 1 ? "صنف" : "أصناف"}${salePaymentMode === "SPLIT" ? ` عبر ${salePaymentParts.length} وسائل دفع` : ""} بنجاح.`);
      setCart([]);
      setMealId("");
      setProductId("");
      setServiceId("");
      setQuantity("1");
      setSalePaymentMode("SINGLE");
      setSalePaymentParts(defaultPaymentParts());
      await load();
    } catch (reason) {
      if (createdInvoiceId) {
        setCart([]);
        await load();
        setPaymentInvoiceId(createdInvoiceId);
        if (salePaymentMode === "SPLIT") {
          setInvoicePaymentMode("SPLIT");
          setPaymentParts(distributePaymentParts(cartTotalMinor, salePaymentParts));
        }
        setCollectionSuccess("تم إنشاء الفاتورة لكن لم يكتمل تحصيلها. افتحها في قسم «تحصيل فاتورة معلقة» ولا تُنشئ طلب بيع جديدًا.");
        setError(humanError(reason, "تم إنشاء الفاتورة، لكن تعذر تسجيل الدفع. حصّل الفاتورة المعلقة بدل إعادة البيع."));
        collectionCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        setError(humanError(reason, "تعذر إكمال البيع والتحصيل."));
      }
    } finally {
      setSaving(false);
    }
  }

  async function recordPayment(invoiceId: string, paymentMethod: PaymentMethodCode = method, expectedOutstanding?: number) {
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
    if (expectedOutstanding !== undefined && Number(amountMinor) !== expectedOutstanding)
      throw new Error("تغيّر إجمالي الفاتورة أثناء الإصدار. افتح الفاتورة المعلقة وراجع الرصيد قبل التحصيل.");
    if (paymentMethod === "CASH" && selectedShift === undefined)
      throw new Error("اختر وردية صندوق مفتوحة قبل تحصيل النقد.");
    await apiRequest(`/organizations/${context.organizationId}/payments`, {
      method: "POST",
      idempotencyKey: createIdempotencyKey(),
      body: JSON.stringify({
        collectionBranchId: context.branchId,
        method: paymentMethod,
        amountMinor,
        allocations: [{ invoiceId, amountMinor }],
        ...(paymentMethod === "CASH"
          ? {
              cashierShiftId: selectedShift!.id,
              cashPointId: selectedShift!.cashPointId,
            }
          : {}),
      }),
    });
  }

  async function recordSplitPayment(invoiceId: string, parts: PaymentPart[], expectedOutstanding?: number) {
    if (!context.organizationId || !context.branchId) return;
    const invoice = (
      await apiRequest<Invoice>(
        `/organizations/${context.organizationId}/invoices/${invoiceId}`,
      )
    ).data;
    const amountDueMinor = outstanding(invoice);
    if (expectedOutstanding !== undefined && expectedOutstanding > 0 && amountDueMinor !== expectedOutstanding)
      throw new Error("تغيّر الرصيد المستحق للفاتورة. حدّث البيانات ثم أعد توزيع المبلغ.");
    if (amountDueMinor <= 0) throw new Error("لا يوجد رصيد مستحق لهذه الفاتورة.");
    const normalizedParts = parts.map((part) => ({ ...part, amountMinor: Number(minor(part.amount)) }));
    if (normalizedParts.length < 2 || normalizedParts.some((part) => part.amountMinor <= 0))
      throw new Error("أضف وسيلتي دفع على الأقل، وحدد مبلغًا أكبر من صفر لكل وسيلة.");
    if (normalizedParts.reduce((total, part) => total + part.amountMinor, 0) !== amountDueMinor)
      throw new Error("يجب أن يساوي مجموع الدفعات الرصيد المستحق للفاتورة دون فرق.");
    if (new Set(normalizedParts.map((part) => part.method)).size !== normalizedParts.length)
      throw new Error("اختر وسيلة مختلفة لكل جزء من التحصيل.");
    if (normalizedParts.some((part) => part.method === "CASH") && selectedShift === undefined)
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
        parts: normalizedParts.map((item) => part(item.method, item.amountMinor, item.reference)),
      }),
    });
  }

  function updatePaymentPart(id: string, changes: Partial<Omit<PaymentPart, "id">>) {
    setPaymentParts((current) => current.map((part) => part.id === id ? { ...part, ...changes } : part));
    setError("");
  }

  function addPaymentPart() {
    const used = new Set(paymentParts.map((part) => part.method));
    const nextMethod = paymentMethods.find((option) => !used.has(option.value))?.value;
    if (!nextMethod) return;
    setPaymentParts((current) => distributePaymentParts(selectedInvoiceOutstanding, [
      ...current,
      { id: crypto.randomUUID(), method: nextMethod, amount: "", reference: "" },
    ]));
    setError("");
  }

  function removePaymentPart(id: string) {
    setPaymentParts((current) => current.length <= 2 ? current : distributePaymentParts(selectedInvoiceOutstanding, current.filter((part) => part.id !== id)));
    setError("");
  }

  function updateSalePaymentPart(id: string, changes: Partial<Omit<PaymentPart, "id">>) {
    setSalePaymentParts((current) => current.map((part) => part.id === id ? { ...part, ...changes } : part));
    setError("");
  }

  function addSalePaymentPart() {
    const used = new Set(salePaymentParts.map((part) => part.method));
    const nextMethod = paymentMethods.find((option) => !used.has(option.value))?.value;
    if (!nextMethod) return;
    setSalePaymentParts((current) => distributePaymentParts(cartTotalMinor, [
      ...current,
      { id: crypto.randomUUID(), method: nextMethod, amount: "", reference: "" },
    ]));
    setError("");
  }

  function removeSalePaymentPart(id: string) {
    setSalePaymentParts((current) => current.length <= 2 ? current : distributePaymentParts(cartTotalMinor, current.filter((part) => part.id !== id)));
    setError("");
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
        await recordSplitPayment(paymentInvoiceId, paymentParts, selectedInvoiceOutstanding);
        setCollectionSuccess(`تم تحصيل ${invoiceNumber} عبر ${paymentParts.length} وسائل دفع وتحديث حالة الفاتورة.`);
        toast.success(`تم تسجيل ${paymentParts.length} دفعات معًا وتحديث حالة الفاتورة.`);
      } else {
        await recordPayment(paymentInvoiceId);
        setCollectionSuccess(`تم تحصيل ${invoiceNumber} بالكامل وتحديث حالتها.`);
        toast.success("تم تسجيل الدفعة وتحديث حالة الفاتورة والطلب المرتبط بها.");
      }
      await load();
      setPaymentInvoiceId("");
      setPaymentParts(defaultPaymentParts());
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
            بيع الخدمات والوجبات ومنتجات المتجر، تحصيل الفواتير، وإدارة وردية الصندوق في الفرع الحالي.
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
            <Card ref={collectionCardRef} className={initialInvoiceId || initialOrderId ? "border-primary/40 ring-2 ring-primary/10" : undefined}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-blue-500/10 text-blue-700">
                    <ReceiptText />
                  </span>
                  <div>
                    <h2 className="font-black">تحصيل فاتورة معلقة</h2>
                    <p className="text-xs text-muted-foreground">
                      لفواتير الحجوزات والاشتراكات وطلبات الأعضاء، مع إمكانية توزيع الرصيد على عدة وسائل دفع.
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
                      setPaymentParts(invoice ? distributePaymentParts(outstanding(invoice), paymentParts) : defaultPaymentParts());
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
                    <Button type="button" size="sm" variant={invoicePaymentMode === "SPLIT" ? "default" : "ghost"} onClick={() => { setInvoicePaymentMode("SPLIT"); setPaymentParts((current) => distributePaymentParts(selectedInvoiceOutstanding, current.length >= 2 ? current : defaultPaymentParts())); setError(""); }}>تقسيم على عدة وسائل</Button>
                  </div>
                  {invoicePaymentMode === "SINGLE" ? <div className="grid gap-2">
                    <label className="text-xs font-bold">طريقة دفع كامل الرصيد<PaymentMethod className="mt-2 w-full" value={method} onChange={setMethod} /></label>
                    {method === "CASH" && !selectedShift && <p className="rounded-xl bg-amber-500/10 p-3 text-xs font-semibold leading-6 text-amber-700 dark:text-amber-300">افتح وردية صندوق أولًا لتحصيل المبلغ نقدًا.</p>}
                  </div> : <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/[.035] p-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h3 className="text-sm font-black">توزيع مبلغ التحصيل</h3><p className="mt-1 text-[11px] leading-5 text-muted-foreground">أضف وسائل الدفع وحدد مبلغ كل وسيلة. يجب أن يطابق المجموع الرصيد المستحق.</p></div><Button type="button" size="sm" variant="outline" onClick={addPaymentPart} disabled={paymentParts.length >= paymentMethods.length || !paymentInvoiceId}><Plus/>إضافة وسيلة</Button></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {paymentParts.map((part, index) => <PaymentPartEditor
                        key={part.id}
                        title={`الدفعة ${index + 1}`}
                        method={part.method}
                        onMethodChange={(value) => updatePaymentPart(part.id, { method: value })}
                        amount={part.amount}
                        onAmountChange={(value) => updatePaymentPart(part.id, { amount: value })}
                        reference={part.reference}
                        onReferenceChange={(value) => updatePaymentPart(part.id, { reference: value })}
                        onRemove={paymentParts.length > 2 ? () => removePaymentPart(part.id) : undefined}
                      />)}
                    </div>
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-background/80 p-3 text-center text-xs sm:grid-cols-3">
                      <PaymentMetric label="مجموع الدفعات" value={`${money(paymentPartsTotal)} ر.س`} highlight={paymentPartsRemaining === 0 && paymentPartsTotal > 0}/>
                      <PaymentMetric label={paymentPartsRemaining >= 0 ? "المتبقي" : "الزيادة"} value={`${money(Math.abs(paymentPartsRemaining))} ر.س`} highlight={paymentPartsRemaining === 0}/>
                      <PaymentMetric label="عدد الوسائل" value={`${paymentParts.length}`} highlight={splitIsValid}/>
                    </div>
                    {!splitMethodsAreUnique && <p className="rounded-xl bg-red-500/10 p-3 text-xs font-semibold text-red-600">اختر وسيلة مختلفة لكل دفعة.</p>}
                    {paymentParts.some((part) => Number(minor(part.amount)) <= 0) && <p className="rounded-xl bg-amber-500/10 p-3 text-xs font-semibold leading-6 text-amber-700 dark:text-amber-300">يجب أن يكون مبلغ كل دفعة أكبر من صفر.</p>}
                    {paymentPartsRemaining !== 0 && <p className="rounded-xl bg-amber-500/10 p-3 text-xs font-semibold leading-6 text-amber-700 dark:text-amber-300">{paymentPartsRemaining > 0 ? `وزّع ${money(paymentPartsRemaining)} ر.س المتبقية على وسائل الدفع.` : `خفّض مجموع الدفعات بمقدار ${money(Math.abs(paymentPartsRemaining))} ر.س.`}</p>}
                    {splitUsesCash && !selectedShift && <p className="rounded-xl bg-red-500/10 p-3 text-xs font-semibold leading-6 text-red-600">الجزء النقدي يحتاج إلى وردية صندوق مفتوحة.</p>}
                    {splitUsesCash && selectedShift && <p className="rounded-xl bg-emerald-500/8 p-3 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">سيُربط الجزء النقدي تلقائيًا بالوردية المفتوحة ونقطة التحصيل الحالية.</p>}
                  </div>}
                  <Button
                    variant="outline"
                    onClick={() => void collectExistingInvoice()}
                    disabled={saving || !paymentInvoiceId || (invoicePaymentMode === "SINGLE" ? method === "CASH" && !selectedShift : !splitIsValid)}
                  >
                    {saving ? <Loader2 className="animate-spin"/> : <CreditCard />}
                    {invoicePaymentMode === "SPLIT" ? `تأكيد وتسجيل ${paymentParts.length} دفعات` : "تحصيل كامل الرصيد"}
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
                    أضف عدة أصناف من القسم نفسه، مثل أكثر من منتج أو أكثر من وجبة، ثم أصدر لها فاتورة واحدة.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant={saleKind === "SERVICE" ? "default" : "outline"} disabled={Boolean(cartLineType && cartLineType !== "SERVICE")} onClick={() => setSaleKind("SERVICE")}>خدمة</Button><Button type="button" variant={saleKind === "MEAL" ? "default" : "outline"} disabled={Boolean(cartLineType && cartLineType !== "RESTAURANT")} onClick={() => setSaleKind("MEAL")}>وجبة من قائمة اليوم</Button><Button type="button" variant={saleKind === "RETAIL" ? "default" : "outline"} disabled={Boolean(cartLineType && cartLineType !== "RETAIL")} onClick={() => setSaleKind("RETAIL")}>منتج من المتجر</Button></div>
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
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_auto]">
                {saleKind === "MEAL" ? <select
                  value={mealId}
                  onChange={(event) => setMealId(event.target.value)}
                  className="h-11 rounded-xl border bg-background px-3 text-sm"
                >
                  <option value="">اختر وجبة اليوم</option>
                  {publishedMeals.map((meal) => (
                    <option key={meal.id} value={meal.id} disabled={meal.remainingQuantity === 0}>
                      {meal.name}{meal.remainingQuantity === undefined ? "" : ` — متبقي ${meal.remainingQuantity}`}
                    </option>
                  ))}
                </select> : saleKind === "RETAIL" ? <select value={productId} onChange={(event) => setProductId(event.target.value)} className="h-11 rounded-xl border bg-background px-3 text-sm"><option value="">اختر منتجًا متاحًا</option>{retailProducts.map((product) => <option key={product.id} value={product.id}>{product.name} — {product.barcode ?? product.code ?? "بدون باركود"} — متاح {product.quantityAvailable ?? 0} — {money(Number(product.grossMinor ?? product.amountMinor ?? 0))} ر.س</option>)}</select> : <select value={serviceId} onChange={(event) => setServiceId(event.target.value)} className="h-11 rounded-xl border bg-background px-3 text-sm"><option value="">اختر خدمة متاحة في الفرع</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}{service.code ? ` — ${service.code}` : ""}</option>)}</select>}
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  placeholder="الكمية"
                />
                <Button type="button" variant="outline" onClick={addCartLine} disabled={!(saleKind === "MEAL" ? mealId : saleKind === "RETAIL" ? productId : serviceId) || !Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > 100 || (saleKind === "SERVICE" && (!serviceQuote || loadingServiceQuote))}><Plus/>إضافة للفاتورة</Button>
              </div>
              {saleKind === "SERVICE" && serviceId && (
                <div className="mt-3 rounded-xl border bg-secondary/40 p-3 text-xs" role="status">
                  {loadingServiceQuote ? "جارٍ حساب السعر النهائي..." : serviceQuote ? <>الإجمالي المطلوب: <strong>{money(Number(serviceQuote.grossMinor))} ر.س</strong>، يشمل ضريبة {money(Number(serviceQuote.taxMinor))} ر.س{Number(serviceQuote.discountMinor) > 0 ? ` بعد خصم ${money(Number(serviceQuote.discountMinor))} ر.س` : ""}.</> : serviceQuoteError || "اختر عميلًا وكمية صحيحة لحساب السعر."}
                </div>
              )}
              {saleKind === "MEAL" && menu?.status !== "PUBLISHED" && (
                <p className="mt-3 text-xs text-amber-700">
                  لا توجد قائمة مطعم منشورة للفرع اليوم؛ لا يمكن بيع وجبة قبل أن
                  ينشرها الشيف.
                </p>
              )}
              <section aria-labelledby="current-invoice-title" className="mt-5 rounded-2xl border bg-secondary/20 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div><h3 id="current-invoice-title" className="text-sm font-black">الفاتورة الحالية</h3><p className="mt-1 text-[11px] text-muted-foreground">{cart.length ? `${cart.length} ${cart.length === 1 ? "صنف" : "أصناف"} · ستصدر في فاتورة واحدة` : "أضف الأصناف المطلوبة قبل التحصيل"}</p></div>
                  {cart.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setCart([])}><Trash2/>إفراغ الفاتورة</Button>}
                </div>
                {cart.length === 0 ? <div className="mt-4 grid min-h-28 place-items-center rounded-xl border border-dashed bg-background/55 text-center"><div><ShoppingCart className="mx-auto size-6 text-muted-foreground"/><p className="mt-2 text-xs font-semibold text-muted-foreground">لم تضف أي أصناف بعد.</p></div></div> : <ul className="mt-4 space-y-2">
                  {cart.map((line) => <li key={line.key} className="flex flex-col gap-3 rounded-xl border bg-background p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{line.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{saleTypeLabel(line.type)}</p></div>
                    <div className="flex items-center gap-1" aria-label={`كمية ${line.name}`}>
                      <Button type="button" size="icon-sm" variant="outline" onClick={() => changeCartQuantity(line.key, line.quantity - 1)} aria-label={`إنقاص كمية ${line.name}`}><Minus/></Button>
                      <span className="grid h-8 min-w-10 place-items-center rounded-lg bg-secondary px-2 text-xs font-black" aria-live="polite">{line.quantity}</span>
                      <Button type="button" size="icon-sm" variant="outline" onClick={() => changeCartQuantity(line.key, line.quantity + 1)} aria-label={`زيادة كمية ${line.name}`}><Plus/></Button>
                      <Button type="button" size="icon-sm" variant="ghost" className="text-red-600" onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))} aria-label={`حذف ${line.name} من الفاتورة`}><Trash2/></Button>
                    </div>
                  </li>)}
                </ul>}
                {cart.length > 0 && <div className="mt-4 rounded-xl border bg-background/80 p-3" role="status" aria-live="polite">
                  {loadingCartQuote ? <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Loader2 className="size-4 animate-spin"/>جارٍ حساب إجمالي الفاتورة...</p>
                    : cartQuote ? <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                      <PaymentMetric label="قبل الضريبة" value={`${money(Number(cartQuote.netMinor))} ر.س`}/>
                      <PaymentMetric label="الخصم" value={`${money(Number(cartQuote.discountMinor))} ر.س`}/>
                      <PaymentMetric label="الضريبة" value={`${money(Number(cartQuote.taxMinor))} ر.س`}/>
                      <PaymentMetric label="إجمالي الفاتورة" value={`${money(cartTotalMinor)} ر.س`} highlight/>
                    </div>
                    : <p className="text-xs font-semibold leading-6 text-red-600">{cartQuoteError || "تعذر حساب إجمالي الفاتورة الحالية."}</p>}
                </div>}
                <div className="mt-4 space-y-4">
                  <div className="inline-flex rounded-xl border bg-background p-1" aria-label="طريقة توزيع التحصيل">
                    <Button type="button" size="sm" variant={salePaymentMode === "SINGLE" ? "default" : "ghost"} aria-pressed={salePaymentMode === "SINGLE"} onClick={() => { setSalePaymentMode("SINGLE"); setError(""); }}>وسيلة دفع واحدة</Button>
                    <Button type="button" size="sm" variant={salePaymentMode === "SPLIT" ? "default" : "ghost"} aria-pressed={salePaymentMode === "SPLIT"} onClick={() => { setSalePaymentMode("SPLIT"); setSalePaymentParts((current) => distributePaymentParts(cartTotalMinor, current.length >= 2 ? current : defaultPaymentParts())); setError(""); }}>تقسيم على عدة وسائل</Button>
                  </div>
                  {salePaymentMode === "SINGLE" ? <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <label className="text-xs font-bold">طريقة تحصيل الفاتورة<PaymentMethod className="mt-2 w-full" value={saleMethod} onChange={setSaleMethod}/></label>
                    <Button
                      onClick={() => void checkoutAndPay()}
                      disabled={saving || cart.length === 0 || loadingCartQuote || !cartQuote || (customerMode === "MEMBER" && !selectedMember) || (saleMethod === "CASH" && !selectedShift)}
                    >
                      {saving ? <Loader2 className="animate-spin" /> : <ReceiptText />}
                      إصدار فاتورة واحدة وتحصيلها
                    </Button>
                  </div> : <div className="space-y-3 rounded-2xl border bg-secondary/30 p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><p className="text-xs font-black">توزيع إجمالي الفاتورة</p><p className="mt-1 text-[11px] text-muted-foreground">اختر وسيلة مختلفة لكل دفعة، ويمكن استخدام حتى {paymentMethods.length} وسائل.</p></div>
                      <Button type="button" size="sm" variant="outline" onClick={addSalePaymentPart} disabled={!cartQuote || salePaymentParts.length >= paymentMethods.length}><Plus/>إضافة وسيلة</Button>
                    </div>
                    <div className="space-y-3">
                      {salePaymentParts.map((part, index) => <PaymentPartEditor
                        key={part.id}
                        title={`الدفعة ${index + 1}`}
                        method={part.method}
                        onMethodChange={(value) => updateSalePaymentPart(part.id, { method: value })}
                        amount={part.amount}
                        onAmountChange={(value) => updateSalePaymentPart(part.id, { amount: value })}
                        reference={part.reference}
                        onReferenceChange={(value) => updateSalePaymentPart(part.id, { reference: value })}
                        onRemove={salePaymentParts.length > 2 ? () => removeSalePaymentPart(part.id) : undefined}
                      />)}
                    </div>
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-background/80 p-3 text-center text-xs sm:grid-cols-3">
                      <PaymentMetric label="مجموع الدفعات" value={`${money(salePaymentPartsTotal)} ر.س`} highlight={salePaymentPartsRemaining === 0 && salePaymentPartsTotal > 0}/>
                      <PaymentMetric label={salePaymentPartsRemaining >= 0 ? "المتبقي" : "الزيادة"} value={`${money(Math.abs(salePaymentPartsRemaining))} ر.س`} highlight={salePaymentPartsRemaining === 0}/>
                      <PaymentMetric label="عدد الوسائل" value={`${salePaymentParts.length}`} highlight={saleSplitIsValid}/>
                    </div>
                    {!saleSplitMethodsAreUnique && <p className="rounded-xl bg-red-500/10 p-3 text-xs font-semibold text-red-600">اختر وسيلة مختلفة لكل دفعة.</p>}
                    {salePaymentParts.some((part) => Number(minor(part.amount)) <= 0) && <p className="rounded-xl bg-amber-500/10 p-3 text-xs font-semibold leading-6 text-amber-700 dark:text-amber-300">يجب أن يكون مبلغ كل دفعة أكبر من صفر.</p>}
                    {cartQuote && salePaymentPartsRemaining !== 0 && <p className="rounded-xl bg-amber-500/10 p-3 text-xs font-semibold leading-6 text-amber-700 dark:text-amber-300">{salePaymentPartsRemaining > 0 ? `وزّع ${money(salePaymentPartsRemaining)} ر.س المتبقية على وسائل الدفع.` : `خفّض مجموع الدفعات بمقدار ${money(Math.abs(salePaymentPartsRemaining))} ر.س.`}</p>}
                    {saleSplitUsesCash && !selectedShift && <p className="rounded-xl bg-red-500/10 p-3 text-xs font-semibold leading-6 text-red-600">الجزء النقدي يحتاج إلى وردية صندوق مفتوحة.</p>}
                    {saleSplitUsesCash && selectedShift && <p className="rounded-xl bg-emerald-500/8 p-3 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">سيُربط الجزء النقدي تلقائيًا بالوردية المفتوحة ونقطة التحصيل الحالية.</p>}
                    <Button
                      onClick={() => void checkoutAndPay()}
                      disabled={saving || cart.length === 0 || loadingCartQuote || !cartQuote || (customerMode === "MEMBER" && !selectedMember) || !saleSplitIsValid}
                    >
                      {saving ? <Loader2 className="animate-spin" /> : <ReceiptText />}
                      إصدار فاتورة واحدة وتسجيل {salePaymentParts.length} دفعات
                    </Button>
                  </div>}
                  {salePaymentMode === "SINGLE" && saleMethod === "CASH" && !selectedShift && <p className="rounded-xl bg-amber-500/10 p-3 text-xs font-semibold leading-6 text-amber-700 dark:text-amber-300">افتح وردية صندوق أولًا لتحصيل الفاتورة نقدًا.</p>}
                </div>
              </section>
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

function PaymentPartEditor({ title, method, onMethodChange, amount, onAmountChange, reference, onReferenceChange, onRemove }: {
  title: string;
  method: PaymentMethodCode;
  onMethodChange: (value: PaymentMethodCode) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  reference: string;
  onReferenceChange: (value: string) => void;
  onRemove?: () => void;
}) {
  return <div className="rounded-xl border bg-background p-3">
    <div className="mb-3 flex items-center justify-between gap-2"><p className="text-xs font-black">{title}</p>{onRemove && <Button type="button" size="icon-sm" variant="ghost" className="text-red-600" onClick={onRemove} aria-label={`حذف ${title}`}><Trash2/></Button>}</div>
    <div className="grid gap-3">
      <label className="text-[11px] font-bold">طريقة الدفع<PaymentMethod className="mt-2 w-full" value={method} onChange={onMethodChange}/></label>
      <label className="text-[11px] font-bold">المبلغ (ر.س)<Input className="mt-2" type="number" min="0.01" step="0.01" value={amount} onChange={event => onAmountChange(event.target.value)} /></label>
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
      {paymentMethods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}
function defaultPaymentParts(): PaymentPart[] {
  return [
    { id: "payment-part-1", method: "CASH", amount: "", reference: "" },
    { id: "payment-part-2", method: "CARD", amount: "", reference: "" },
  ];
}
function distributePaymentParts(totalMinor: number, parts: PaymentPart[]): PaymentPart[] {
  if (parts.length === 0) return defaultPaymentParts();
  if (totalMinor <= 0) return parts.map((part) => ({ ...part, amount: "" }));
  const base = Math.floor(totalMinor / parts.length);
  const remainder = totalMinor - base * parts.length;
  return parts.map((part, index) => ({ ...part, amount: ((base + (index < remainder ? 1 : 0)) / 100).toFixed(2) }));
}
function saleTypeLabel(type: CartLine["type"]) {
  return type === "RESTAURANT" ? "وجبة من قائمة اليوم" : type === "RETAIL" ? "منتج من المتجر" : "خدمة";
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
