import type { Metadata } from "next"
import { CashierWorkstation } from "@/components/cashier-workstation"

export const metadata: Metadata = { title: "نقطة البيع والكاشير" }

export default async function Page({ searchParams }: { searchParams: Promise<{ invoiceId?: string; orderId?: string }> }) {
  const query = await searchParams
  return <CashierWorkstation initialInvoiceId={query.invoiceId ?? ""} initialOrderId={query.orderId ?? ""} />
}
