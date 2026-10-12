import { Badge } from "@/components/ui/badge"
import { accessDeviceReason, accessReader, accessSeverity, accessSystemReason, attendanceRejectionReason, gateOpenedButSystemRejected } from "@/lib/access-event"
import type { MemberAccessEntry } from "@/lib/member-access-history"

type NamedBranch = { id: string; nameAr?: string; name?: string }
type NamedSubscription = { id: string; subscriptionNumber: string }
const methods: Record<string, string> = { MANUAL: "تسجيل يدوي", FINGERPRINT: "بصمة", RFID: "بطاقة", QR: "رمز QR" }

export function MemberAccessHistory({ entries, branches, subscriptions }: {
  entries: MemberAccessEntry[]; branches: NamedBranch[]; subscriptions: NamedSubscription[]
}) {
  return <div className="overflow-x-auto rounded-2xl border bg-card"><table className="w-full min-w-[1100px] text-sm">
    <thead className="bg-secondary/50 text-xs text-muted-foreground"><tr>
      {["الوقت", "طريقة التسجيل", "الفرع", "الاشتراك", "PIN", "القارئ", "قرار اللوحة", "قرار GO"].map(label => <th key={label} className="p-3 text-right">{label}</th>)}
    </tr></thead>
    <tbody>{entries.map(({ id, occurredAt, branchId, attempt, event }) => {
      const branch = branches.find(branch => branch.id === branchId)
      const subscription = subscriptions.find(subscription => subscription.id === attempt?.subscriptionId)
      const method = attempt?.accessMethod ?? event?.accessMethod ?? "FINGERPRINT"
      return <tr key={id} className={`border-t ${event && gateOpenedButSystemRejected(event) ? "bg-red-500/10" : ""}`}>
        <td className="p-3 whitespace-nowrap">{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(occurredAt))}</td>
        <td className="p-3">{methods[method] ?? method}</td>
        <td className="p-3">{branch?.nameAr ?? branch?.name ?? "—"}</td>
        <td className="p-3 font-mono" dir="ltr">{subscription?.subscriptionNumber ?? "—"}</td>
        <td className="p-3 font-mono" dir="ltr">{event?.credentialPin ?? "—"}</td>
        <td className="p-3">{event ? accessReader(event) : method === "MANUAL" ? "دخول يدوي" : "دخول"}</td>
        <td className="p-3">{event ? <Badge variant={event.deviceDecision === "ALLOWED" ? "success" : event.deviceDecision === "DENIED" ? "danger" : "outline"}>
          {event.deviceDecision === "ALLOWED" ? "فتح" : event.deviceDecision === "DENIED" ? accessDeviceReason(event) : "غير محدد"}
        </Badge> : "—"}</td>
        <td className="p-3">{attempt ? <Badge variant={attempt.decision === "ACCEPTED" ? "success" : "danger"}>
          {attempt.decision === "ACCEPTED" ? "مسموح" : `مرفوض — ${attendanceRejectionReason(attempt.rejectionReason ?? "UNKNOWN")}`}
        </Badge> : event ? <Badge variant={accessSeverity(event)}>{accessSystemReason(event)}</Badge> : "—"}</td>
      </tr>
    })}</tbody>
  </table></div>
}
