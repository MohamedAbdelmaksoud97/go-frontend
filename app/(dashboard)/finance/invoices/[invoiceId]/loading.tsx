import { Loader2 } from "lucide-react"

export default function LoadingInvoiceDetails() {
  return <div className="grid min-h-[55vh] place-items-center"><div className="text-center"><Loader2 className="mx-auto size-9 animate-spin text-primary"/><p className="mt-3 text-sm text-muted-foreground">جارٍ فتح الفاتورة…</p></div></div>
}
