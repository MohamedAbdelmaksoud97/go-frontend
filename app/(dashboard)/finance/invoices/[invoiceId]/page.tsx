import type { Metadata } from "next"
import { InvoiceDetailsPage } from "@/components/invoice-details-page"

export const metadata: Metadata = { title: "تفاصيل الفاتورة" }

export default async function InvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params
  return <InvoiceDetailsPage invoiceId={invoiceId}/>
}

