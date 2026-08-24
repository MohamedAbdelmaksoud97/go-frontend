import { Badge } from "@/components/ui/badge"
import { CircleCheck, CircleMinus, Clock3, Snowflake, XCircle } from "lucide-react"

type StatusItem = {
  label: string
  variant: "success" | "warning" | "danger" | "secondary"
  icon: typeof CircleCheck
}

const statuses: Record<string, StatusItem> = {
  ACTIVE: { label: "نشط", variant: "success", icon: CircleCheck },
  CONFIRMED: { label: "مؤكد", variant: "success", icon: CircleCheck },
  COMPLETED: { label: "مكتمل", variant: "success", icon: CircleCheck },
  PAID: { label: "مدفوع", variant: "success", icon: CircleCheck },
  ACCEPTED: { label: "مسموح", variant: "success", icon: CircleCheck },
  ISSUED: { label: "صادرة", variant: "success", icon: CircleCheck },
  READY: { label: "جاهز", variant: "success", icon: CircleCheck },
  DELIVERED: { label: "تم التسليم", variant: "success", icon: CircleCheck },
  CLEAN: { label: "آمن", variant: "success", icon: CircleCheck },
  UPLOADED: { label: "مرفوع", variant: "success", icon: CircleCheck },
  FROZEN: { label: "مجمّد", variant: "warning", icon: Snowflake },
  PENDING: { label: "قيد الانتظار", variant: "warning", icon: Clock3 },
  SCHEDULED: { label: "مجدول", variant: "warning", icon: Clock3 },
  NEW: { label: "جديد", variant: "warning", icon: Clock3 },
  PREPARING: { label: "قيد التحضير", variant: "warning", icon: Clock3 },
  PARTIALLY_PAID: { label: "مدفوع جزئيًا", variant: "warning", icon: Clock3 },
  PARTIALLY_REFUNDED: { label: "مسترجع جزئيًا", variant: "warning", icon: Clock3 },
  REFUNDED: { label: "مسترجع", variant: "warning", icon: Clock3 },
  CANCELLED: { label: "ملغي", variant: "danger", icon: XCircle },
  EXPIRED: { label: "منتهي", variant: "danger", icon: XCircle },
  REJECTED: { label: "مرفوض", variant: "danger", icon: XCircle },
  FAILED: { label: "فشل", variant: "danger", icon: XCircle },
  INACTIVE: { label: "غير نشط", variant: "secondary", icon: CircleMinus },
  DRAFT: { label: "مسودة", variant: "secondary", icon: CircleMinus },
  VOID: { label: "ملغاة", variant: "secondary", icon: CircleMinus },
  VOIDED: { label: "ملغاة", variant: "secondary", icon: CircleMinus },
}

export function StatusBadge({ status }: { status: string }) {
  const normalizedStatus = status.toUpperCase()
  const item = statuses[normalizedStatus] ?? {
    label: status,
    variant: "secondary" as const,
    icon: CircleMinus,
  }
  const Icon = item.icon

  return (
    <Badge variant={item.variant}>
      <Icon className="size-3" />
      {item.label}
    </Badge>
  )
}
