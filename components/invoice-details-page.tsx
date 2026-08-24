"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight, BadgePercent, Banknote, Building2, FileText,
  Hash, Loader2, Package, ReceiptText, RefreshCw, RotateCcw, ShoppingBag,
  UserRound, WalletCards,
} from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

type InvoiceLine = {
  id: string; orderLineId?: string; description: string; lineType?: string; targetId?: string; targetCode?: string; targetName?: string
  quantity: number; unitNetMinor: string; netMinor: string; discountMinor: string; taxMinor: string; grossMinor: string
  taxRateBps: number; taxInclusive: boolean; fulfillmentStatus?: string; fulfillmentReferenceId?: string; commercialSnapshot?: Record<string, unknown>
}
type InvoicePayment = {
  allocationId: string; allocationAmountMinor: string; allocatedAt: string; id: string; method: string; status: string
  amountMinor: string; allocatedMinor: string; refundedMinor: string; currency: string; externalReference?: string
  collectionBranchId: string; collectionBranchName?: string; receivedBy: string; receivedByName?: string; receivedAt: string
  cashierShiftId?: string; cashPointId?: string
}
type InvoiceRefund = { id: string; paymentId: string; amountMinor: string; currency: string; reason: string; refundedBy: string; refundedByName?: string; refundedAt: string }
type InvoiceDetails = {
  id: string; invoiceNumber: string; orderId?: string; memberId?: string; sellingBranchId: string; status: string
  netMinor: string; discountMinor: string; taxMinor: string; grossMinor: string; paidMinor: string; balanceMinor: string; currency: string
  taxSnapshot: Record<string, unknown>; issuedAt: string; voidedAt?: string; voidReason?: string; version: number; createdAt: string; updatedAt: string
  member?: { id: string; memberNumber: string; legacyMemberNumber?: string; name: string; phone?: string; email?: string }
  branch: { id: string; code: string; name: string }
  order?: { id: string; orderNumber: string; buyerType: string; status: string; createdByName?: string; createdAt: string; updatedAt: string }
  lines: InvoiceLine[]; payments: InvoicePayment[]; refunds: InvoiceRefund[]
}

export function InvoiceDetailsPage({ invoiceId }: { invoiceId: string }) {
  const context = useAppContext()
  const [invoice, setInvoice] = useState<InvoiceDetails>()
  const [loading, setLoading] = useState(hasRuntimeApi())
  const [error, setError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (context.loading || !context.organizationId || !invoiceId || !hasRuntimeApi()) return
    let cancelled = false
    async function load() {
      setLoading(true); setError("")
      try {
        const response = await apiRequest<InvoiceDetails>(`/organizations/${context.organizationId}/invoices/${invoiceId}`)
        if (!cancelled) setInvoice(response.data)
      } catch (reason) {
        if (!cancelled) setError(humanError(reason, "تعذر فتح تفاصيل الفاتورة. تأكد من صلاحيتك على فرع الفاتورة ثم حاول مجددًا."))
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [context.loading, context.organizationId, invoiceId, reloadKey])

  const invoiceType = useMemo(() => describeInvoiceType(invoice?.lines ?? []), [invoice?.lines])

  if (context.loading || loading) return <div className="grid min-h-[55vh] place-items-center"><div className="text-center"><Loader2 className="mx-auto size-9 animate-spin text-primary"/><p className="mt-3 text-sm text-muted-foreground">جارٍ تجهيز تفاصيل الفاتورة…</p></div></div>
  if (!context.canAccess(["finance.invoices.read"])) return <EmptyState title="لا تملك صلاحية عرض الفواتير" detail="اطلب من مسؤول النظام منحك صلاحية عرض الفواتير في فرعك." />
  if (error || !invoice) return <EmptyState title="تعذر فتح الفاتورة" detail={error || "لم يعد سجل الفاتورة متاحًا."} onRetry={() => setReloadKey(value => value + 1)} />

  return <div className="fade-up space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <Link href="/finance" className={buttonVariants({variant:"ghost",className:"mb-3 -mr-3"})}><ArrowRight/>العودة إلى السجلات المالية</Link>
        <div className="flex flex-wrap items-center gap-3"><Badge variant="outline">{invoiceType}</Badge><StatusBadge status={invoice.status}/></div>
        <h1 className="mt-3 text-3xl font-black sm:text-4xl">فاتورة {invoice.invoiceNumber}</h1>
        <p className="mt-2 text-sm text-muted-foreground">تفاصيل البنود والتحصيل والضرائب والبيانات المرتبطة بهذه الفاتورة.</p>
      </div>
      <Button variant="outline" onClick={() => setReloadKey(value => value + 1)}><RefreshCw/>تحديث التفاصيل</Button>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric title="إجمالي الفاتورة" value={money(invoice.grossMinor, invoice.currency)} hint="شامل الضريبة بعد الخصم" icon={ReceiptText}/>
      <Metric title="المبلغ المحصل" value={money(invoice.paidMinor, invoice.currency)} hint={`${invoice.payments.length} عملية تحصيل مرتبطة`} icon={Banknote}/>
      <Metric title="المبلغ المتبقي" value={money(invoice.balanceMinor, invoice.currency)} hint={Number(invoice.balanceMinor) > 0 ? "مطلوب تحصيله" : "لا يوجد رصيد مستحق"} icon={WalletCards}/>
      <Metric title="الضريبة" value={money(invoice.taxMinor, invoice.currency)} hint={`الخصم ${money(invoice.discountMinor, invoice.currency)}`} icon={BadgePercent}/>
    </div>

    <div className="grid gap-4 xl:grid-cols-3">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="text-primary"/>صاحب الفاتورة</CardTitle></CardHeader><CardContent className="space-y-3">
        {invoice.member ? <><Info label="الاسم" value={invoice.member.name}/><Info label="رقم العضوية" value={invoice.member.memberNumber}/>{invoice.member.legacyMemberNumber&&<Info label="رقم العضوية القديم" value={invoice.member.legacyMemberNumber}/>}<Info label="الجوال" value={invoice.member.phone}/><Info label="البريد الإلكتروني" value={invoice.member.email}/><Link href={`/members/${invoice.member.id}`} className={buttonVariants({variant:"outline",className:"mt-2 w-full"})}>فتح ملف العضو</Link></> : <p className="text-sm text-muted-foreground">فاتورة لعميل غير مرتبط بعضوية.</p>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="text-primary"/>الفرع ومصدر البيع</CardTitle></CardHeader><CardContent className="space-y-3"><Info label="الفرع" value={invoice.branch.name}/><Info label="رمز الفرع" value={invoice.branch.code}/><Info label="تاريخ الإصدار" value={dateTime(invoice.issuedAt)}/><Info label="آخر تحديث" value={dateTime(invoice.updatedAt)}/></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShoppingBag className="text-primary"/>طلب البيع</CardTitle></CardHeader><CardContent className="space-y-3">
        {invoice.order ? <><Info label="رقم الطلب" value={invoice.order.orderNumber}/><Info label="حالة الطلب" value={statusLabel(invoice.order.status)}/><Info label="نوع المشتري" value={buyerLabel(invoice.order.buyerType)}/><Info label="أنشأه" value={invoice.order.createdByName}/><Info label="تاريخ الطلب" value={dateTime(invoice.order.createdAt)}/></> : <p className="text-sm text-muted-foreground">لا يوجد طلب بيع مرتبط بهذه الفاتورة.</p>}
      </CardContent></Card>
    </div>

    <Card className="overflow-hidden">
      <CardHeader><div><CardTitle className="flex items-center gap-2"><Package className="text-primary"/>بنود الفاتورة</CardTitle><p className="mt-1 text-sm text-muted-foreground">اسم كل بند ونوعه وكميته وقيمته والضريبة المطبقة عليه.</p></div><Badge variant="secondary">{invoice.lines.length} بند</Badge></CardHeader>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[980px] text-right"><thead className="bg-secondary/50"><tr>{["البند","النوع","الكمية","سعر الوحدة قبل الضريبة","الخصم","الضريبة","الإجمالي","التنفيذ"].map(label=><th key={label} className="px-5 py-4 text-xs text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y">{invoice.lines.map(line=><tr key={line.id}><td className="px-5 py-4"><p className="font-bold">{line.targetName || line.description}</p>{line.targetCode&&<p className="mt-1 text-xs text-muted-foreground">{line.targetCode}</p>}</td><td className="px-5 py-4"><Badge variant="outline">{lineTypeLabel(line.lineType)}</Badge></td><td className="px-5 py-4 font-semibold">{line.quantity}</td><td className="px-5 py-4">{money(line.unitNetMinor, invoice.currency)}</td><td className="px-5 py-4">{money(line.discountMinor, invoice.currency)}</td><td className="px-5 py-4"><p>{money(line.taxMinor, invoice.currency)}</p><p className="text-xs text-muted-foreground">{taxRate(line.taxRateBps)} · {line.taxInclusive ? "شاملة" : "مضافة"}</p></td><td className="px-5 py-4 font-bold">{money(line.grossMinor, invoice.currency)}</td><td className="px-5 py-4">{line.fulfillmentStatus ? statusLabel(line.fulfillmentStatus) : "غير مرتبط بتنفيذ"}</td></tr>)}</tbody></table></div>
      {!invoice.lines.length&&<p className="p-10 text-center text-sm text-muted-foreground">لا توجد بنود مسجلة لهذه الفاتورة.</p>}
      {invoice.lines.some(line=>line.commercialSnapshot)&&<div className="grid gap-3 border-t p-5 lg:grid-cols-2">{invoice.lines.filter(line=>line.commercialSnapshot).map(line=><LineSpecificDetails key={line.id} line={line}/>)}</div>}
    </Card>

    <Card className="overflow-hidden">
      <CardHeader><div><CardTitle className="flex items-center gap-2"><WalletCards className="text-primary"/>سجل التحصيل</CardTitle><p className="mt-1 text-sm text-muted-foreground">كل دفعة خُصصت لهذه الفاتورة، ومكان وموظف وتاريخ تسجيلها.</p></div><Badge variant="secondary">{invoice.payments.length} دفعة</Badge></CardHeader>
      {invoice.payments.length ? <><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1000px] text-right"><thead className="bg-secondary/50"><tr>{["طريقة الدفع","المخصص للفاتورة","إجمالي الدفعة","المسترجع","المرجع","موظف التحصيل","فرع التحصيل","التاريخ","الحالة"].map(label=><th key={label} className="px-5 py-4 text-xs text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y">{invoice.payments.map(payment=><tr key={payment.allocationId}><td className="px-5 py-4 font-semibold">{paymentMethodLabel(payment.method)}</td><td className="px-5 py-4 font-bold text-emerald-500">{money(payment.allocationAmountMinor, payment.currency)}</td><td className="px-5 py-4">{money(payment.amountMinor, payment.currency)}</td><td className="px-5 py-4">{money(payment.refundedMinor, payment.currency)}</td><td className="px-5 py-4">{payment.externalReference || "—"}</td><td className="px-5 py-4">{payment.receivedByName || "موظف مخول"}</td><td className="px-5 py-4">{payment.collectionBranchName || "—"}</td><td className="px-5 py-4">{dateTime(payment.receivedAt)}</td><td className="px-5 py-4"><StatusBadge status={payment.status}/></td></tr>)}</tbody></table></div><div className="grid gap-3 border-t p-5 lg:grid-cols-2">{invoice.payments.map(payment=><details key={payment.allocationId} className="rounded-xl border bg-secondary/20 p-4"><summary className="cursor-pointer font-bold">مراجع دفعة {payment.externalReference || shortId(payment.id)}</summary><div className="mt-4 space-y-2"><Info label="معرّف الدفعة" value={payment.id} mono/><Info label="معرّف التخصيص" value={payment.allocationId} mono/><Info label="وقت التخصيص" value={dateTime(payment.allocatedAt)}/><Info label="وردية الصندوق" value={payment.cashierShiftId} mono/><Info label="نقطة التحصيل" value={payment.cashPointId} mono/></div></details>)}</div></> : <p className="p-10 text-center text-sm text-muted-foreground">لم تُسجل أي دفعة على هذه الفاتورة حتى الآن.</p>}
    </Card>

    {invoice.refunds.length>0&&<Card className="overflow-hidden border-red-500/25"><CardHeader><div><CardTitle className="flex items-center gap-2"><RotateCcw className="text-red-500"/>الاسترجاعات المرتبطة</CardTitle><p className="mt-1 text-sm text-muted-foreground">عمليات الاسترجاع المسجلة على الدفعات التي سددت هذه الفاتورة.</p></div></CardHeader><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-right"><thead className="bg-secondary/50"><tr>{["المبلغ","السبب","نفذها","التاريخ","مرجع الدفعة"].map(label=><th key={label} className="px-5 py-4 text-xs text-muted-foreground">{label}</th>)}</tr></thead><tbody className="divide-y">{invoice.refunds.map(refund=><tr key={refund.id}><td className="px-5 py-4 font-bold text-red-500">{money(refund.amountMinor, refund.currency)}</td><td className="px-5 py-4">{refund.reason}</td><td className="px-5 py-4">{refund.refundedByName || "موظف مخول"}</td><td className="px-5 py-4">{dateTime(refund.refundedAt)}</td><td className="px-5 py-4 font-mono text-xs">{shortId(refund.paymentId)}</td></tr>)}</tbody></table></div></Card>}

    {invoice.status === "VOIDED"&&<Card className="border-red-500/30 bg-red-500/5"><CardContent className="flex gap-3"><RotateCcw className="mt-0.5 text-red-500"/><div><p className="font-bold text-red-500">تم إلغاء هذه الفاتورة</p><p className="mt-1 text-sm text-muted-foreground">{invoice.voidReason || "لم يُسجل سبب الإلغاء."}{invoice.voidedAt ? ` · ${dateTime(invoice.voidedAt)}` : ""}</p></div></CardContent></Card>}

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Hash className="text-primary"/>البيانات المرجعية</CardTitle></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Info label="معرّف الفاتورة" value={invoice.id} mono/><Info label="معرّف طلب البيع" value={invoice.orderId} mono/><Info label="إصدار السجل" value={String(invoice.version)}/><Info label="صافي البنود" value={money(invoice.netMinor, invoice.currency)}/><Info label="وقت الإنشاء" value={dateTime(invoice.createdAt)}/><Info label="عملة الفاتورة" value={invoice.currency}/></div>{Object.keys(invoice.taxSnapshot??{}).length>0&&<details className="mt-5 rounded-xl border bg-secondary/20 p-4"><summary className="cursor-pointer font-bold">مرجع الضريبة المحفوظ وقت الإصدار</summary><SnapshotGrid value={invoice.taxSnapshot}/></details>}</CardContent></Card>
  </div>
}

function Metric({ title, value, hint, icon: Icon }: { title: string; value: string; hint: string; icon: typeof FileText }) { return <Card><CardContent className="flex items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">{title}</p><p className="mt-3 text-2xl font-black">{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5"/></span></CardContent></Card> }
function LineSpecificDetails({line}:{line:InvoiceLine}){const snapshot=line.commercialSnapshot??{};const packageSnapshot=asRecord(snapshot.packageSnapshot);const nutrition=asRecord(snapshot.nutrition);const promotion=asRecord(snapshot.promotion);return <details className="rounded-xl border bg-secondary/20 p-4"><summary className="cursor-pointer"><span className="font-bold">تفاصيل {line.targetName||line.description}</span><span className="mr-2 text-xs text-muted-foreground">{lineTypeLabel(line.lineType)}</span></summary><div className="mt-4 space-y-3"><div className="grid gap-2 sm:grid-cols-2"><Info label="وقت احتساب السعر" value={dateTime(asText(snapshot.quotedAt))}/><Info label="حالة التنفيذ" value={line.fulfillmentStatus?statusLabel(line.fulfillmentStatus):undefined}/>{line.fulfillmentReferenceId&&<Info label="مرجع التنفيذ" value={line.fulfillmentReferenceId} mono/>}{asText(snapshot.businessDate)&&<Info label="يوم قائمة المطعم" value={asText(snapshot.businessDate)}/>} {snapshot.specialPriceApplied!==undefined&&<Info label="تم تطبيق سعر خاص" value={snapshot.specialPriceApplied?"نعم":"لا"}/>} {asText(snapshot.portionClass)&&<Info label="حجم الحصة" value={portionLabel(asText(snapshot.portionClass))}/>}</div>{Object.keys(promotion).length>0&&<div className="rounded-lg border p-3"><p className="mb-2 text-sm font-bold">العرض المطبق</p><Info label="العرض" value={asText(promotion.name)}/><Info label="الرمز" value={asText(promotion.code)}/></div>}{Object.keys(packageSnapshot).length>0&&<div className="rounded-lg border p-3"><p className="mb-2 text-sm font-bold">تفاصيل الباقة وقت البيع</p><div className="grid gap-2 sm:grid-cols-2"><Info label="المدة" value={asNumber(packageSnapshot.durationDays)!==undefined?`${asNumber(packageSnapshot.durationDays)} يومًا`:undefined}/><Info label="عدد الزيارات" value={nullableText(packageSnapshot.visitAllowance)}/><Info label="سياسة دخول الفروع" value={branchPolicyLabel(asText(packageSnapshot.branchAccessPolicy))}/><Info label="نوع الاستفادة" value={fulfillmentLabel(asText(packageSnapshot.fulfillmentKind))}/></div><TextList title="الخدمات المشمولة" values={asArray(packageSnapshot.entitlements).map(item=>asText(asRecord(item).service&&asRecord(asRecord(item).service).name)).filter(Boolean) as string[]}/><TextList title="السياسات المطبقة" values={asArray(packageSnapshot.policies).map(item=>asText(asRecord(item).name)).filter(Boolean) as string[]}/></div>}{Object.keys(nutrition).length>0&&<div className="rounded-lg border p-3"><p className="mb-2 text-sm font-bold">القيم الغذائية المسجلة للوجبة</p><div className="grid gap-2 sm:grid-cols-2"><Info label="السعرات" value={nutritionValue(nutrition.caloriesKcal,"سعرة")}/><Info label="البروتين" value={nutritionValue(nutrition.proteinGrams,"غ")}/><Info label="الكربوهيدرات" value={nutritionValue(nutrition.carbohydratesGrams,"غ")}/><Info label="الدهون" value={nutritionValue(nutrition.fatGrams,"غ")}/><Info label="الألياف" value={nutritionValue(nutrition.fiberGrams,"غ")}/><Info label="السكريات" value={nutritionValue(nutrition.sugarGrams,"غ")}/><Info label="الصوديوم" value={nutritionValue(nutrition.sodiumMilligrams,"ملغ")}/></div><TextList title="مسببات الحساسية" values={asArray(snapshot.allergens).map(value=>String(value))}/></div>}</div></details>}
function SnapshotGrid({value}:{value:Record<string,unknown>}){return <div className="mt-4 grid gap-2 sm:grid-cols-2">{Object.entries(value).map(([key,item])=><Info key={key} label={snapshotLabel(key)} value={displaySnapshotValue(item)}/>)}</div>}
function TextList({title,values}:{title:string;values:string[]}){if(!values.length)return null;return <div className="mt-3"><p className="text-xs text-muted-foreground">{title}</p><div className="mt-2 flex flex-wrap gap-2">{values.map(value=><Badge key={value} variant="outline">{value}</Badge>)}</div></div>}
function Info({ label, value, mono=false }: { label: string; value?: string; mono?: boolean }) { return <div className="flex items-start justify-between gap-4 border-b pb-2 last:border-0"><span className="text-sm text-muted-foreground">{label}</span><span className={`max-w-[70%] break-all text-left text-sm font-semibold ${mono?"font-mono text-xs":""}`}>{value || "—"}</span></div> }
function EmptyState({ title, detail, onRetry }: { title: string; detail: string; onRetry?: () => void }) { return <Card className="mx-auto max-w-2xl"><CardContent className="py-14 text-center"><FileText className="mx-auto size-10 text-muted-foreground"/><h1 className="mt-4 text-2xl font-black">{title}</h1><p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{detail}</p><div className="mt-6 flex justify-center gap-2"><Link href="/finance" className={buttonVariants({variant:"outline"})}><ArrowRight/>السجلات المالية</Link>{onRetry&&<Button onClick={onRetry}><RefreshCw/>إعادة المحاولة</Button>}</div></CardContent></Card> }
function money(value: string | number | undefined, currency="SAR") { const amount=Number(value??0)/100; return new Intl.NumberFormat("ar-SA",{style:"currency",currency:currency||"SAR",maximumFractionDigits:2}).format(Number.isFinite(amount)?amount:0) }
function dateTime(value?: string) { if(!value)return"—";const date=new Date(value);return Number.isNaN(date.getTime())?"—":new Intl.DateTimeFormat("ar-SA",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Riyadh"}).format(date) }
function taxRate(value:number){return new Intl.NumberFormat("ar-SA",{style:"percent",maximumFractionDigits:2}).format(value/10_000)}
function shortId(value:string){return value.length>13?`${value.slice(0,8)}…${value.slice(-4)}`:value}
function describeInvoiceType(lines:InvoiceLine[]){const types=[...new Set(lines.map(line=>line.lineType).filter(Boolean))];return types.length===1?`${lineTypeLabel(types[0])} · فاتورة`:types.length>1?"فاتورة متعددة البنود":"فاتورة مبيعات"}
function lineTypeLabel(value?:string){return ({MEMBERSHIP:"اشتراك أو باقة",SERVICE:"خدمة",BOOKING:"حجز",RESTAURANT:"طلب مطعم",RETAIL:"منتج متجر"} as Record<string,string>)[value??""]??"بند مالي"}
function paymentMethodLabel(value:string){return ({CASH:"نقدي",CARD:"بطاقة",BANK_TRANSFER:"تحويل بنكي",GATEWAY:"بوابة دفع",WALLET:"محفظة"} as Record<string,string>)[value]??value}
function buyerLabel(value:string){return ({MEMBER:"عضو",WALK_IN:"زائر",STAFF:"موظف"} as Record<string,string>)[value]??value}
function statusLabel(value:string){return ({DRAFT:"مسودة",PENDING_PAYMENT:"بانتظار السداد",ISSUED:"صادرة",PARTIALLY_PAID:"مدفوعة جزئيًا",PAID:"مدفوعة",VOIDED:"ملغاة",FULFILLED:"مكتمل",PENDING:"قيد الانتظار",ACTIVE:"نشط",RECORDED:"مسجل",REFUNDED:"مسترجع",PARTIALLY_REFUNDED:"مسترجع جزئيًا",NOT_STARTED:"لم يبدأ"} as Record<string,string>)[value]??value}
function asRecord(value:unknown):Record<string,unknown>{return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>: {}}
function asArray(value:unknown):unknown[]{return Array.isArray(value)?value:[]}
function asText(value:unknown):string|undefined{if(typeof value!=="string")return undefined;const normalized=value.trim();return normalized||undefined}
function asNumber(value:unknown):number|undefined{const number=typeof value==="number"?value:typeof value==="string"&&value.trim()?Number(value):Number.NaN;return Number.isFinite(number)?number:undefined}
function nullableText(value:unknown):string|undefined{const number=asNumber(value);if(number!==undefined)return new Intl.NumberFormat("ar-SA").format(number);return asText(value)}
function nutritionValue(value:unknown,unit:string):string|undefined{const number=asNumber(value);return number===undefined?undefined:`${new Intl.NumberFormat("ar-SA",{maximumFractionDigits:2}).format(number)} ${unit}`}
function portionLabel(value?:string){return ({SMALL:"صغيرة",REGULAR:"عادية",LARGE:"كبيرة",FAMILY:"عائلية"} as Record<string,string>)[value??""]??value}
function branchPolicyLabel(value?:string){return ({HOME_BRANCH_ONLY:"الفرع الأساسي فقط",SELECTED_BRANCHES:"فروع محددة",ALL_BRANCHES:"جميع الفروع"} as Record<string,string>)[value??""]??value}
function fulfillmentLabel(value?:string){return ({TIME_BASED:"مدة زمنية",VISIT_BASED:"عدد زيارات",HYBRID:"مدة وزيارات",ENTITLEMENT_BASED:"استحقاقات محددة"} as Record<string,string>)[value??""]??value}
function snapshotLabel(value:string){return ({source:"مصدر الاحتساب",taxPolicyId:"السياسة الضريبية",taxRateBps:"نسبة الضريبة",taxInclusive:"السعر شامل الضريبة",calculatedAt:"وقت الاحتساب",quotedAt:"وقت التسعير",businessDate:"تاريخ التشغيل",specialPriceApplied:"سعر خاص مطبق",portionClass:"حجم الحصة"} as Record<string,string>)[value]??value.replaceAll("_"," ").replace(/([a-z])([A-Z])/g,"$1 $2")}
function displaySnapshotValue(value:unknown):string|undefined{if(value===null||value===undefined||value==="")return undefined;if(typeof value==="boolean")return value?"نعم":"لا";if(typeof value==="number")return new Intl.NumberFormat("ar-SA",{maximumFractionDigits:2}).format(value);if(typeof value==="string")return value;if(Array.isArray(value))return value.map(item=>displaySnapshotValue(item)).filter(Boolean).join("، ")||undefined;const record=asRecord(value);return asText(record.name)??asText(record.code)??(Object.entries(record).map(([key,item])=>`${snapshotLabel(key)}: ${displaySnapshotValue(item)??"—"}`).join("، ")||undefined)}
