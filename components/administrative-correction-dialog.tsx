"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { apiRequest, createIdempotencyKey } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

type Preview = { sourceType: "SERVICE" | "BOOKING"; name: string; customerName: string; quantity: number; status: string;
  amountMinor: string; balanceMinor?: string; expectedVersion: number; expectedInvoiceVersion?: number; invoiceNumber?: string; settlement: string }
export type Correction = { id: string; sourceType: "SERVICE" | "BOOKING"; sourceId: string; status: "CANCELLED"; amountMinor: string; correctedByName?: string;
  settlement: string; reason: string; correctedAt: string; invoiceNumber?: string; refundRequestId?: string; balanceMinor: string }
export const correctionSettlementLabel = (value: string) => ({ VOIDED_UNPAID: "إلغاء الفاتورة غير المسددة", REDUCED_UNPAID: "تخفيض المستحق وإبقاء بقية البنود",
  REFUND_REQUIRED: "إنشاء طلب استرداد للمراجعة في المالية", NO_FINANCIAL_SETTLEMENT: "إلغاء البند دون استرداد مالي" } as Record<string, string>)[value] ?? value

export function AdministrativeCorrectionDialog({ path, onClose, onSaved }: { path: string; onClose: () => void; onSaved: (result: Correction) => void }) {
  const [preview, setPreview] = useState<Preview>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)
  const request = useRef<{ signature: string; key: string }>(undefined)
  useEffect(() => {
    let cancelled = false
    void apiRequest<Preview>(path).then(response => { if (!cancelled) { setPreview(response.data); setError("") } })
      .catch(failure => { if (!cancelled) { setPreview(undefined); setError(humanError(failure, "تعذر معاينة التصحيح الإداري.")) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [path, reload])
  async function submit() {
    if (!preview || loading || saving) return
    if (reason.trim().length < 3) { setError("اكتب سببًا واضحًا من 3 أحرف على الأقل."); return }
    const body = { reason: reason.trim(), expectedVersion: preview.expectedVersion,
      ...(preview.expectedInvoiceVersion === undefined ? {} : { expectedInvoiceVersion: preview.expectedInvoiceVersion }) }
    const signature = JSON.stringify(body)
    if (request.current?.signature !== signature) request.current = { signature, key: createIdempotencyKey() }
    setSaving(true); setError("")
    try {
      const response = await apiRequest<Correction>(path, { method: "POST", idempotencyKey: request.current.key, body: signature })
      onSaved(response.data)
    } catch (failure) { setError(humanError(failure, "تعذر تنفيذ التصحيح. راجع الحالة وحاول مجددًا.")) }
    finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-[120] grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="administrative-correction-title" className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl border bg-card p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl" dir="rtl">
      <header className="flex items-start gap-3"><div><p className="text-xs font-bold text-primary">إجراء مدير النظام</p><h2 id="administrative-correction-title" className="mt-1 text-xl font-black">تصحيح {path.includes("/orders/") ? "خدمة مسجلة" : "حجز مسجل"} بالخطأ</h2></div><Button variant="ghost" size="icon" className="mr-auto" aria-label="إغلاق" disabled={saving} onClick={onClose}><X/></Button></header>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">سيُلغى البند المحدد بكامل كميته مع حفظ السجل والسبب. تبقى البنود الأخرى، ولا تُطبق رسوم الإلغاء العادي أو مهلة الحجز.</p>
      {loading ? <p className="mt-5 flex items-center gap-2 text-sm" role="status"><Loader2 className="animate-spin"/>جارٍ معاينة الحالة والتسوية...</p>
        : preview && <dl className="mt-5 grid gap-3 rounded-2xl bg-secondary/40 p-4 text-sm"><div><dt className="text-xs text-muted-foreground">البند والعميل</dt><dd className="mt-1 font-bold">{preview.name} · {preview.customerName === "Walk-in" ? "زائر" : preview.customerName}</dd></div><div><dt className="text-xs text-muted-foreground">الكمية والحالة</dt><dd>{preview.quantity} · <StatusBadge status={preview.status}/></dd></div><div><dt className="text-xs text-muted-foreground">قيمة البند بعد الخصم والضريبة</dt><dd className="font-bold">{new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(Number(preview.amountMinor) / 100)}</dd></div>{preview.invoiceNumber && <div><dt className="text-xs text-muted-foreground">الفاتورة الأصلية</dt><dd dir="ltr">{preview.invoiceNumber}</dd></div>}{preview.invoiceNumber && preview.balanceMinor !== undefined && <div><dt className="text-xs text-muted-foreground">الرصيد المستحق بعد التصحيح</dt><dd className="font-bold">{new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" }).format(Number(preview.balanceMinor) / 100)}</dd></div>}<div><dt className="text-xs text-muted-foreground">نتيجة التصحيح</dt><dd className="mt-1 font-bold">{correctionSettlementLabel(preview.settlement)}</dd></div></dl>}
      <label htmlFor="administrative-correction-reason" className="mt-5 block text-sm font-bold">سبب التصحيح الإداري</label>
      <textarea id="administrative-correction-reason" maxLength={1000} className="mt-2 min-h-24 w-full rounded-xl border bg-background p-3 text-sm" value={reason} disabled={saving} onChange={event => setReason(event.target.value)} placeholder="اكتب سبب الخطأ كما حدث فعليًا"/>
      {error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-xs font-bold text-destructive">{error}</p>}
      <footer className="mt-6 flex flex-wrap gap-2 border-t pt-4"><Button variant="outline" disabled={saving} onClick={onClose}>إلغاء</Button><Button variant="outline" disabled={saving || loading} onClick={() => { setLoading(true); setPreview(undefined); setReload(value => value + 1) }}>تحديث المعاينة</Button><Button className="sm:mr-auto" variant="destructive" disabled={saving || loading || !preview || reason.trim().length < 3} onClick={() => void submit()}>{saving && <Loader2 className="animate-spin"/>}تأكيد التصحيح وإلغاء البند الخاطئ</Button></footer>
    </section>
  </div>
}
