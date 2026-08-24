"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  Activity, Barcode, Bell, Building2, CalendarDays, ChevronDown, CircleDollarSign, ClipboardList, Compass, CreditCard, FileText,
  Dumbbell, History, LayoutDashboard, LogOut, Menu, MessageSquareText, Moon, ReceiptText, Settings,
  Sun, Users, UserCircle2, UserRoundCheck, Utensils, WalletCards, X, Zap,
} from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"
import { useAppContext } from "@/components/app-context"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { apiRequest, clearSession } from "@/lib/api-client"
import { firstAllowedDestination, permissionsForRoute, systemSettingsPermissions } from "@/lib/permissions"
import type { AccountNotification } from "@/components/account-notification-inbox"
import { GlobalSearch } from "@/components/global-search"

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
    { href: "/finance", label: "المالية والعمولات", icon: WalletCards, permissions:["finance.invoices.read","sales.read","finance.other-income.read","coaching.commissions.read"] },
    { href: "/finance/shifts", label: "سجل ورديات الصندوق", icon: History, permissions:["finance.cash-shifts.audit.read"] },
    { href: "/crm", label: "العملاء والمتابعات", icon: Zap, permissions:["crm.leads.read","crm.follow-ups.read","online-requests.read"] },
    { href: "/communications", label: "الرسائل والتواصل", icon: MessageSquareText, permissions:["notifications.read","notifications.send","notifications.whatsapp.read","notifications.whatsapp.manage"] },
    { href: "/operations", label: "مركز العمليات", icon: ClipboardList, permissions:["workforce.shifts.read","workforce.attendance.record","online-requests.read","lockers.read"] },
    { href: "/feedback", label: "الشكاوى والاقتراحات", icon: MessageSquareText, permissions:["feedback.read","feedback.reply"] },
    { href: "/restaurant", label: "المطعم", icon: Utensils, permissions:["restaurant.orders.read","restaurant.menu.read","restaurant.catalog.read","restaurant.meal-plans.redeem"] },
    { href: "/trainer", label: "التدريب والمدربون", icon: Dumbbell, permissions:["coaching.read","coaching.training-plans.read","measurements.read","coaching.assignments.manage"] },
    { href: "/staff", label: "الموظفون", icon: UserRoundCheck, permissions:["workforce.read"] },
  ]},
  { label: "الإدارة", items: [
    { href: "/reports", label: "التقارير", icon: ClipboardList, permissions:["reporting.read"] },
    { href: "/audit", label: "سجل نشاط النظام", icon: History, permissions:["iam.audit.read"] },
    { href: "/system-settings/branches", label: "إعداد النظام", icon: Settings, permissions:[...systemSettingsPermissions] },
  ]},
  { label: "مساحتي", items: [
    { href: "/notifications", label: "الإشعارات", icon: Bell, permissions:[] },
    { href: "/self-service", label: "الرئيسية", icon: UserCircle2, permissions:[] },
    { href: "/self-service/discover", label: "اكتشف واحجز", icon: Compass, permissions:[], memberOnly:true, memberCapability:"INTERACT" },
    { href: "/self-service/meals", label: "وجبات اليوم", icon: Utensils, permissions:[], memberOnly:true, memberCapability:"BOOK" },
    { href: "/self-service/membership", label: "عضويتي", icon: CreditCard, permissions:[], memberOnly:true },
    { href: "/self-service/orders", label: "طلباتي وفواتيري", icon: ReceiptText, permissions:[], memberOnly:true },
    { href: "/self-service/activity", label: "حجوزاتي ونشاطي", icon: Activity, permissions:[], memberOnly:true },
    { href: "/self-service/feedback", label: "الشكاوى والاقتراحات", icon: MessageSquareText, permissions:[], memberOnly:true },
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
  const [notificationItems,setNotificationItems]=useState<AccountNotification[]>([])
  const [unreadNotifications,setUnreadNotifications]=useState(0)
  const hasMember = Boolean(context.self.members?.length)
  const memberOnlyAccount = hasMember && context.grants.length === 0
  const accountName = context.account?.displayName?.trim() || "الحساب"
  const accountSubtitle = context.canAccess(["iam.roles.manage"]) ? "مسؤول النظام" : context.grants.length ? "حساب موظف" : hasMember ? (context.self.members?.some(member => member.relationship === "SELF") ? "عضو النادي" : "ولي أمر") : "حساب شخصي"
  const currentBranch=context.branches.find(branch=>branch.id===context.branchId)
  const requiredPermissions=permissionsForRoute(pathname)
  const routeAllowed=requiredPermissions===undefined||context.canAccess(requiredPermissions)
  const fallbackDestination=firstAllowedDestination(context.canAccess)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDark(document.documentElement.classList.contains("dark")))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(()=>{if(!context.loading&&!routeAllowed)router.replace(fallbackDestination)},[context.loading,fallbackDestination,routeAllowed,router])

  useEffect(()=>{
    if(context.loading||!context.userAccountId)return
    let cancelled=false
    async function loadNotifications(){try{const[items,count]=await Promise.all([apiRequest<AccountNotification[]>("/me/account-notifications?limit=5"),apiRequest<{unreadCount:number}>("/me/account-notifications/unread-count")]);if(!cancelled){setNotificationItems(items.data??[]);setUnreadNotifications(count.data.unreadCount??0)}}catch{if(!cancelled){setNotificationItems([]);setUnreadNotifications(0)}}}
    void loadNotifications();const timer=window.setInterval(()=>void loadNotifications(),60_000)
    return()=>{cancelled=true;window.clearInterval(timer)}
  },[context.loading,context.userAccountId])

  async function markNotificationRead(item:AccountNotification){if(!item.readAt){try{const response=await apiRequest<AccountNotification>(`/me/account-notifications/${item.id}/read`,{method:"POST"});setNotificationItems(current=>current.map(value=>value.id===item.id?response.data:value));setUnreadNotifications(value=>Math.max(0,value-1))}catch{}}}

  async function markAllNotificationsRead(){try{await apiRequest("/me/account-notifications/read-all",{method:"POST"});setNotificationItems(current=>current.map(item=>({...item,readAt:item.readAt??new Date().toISOString()})));setUnreadNotifications(0)}catch{}}

  function toggleTheme() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("go-theme", next ? "dark" : "light")
  }

  if (context.loading||!routeAllowed) return <div dir="rtl" className="grid min-h-screen place-items-center bg-background"><div className="text-center"><span className="mx-auto block size-10 animate-spin rounded-full border-4 border-primary border-t-transparent"/><p className="mt-4 text-sm font-semibold text-muted-foreground">جارٍ تحميل مساحة العمل المناسبة…</p></div></div>

  return <div dir="rtl" className="min-h-screen max-w-[100vw] overflow-x-hidden bg-background">
    {open && <button className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} aria-label="إغلاق القائمة" />}
    <aside className={cn("fixed inset-y-0 right-0 z-50 w-[270px] flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex", open ? "flex" : "hidden")}>
      <div className="flex h-[76px] items-center justify-between border-b border-sidebar-border px-5">
        <BrandLogo />
        <Button variant="ghost" size="icon" className="text-sidebar-foreground lg:hidden" onClick={() => setOpen(false)} aria-label="إغلاق القائمة"><X /></Button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {navGroups.map(group => {const items=group.items.filter(item=>context.canAccess(item.permissions)&&(!("memberOnly" in item)||!item.memberOnly||hasMember)&&(!("memberCapability" in item)||(item.memberCapability==="BOOK"?Boolean(context.self.members?.some(member=>member.canBook)):Boolean(context.self.members?.some(member=>member.canBook||member.canManageMembership)))));return items.length?<div key={group.label} className="mb-5">
          <p className="mb-2 px-3 text-[10px] font-bold tracking-wider text-sidebar-foreground/42">{group.label==="مساحتي"&&hasMember?"بوابة العضو":group.label}</p>
          <div className="space-y-1">
            {items.map(item => {
              const active = pathname === item.href || (item.href !== "/self-service" && pathname.startsWith(`${item.href}/`))
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
        <GlobalSearch memberOnlyAccount={memberOnlyAccount} />
        <div className="mr-auto flex items-center gap-2">
          {context.branches.length>0&&<button className="hidden items-center gap-2 rounded-xl border bg-card px-3 py-2 text-right sm:flex" aria-label="تغيير الفرع" onClick={()=>router.push('/select-context')}>
            <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-amber-600"><Building2 className="size-4" /></span>
            <span><span className="block text-[9px] text-muted-foreground">الفرع الحالي</span><span className="block text-xs font-bold">{currentBranch?.nameAr??currentBranch?.name??(context.loading?"جارٍ تحميل الفروع…":"لم يُحدد فرع")}</span></span>
            <ChevronDown className="size-3 text-muted-foreground" />
          </button>}
          <Button variant="outline" size="icon" onClick={toggleTheme} aria-label={dark ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}>{dark ? <Sun /> : <Moon />}</Button>
          <div className="relative">
            <Button variant="outline" size="icon" onClick={() => setNotices(v => !v)} aria-label="الإشعارات"><Bell /></Button>
            {unreadNotifications>0&&<span className="pointer-events-none absolute -left-1 -top-1 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-5 text-white">{unreadNotifications>99?"99+":unreadNotifications}</span>}
            {notices && <div className="absolute left-0 top-12 w-80 rounded-2xl border bg-card p-2 shadow-2xl">
              <div className="flex items-center justify-between gap-2 p-3"><div><p className="font-bold">الإشعارات</p><p className="mt-1 text-[11px] text-muted-foreground">{unreadNotifications?`${unreadNotifications} غير مقروءة`:"لا توجد رسائل جديدة"}</p></div>{unreadNotifications>0&&<button type="button" className="text-xs font-bold text-primary" onClick={()=>void markAllNotificationsRead()}>قراءة الكل</button>}</div>
              <div className="max-h-80 space-y-1 overflow-y-auto">{notificationItems.length===0?<p className="rounded-xl bg-secondary/60 p-4 text-xs leading-6 text-muted-foreground">لا توجد إشعارات حاليًا. ستظهر رسائل النادي هنا فور إرسالها.</p>:notificationItems.map(item=><button type="button" key={item.id} onClick={()=>void markNotificationRead(item)} className={cn("block w-full rounded-xl p-3 text-right transition hover:bg-secondary",!item.readAt&&"bg-primary/8")}><span className="flex items-center gap-2 text-xs font-black">{!item.readAt&&<span className="size-2 rounded-full bg-primary"/>}{item.title}</span><span className="mt-1 block line-clamp-2 text-[11px] leading-5 text-muted-foreground">{item.body}</span></button>)}</div>
              <Link href="/notifications" onClick={()=>setNotices(false)} className="mt-2 block rounded-xl border p-2.5 text-center text-xs font-bold transition hover:border-primary hover:text-primary">عرض كل الإشعارات</Link>
            </div>}
          </div>
        </div>
      </header>
      <main className="mx-auto min-w-0 max-w-[1600px] p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  </div>
}
