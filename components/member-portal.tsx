"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Activity, ArrowLeft, Building2, Compass, CreditCard, Loader2, MapPin, MessageCircleMore, ReceiptText, Sparkles, Utensils } from "lucide-react"
import { MemberFeedbackCenter } from "@/components/feedback-ticket-center"
import { MemberDailyMenu } from "@/components/member-daily-menu"
import { MemberMarketplace } from "@/components/member-marketplace"
import { MemberSelfOverview } from "@/components/member-self-overview"
import { Card, CardContent } from "@/components/ui/card"
import { apiRequest } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"

export type PortalMember = {
  organizationId: string
  memberId: string
  registrationBranchId: string
  memberName: string
  memberNumber: string
  relationship?: string
  canManageMembership?: boolean
  canBook?: boolean
}

export type MemberPortalSection = "home" | "discover" | "meals" | "membership" | "orders" | "activity" | "feedback"
type Branch = { id: string; code?: string; name: string; address?: string }

export function MemberPortal({ member, section = "home" }: { member: PortalMember; section?: MemberPortalSection }) {
  const needsBranch = section === "discover" || section === "meals"
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState(member.registrationBranchId)
  const [loading, setLoading] = useState(needsBranch)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!needsBranch) return
    let cancelled = false
    const frame = requestAnimationFrame(() => {
      apiRequest<Branch[]>(`/self/organizations/${member.organizationId}/branches`)
        .then(response => {
          if (cancelled) return
          const values = Array.isArray(response.data) ? response.data : []
          setBranches(values)
          const stored = localStorage.getItem(`go-member-branch-${member.organizationId}`) ?? ""
          const preferred = [stored, member.registrationBranchId].find(id => values.some(branch => branch.id === id))
          setBranchId(preferred ?? values[0]?.id ?? member.registrationBranchId)
        })
        .catch(reason => { if (!cancelled) setError(humanError(reason, "تعذر تحميل فروع النادي المتاحة.")) })
        .finally(() => { if (!cancelled) setLoading(false) })
    })
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [member.organizationId, member.registrationBranchId, needsBranch])

  function chooseBranch(value: string) {
    setBranchId(value)
    localStorage.setItem(`go-member-branch-${member.organizationId}`, value)
  }

  if (section === "home") return <MemberHome member={member} />
  if (section === "membership") return <MemberSelfOverview member={member} tabs={["subscriptions"]} showMemberHeader={false} />
  if (section === "orders") return <MemberSelfOverview member={member} tabs={["orders", "invoices", "restaurant-orders"]} initialTab="orders" showMemberHeader={false} />
  if (section === "activity") return <MemberSelfOverview member={member} tabs={["reservations", "attendance", "training-plans"]} initialTab="reservations" showMemberHeader={false} />
  if (section === "feedback") return <MemberFeedbackCenter member={member} />

  const branch = branches.find(value => value.id === branchId)
  return <section>
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-l from-primary/[.08] to-transparent">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary"><Building2 /></span>
        <div className="min-w-0"><h2 className="font-black">فرع تنفيذ الطلب</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">نعرض لك الأسعار والمواعيد والوجبات المتاحة فعليًا في الفرع الذي تختاره.</p></div>
        {loading ? <Loader2 className="mr-auto animate-spin text-primary" /> : <label className="relative mr-auto w-full sm:max-w-xs"><MapPin className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-primary" /><select value={branchId} onChange={event => chooseBranch(event.target.value)} className="h-12 w-full appearance-none rounded-xl border bg-background px-10 text-sm font-bold outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" aria-label="فرع تنفيذ الطلب">{branches.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>}
      </CardContent>
    </Card>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-600">{error}</p>}
    {branchId && section === "discover" && <MemberMarketplace member={member} branchId={branchId} branchName={branch?.name} />}
    {branchId && section === "meals" && member.canBook && <MemberDailyMenu organizationId={member.organizationId} memberId={member.memberId} branchId={branchId} branchName={branch?.name} />}
    {section === "meals" && !member.canBook && <Unavailable message="لا يملك هذا الحساب صلاحية طلب وجبات لهذا العضو." />}
  </section>
}

function MemberHome({ member }: { member: PortalMember }) {
  const cards = [
    ...(member.canManageMembership ? [{ href: "/self-service/discover", title: "اكتشف واحجز", description: "استعرض الباقات والخدمات والأسعار المتاحة في فرعك.", icon: Compass, color: "text-blue-600 bg-blue-500/10" }] : []),
    ...(member.canBook ? [{ href: "/self-service/meals", title: "وجبات اليوم", description: "اختر وجبتك بعد مراجعة السعر والقيم الغذائية.", icon: Utensils, color: "text-orange-600 bg-orange-500/10" }] : []),
    { href: "/self-service/membership", title: "عضويتي", description: "تابع اشتراكك ومدته وحالته وإجراءات التجميد أو الإلغاء.", icon: CreditCard, color: "text-emerald-600 bg-emerald-500/10" },
    { href: "/self-service/orders", title: "طلباتي وفواتيري", description: "راجع الطلبات والفواتير والمبالغ التي تنتظر السداد.", icon: ReceiptText, color: "text-violet-600 bg-violet-500/10" },
    { href: "/self-service/activity", title: "حجوزاتي ونشاطي", description: "مواعيدك وحضورك وخططك التدريبية في مكان واحد.", icon: Activity, color: "text-cyan-600 bg-cyan-500/10" },
    { href: "/self-service/feedback", title: "الشكاوى والاقتراحات", description: "افتح تذكرة وتابع المحادثة مع فريق النادي حتى اكتمال الحل.", icon: MessageCircleMore, color: "text-amber-700 bg-amber-500/10" },
  ]
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(card => <Link key={card.href} href={card.href} className="group rounded-3xl border bg-card p-5 transition hover:-translate-y-1 hover:border-primary/35 hover:shadow-xl"><div className="flex items-start gap-4"><span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${card.color}`}><card.icon /></span><div className="min-w-0"><h2 className="font-black">{card.title}</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">{card.description}</p></div><ArrowLeft className="mr-auto mt-3 size-4 text-muted-foreground transition group-hover:-translate-x-1 group-hover:text-primary" /></div></Link>)}</div>
}

function Unavailable({ message }: { message: string }) { return <Card className="mt-5"><CardContent className="p-10 text-center"><Sparkles className="mx-auto size-9 text-muted-foreground/50" /><p className="mt-3 text-sm font-bold">{message}</p></CardContent></Card> }
