"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  Barcode, Bell, Building2, CalendarDays, ChevronDown, CircleDollarSign, ClipboardList, CreditCard, FileText,
  Dumbbell, LayoutDashboard, LogOut, Menu, Moon, Search, Settings,
  Sun, Users, UserCircle2, UserRoundCheck, Utensils, WalletCards, X, Zap,
} from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"
import { useAppContext } from "@/components/app-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { clearSession } from "@/lib/api-client"

const navGroups = [
  { label: "نظرة عامة", items: [{ href: "/", label: "لوحة التحكم", icon: LayoutDashboard, permissions:["reporting.read"] }] },
  { label: "إدارة النادي", items: [
    { href: "/members", label: "الأعضاء", icon: Users, permissions:["members.read"] },
    { href: "/subscriptions", label: "الاشتراكات", icon: CreditCard, permissions:["subscriptions.read"] },
    { href: "/attendance", label: "الحضور والدخول", icon: UserRoundCheck, permissions:["attendance.read","attendance.check-in"] },
    { href: "/bookings", label: "الحجوزات", icon: CalendarDays, permissions:["bookings.read"] },
    { href: "/barcodes", label: "الباركود والطباعة", icon: Barcode, permissions:["access-credentials.read","access-credentials.manage"] },
    { href: "/files", label: "الملفات", icon: FileText, permissions:["files.read","files.manage"] },
  ]},
  { label: "الأعمال", items: [
    { href: "/cashier", label: "نقطة البيع", icon: CircleDollarSign, permissions:["sales.checkout","finance.payments.record","finance.cash-shifts.manage"] },
    { href: "/finance", label: "المبيعات والمالية", icon: WalletCards, permissions:["finance.invoices.read","sales.read"] },
    { href: "/crm", label: "العملاء المحتملون", icon: Zap, permissions:["crm.leads.read"] },
    { href: "/restaurant", label: "المطعم", icon: Utensils, permissions:["restaurant.orders.read"] },
    { href: "/staff", label: "الموظفون والمدربون", icon: Dumbbell, permissions:["workforce.read","coaching.read"] },
  ]},
  { label: "الإدارة", items: [
    { href: "/reports", label: "التقارير", icon: ClipboardList, permissions:["reporting.read"] },
    { href: "/master-data", label: "البيانات الرئيسية", icon: Settings, permissions:["organization.read","catalog.read","commercial.read","iam.roles.read","workforce.read","bookings.read","restaurant.catalog.read"] },
  ]},
  { label: "مساحتي", items: [
    { href: "/self-service", label: "الخدمة الذاتية", icon: UserCircle2, permissions:[] },
    { href: "/account", label: "إعدادات الحساب", icon: Settings, permissions:[] },
  ]},
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router=useRouter()
  const context=useAppContext()
  const [open, setOpen] = useState(false)
  const [dark, setDark] = useState(false)
  const [notices, setNotices] = useState(false)
  const [globalSearch, setGlobalSearch] = useState("")
  const accountName = context.account?.displayName?.trim() || "الحساب"
  const accountSubtitle = context.canAccess(["iam.roles.manage"]) ? "مسؤول النظام" : "حساب موظف"
  const currentBranch=context.branches.find(branch=>branch.id===context.branchId)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDark(document.documentElement.classList.contains("dark")))
    return () => cancelAnimationFrame(frame)
  }, [])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("go-theme", next ? "dark" : "light")
  }

  function submitSearch(event:React.FormEvent){event.preventDefault();const value=globalSearch.trim().toLowerCase();if(!value)return;const destinations=[{terms:["عضو","أعضاء","member"],href:"/members"},{terms:["اشتراك","باقة","subscription"],href:"/subscriptions"},{terms:["حضور","دخول","attendance"],href:"/attendance"},{terms:["حجز","موعد","booking"],href:"/bookings"},{terms:["فاتورة","دفعة","مالية","invoice"],href:"/finance"},{terms:["عميل","متابعة"],href:"/crm"},{terms:["مطعم","وجبة"],href:"/restaurant"},{terms:["موظف","مدرب"],href:"/staff"},{terms:["تقرير"],href:"/reports"}];router.push(destinations.find(item=>item.terms.some(term=>value.includes(term)))?.href??"/members")}

  if (context.loading) return <div dir="rtl" className="grid min-h-screen place-items-center bg-background"><div className="text-center"><span className="mx-auto block size-10 animate-spin rounded-full border-4 border-primary border-t-transparent"/><p className="mt-4 text-sm font-semibold text-muted-foreground">جارٍ تحميل مساحة العمل الآمنة…</p></div></div>

  return <div dir="rtl" className="min-h-screen max-w-[100vw] overflow-x-hidden bg-background">
    {open && <button className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} aria-label="إغلاق القائمة" />}
    <aside className={cn("fixed inset-y-0 right-0 z-50 w-[270px] flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex", open ? "flex" : "hidden")}>
      <div className="flex h-[76px] items-center justify-between border-b border-sidebar-border px-5">
        <BrandLogo />
        <Button variant="ghost" size="icon" className="text-sidebar-foreground lg:hidden" onClick={() => setOpen(false)} aria-label="إغلاق القائمة"><X /></Button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {navGroups.map(group => {const items=group.items.filter(item=>context.canAccess(item.permissions));return items.length?<div key={group.label} className="mb-5">
          <p className="mb-2 px-3 text-[10px] font-bold tracking-wider text-sidebar-foreground/42">{group.label}</p>
          <div className="space-y-1">
            {items.map(item => {
              const active = pathname === item.href
              const Icon = item.icon
              return <Link key={item.href} href={item.href} onClick={()=>setOpen(false)} className={cn("group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-sidebar-foreground/68 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", active && "bg-sidebar-accent text-white")}>
                {active && <span className="absolute -right-3 h-5 w-1 rounded-l-full bg-primary" />}
                <Icon className={cn("size-[18px]", active ? "text-primary" : "text-sidebar-foreground/48 group-hover:text-primary")} />
                <span>{item.label}</span>
              </Link>
            })}
          </div>
        </div>:null})}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/60 p-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary font-extrabold text-black">{accountName.slice(0, 1)}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{accountName}</p><p className="mt-1 truncate text-[10px] text-sidebar-foreground/45">{accountSubtitle}</p></div>
          <button onClick={async()=>{await clearSession();router.push('/login')}} aria-label="تسجيل الخروج" className="text-sidebar-foreground/45 transition hover:text-primary"><LogOut className="size-4" /></button>
        </div>
      </div>
    </aside>

    <div className="min-h-screen min-w-0 w-full overflow-hidden lg:pr-[270px]">
      <header className="glass sticky top-0 z-30 flex h-[76px] items-center gap-3 border-b px-4 lg:px-7">
        <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="فتح القائمة"><Menu /></Button>
        <form onSubmit={submitSearch} className="relative hidden w-full max-w-sm md:block">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={globalSearch} onChange={event=>setGlobalSearch(event.target.value)} className="border-transparent bg-secondary/70 pr-10" placeholder="ابحث عن عضو، فاتورة، حجز..." aria-label="البحث العام" />
        </form>
        <div className="mr-auto flex items-center gap-2">
          <button className="hidden items-center gap-2 rounded-xl border bg-card px-3 py-2 text-right sm:flex" aria-label="تغيير الفرع" onClick={()=>router.push('/select-context')}>
            <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-amber-600"><Building2 className="size-4" /></span>
            <span><span className="block text-[9px] text-muted-foreground">الفرع الحالي</span><span className="block text-xs font-bold">{currentBranch?.nameAr??currentBranch?.name??(context.loading?"جارٍ تحميل الفروع…":"لم يُحدد فرع")}</span></span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </button>
          <Button variant="outline" size="icon" onClick={toggleTheme} aria-label={dark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}>{dark ? <Sun /> : <Moon />}</Button>
          <div className="relative">
            <Button variant="outline" size="icon" onClick={() => setNotices(v => !v)} aria-label="الإشعارات" className="relative"><Bell /><span className="absolute left-1.5 top-1.5 size-2 rounded-full border-2 border-card bg-primary" /></Button>
            {notices && <div className="absolute left-0 top-12 w-80 rounded-2xl border bg-card p-2 shadow-2xl">
              <div className="flex items-center justify-between p-3"><p className="font-bold">الإشعارات</p><span className="text-[10px] text-muted-foreground">3 جديدة</span></div>
              {["اشتراك سارة ينتهي خلال 3 أيام", "طلب استرداد جديد يحتاج المراجعة", "تم إغلاق وردية الكاشير بنجاح"].map((n,i)=><div key={n} className="flex gap-3 rounded-xl p-3 hover:bg-secondary"><span className={cn("mt-1 size-2 shrink-0 rounded-full", i<2?"bg-primary":"bg-muted-foreground/30")} /><div><p className="text-xs font-semibold">{n}</p><p className="mt-1 text-[10px] text-muted-foreground">منذ {i+1} ساعة</p></div></div>)}
            </div>}
          </div>
        </div>
      </header>
      <main className="mx-auto min-w-0 max-w-[1600px] p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  </div>
}
