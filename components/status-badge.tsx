import { Badge } from "@/components/ui/badge"
import { CircleCheck, CircleMinus, Clock3, Snowflake, XCircle } from "lucide-react"

const statuses: Record<string, {label:string; variant:"success"|"warning"|"danger"|"secondary"; icon: typeof CircleCheck}> = {
 ACTIVE:{label:"نشط",variant:"success",icon:CircleCheck}, CONFIRMED:{label:"مؤكد",variant:"success",icon:CircleCheck}, COMPLETED:{label:"مكتمل",variant:"success",icon:CircleCheck}, PAID:{label:"مدفوع",variant:"success",icon:CircleCheck}, ACCEPTED:{label:"مسموح",variant:"success",icon:CircleCheck},
 FROZEN:{label:"مجمّد",variant:"warning",icon:Snowflake}, PENDING:{label:"قيد الانتظار",variant:"warning",icon:Clock3}, SCHEDULED:{label:"مجدول",variant:"warning",icon:Clock3}, NEW:{label:"جديد",variant:"warning",icon:Clock3},
 CANCELLED:{label:"ملغي",variant:"danger",icon:XCircle}, EXPIRED:{label:"منتهي",variant:"danger",icon:XCircle}, REJECTED:{label:"مرفوض",variant:"danger",icon:XCircle},
 INACTIVE:{label:"غير نشط",variant:"secondary",icon:CircleMinus},
}
export function StatusBadge({status}:{status:string}) { const item=statuses[status] ?? {label:status,variant:"secondary" as const,icon:CircleMinus}; const Icon=item.icon; return <Badge variant={item.variant}><Icon className="size-3"/>{item.label}</Badge> }
