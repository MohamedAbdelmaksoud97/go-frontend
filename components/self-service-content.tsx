"use client"

import Link from "next/link"
import { useState } from "react"
import { Activity, Compass, CreditCard, Dumbbell, MessageCircleMore, ReceiptText, Sparkles, UserRound, Utensils } from "lucide-react"
import { useAppContext, type SelfMemberLink } from "@/components/app-context"
import { EmployeeSelfPanel } from "@/components/employee-self-panel"
import { MemberPortal, type MemberPortalSection } from "@/components/member-portal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const sectionMeta: Record<MemberPortalSection, { eyebrow: string; title: string; description: string; icon: typeof UserRound }> = {
  home: { eyebrow: "بوابة العضو", title: "أهلًا بك", description: "كل ما تحتاجه لإدارة عضويتك وحجوزاتك وطلباتك بسهولة، من مكان واحد.", icon: Sparkles },
  discover: { eyebrow: "اكتشف واحجز", title: "اختر التجربة المناسبة لك", description: "استعرض الباقات والخدمات والمواعيد المتاحة فعليًا، وراجع السعر النهائي قبل تأكيد الطلب.", icon: Compass },
  meals: { eyebrow: "مطعم النادي", title: "وجبات اليوم", description: "وجبات الفرع المنشورة اليوم، موضحة بالسعر والقيم الغذائية قبل إنشاء الطلب.", icon: Utensils },
  membership: { eyebrow: "عضويتي", title: "تفاصيل اشتراكك", description: "تابع الباقة الحالية والمدة والزيارات المتاحة وحالة الاشتراك بكل وضوح.", icon: CreditCard },
  orders: { eyebrow: "المعاملات", title: "طلباتك وفواتيرك", description: "راقب حالة كل طلب، رقم فاتورته والمبلغ المتبقي حتى اكتمال السداد والتنفيذ.", icon: ReceiptText },
  activity: { eyebrow: "نشاطي", title: "حجوزاتك وحضورك", description: "تابع مواعيدك السابقة والقادمة، سجل حضورك وخططك التدريبية.", icon: Activity },
  feedback: { eyebrow: "نحن نسمعك", title: "الشكاوى والاقتراحات", description: "تواصل مع فريق النادي في محادثة موثقة، وتابع كل رد حتى اكتمال الحل.", icon: MessageCircleMore },
}

export function SelfServiceContent({ section }: { section: MemberPortalSection }) {
  const context = useAppContext()
  const members = context.self.members ?? []
  const employees = context.self.employees ?? []
  const [memberId, setMemberId] = useState("")
  const member = members.find(value => value.memberId === memberId) ?? members[0]
  const meta = sectionMeta[section]
  const displayName = member?.memberName || employees[0]?.name || context.account?.displayName?.trim() || "ضيف GO"

  return <div className="fade-up">
    <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-bl from-primary/[.16] via-card to-card p-6 sm:p-8">
      <div className="pointer-events-none absolute -left-12 -top-16 size-52 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1"><Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary"><meta.icon />{meta.eyebrow}</Badge><h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">{section === "home" ? `${meta.title}، ${displayName}` : meta.title}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{meta.description}</p>{member && <p className="mt-3 text-xs font-bold text-foreground/70">رقم العضوية: <span dir="ltr">{member.memberNumber}</span></p>}</div>
        {members.length > 1 && <MemberPicker members={members} value={member?.memberId ?? ""} onChange={setMemberId} />}
      </div>
    </section>

    {context.error && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-600">تعذر تحميل بعض بيانات الحساب. حاول تحديث الصفحة.</p>}
    {member && <div className="mt-5"><MemberPortal member={member} section={section} /></div>}
    {!member && section !== "home" && <EmptyMember />}

    {section === "home" && <>
      {employees.map(employee => <EmployeeSelfPanel key={employee.employeeId} employee={employee} branchId={context.branchId} />)}
      {(employees.some(employee => employee.trainerProfileId) || context.canAccess(["coaching.read"])) && <Card className="mt-5"><CardContent className="flex flex-wrap items-center gap-4 p-5"><span className="grid size-11 place-items-center rounded-xl bg-violet-500/10 text-violet-600"><Dumbbell /></span><div><h2 className="font-black">مساحة المدرب</h2><p className="mt-1 text-xs text-muted-foreground">المتدربون والجدول وخطط التدريب والقياسات والعمولات.</p></div><Link href="/trainer" className="mr-auto"><Button>فتح مساحة المدرب</Button></Link></CardContent></Card>}
      {!members.length && !employees.length && !context.error && <EmptyMember />}
    </>}
  </div>
}

function MemberPicker({ members, value, onChange }: { members: SelfMemberLink[]; value: string; onChange: (value: string) => void }) {
  return <label className="w-full sm:max-w-xs"><span className="mb-2 block text-xs font-bold text-muted-foreground">إدارة حساب</span><select value={value} onChange={event => onChange(event.target.value)} className="h-12 w-full rounded-xl border bg-background px-4 text-sm font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">{members.map(member => <option key={member.memberId} value={member.memberId}>{member.memberName} — {member.memberNumber}</option>)}</select></label>
}

function EmptyMember() { return <Card className="mt-5"><CardContent className="p-12 text-center"><UserRound className="mx-auto size-10 text-muted-foreground/40" /><h2 className="mt-4 font-black">لا توجد عضوية مرتبطة بهذا الحساب</h2><p className="mt-2 text-sm text-muted-foreground">راجع استقبال النادي لربط الحساب بسجل العضوية الصحيح.</p></CardContent></Card> }
