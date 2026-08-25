"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowRight, CalendarDays, Camera, CircleX, CreditCard, FileBadge, FileText,
  Loader2, Mail, MapPin, Package, Phone, RefreshCw, ShoppingBag, UserRound,
  UtensilsCrossed, Printer, ShieldAlert, Snowflake, UploadCloud,
} from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import { humanError } from "@/lib/human-errors"
import { cn } from "@/lib/utils"
import { ownerFileValidationError, uploadOwnerFile, type OwnerFileKind } from "@/lib/owner-file-upload"
import { useToast } from "@/components/toast-provider"

type Row = Record<string, unknown>
type Branch = { id: string; nameAr?: string; name?: string }
type SectionKey = "profile" | "subscriptions" | "freezes" | "renewals" | "cancellations" | "blocks" | "bookings" | "finance" | "purchases" | "restaurant" | "files"
type ProfileData = {
  member?: Row
  subscriptions: Row[]
  bookings: Row[]
  invoices: Row[]
  payments: Row[]
  orders: Row[]
  restaurantOrders: Row[]
  activities: Row[]
  services: Row[]
  files: Row[]
  blockHistory: Row[]
  fileUrls: Record<string, string>
  errors: Partial<Record<SectionKey, string>>
}

const emptyData: ProfileData = { subscriptions: [], bookings: [], invoices: [], payments: [], orders: [], restaurantOrders: [], activities: [], services: [], files: [], blockHistory: [], fileUrls: {}, errors: {} }

export function MemberProfilePage({ memberId }: { memberId: string }) {
  const context = useAppContext()
  const toast = useToast()
  const [data, setData] = useState<ProfileData>(emptyData)
  const [loading, setLoading] = useState(hasRuntimeApi())
  const [fatalError, setFatalError] = useState("")
  const [active, setActive] = useState<SectionKey>("profile")
  const [reloadKey, setReloadKey] = useState(0)
  const [uploadingFile, setUploadingFile] = useState<OwnerFileKind>()
  const [loadedAt] = useState(() => Date.now())

  const permissions = useMemo(() => ({
    subscriptions: context.canAccess(["subscriptions.read"]),
    bookings: context.canAccess(["bookings.read"]),
    finance: context.canAccess(["finance.invoices.read"]),
    purchases: context.canAccess(["sales.read"]),
    restaurant: context.canAccess(["restaurant.orders.read"]),
    files: context.canAccess(["files.read"]),
    catalog: context.canAccess(["catalog.read"]),
    blocks: context.canAccess(["members.read"]),
  }), [context])
  const canUploadFiles = context.canAccess(["files.manage"]) && context.canAccess(["members.manage"])
  const activeOrganizationId = context.organizationId
  const activeBranchId = context.branchId
  const contextLoading = context.loading

  async function uploadMemberFile(kind: OwnerFileKind, file: File) {
    const label = kind === "IDENTITY" ? "صورة الهوية" : "صورة العضو"
    const validationError = await ownerFileValidationError(file, kind, label)
    if (validationError) { toast.error(validationError); return }
    setUploadingFile(kind)
    try {
      await uploadOwnerFile(context.organizationId, memberId, { module: "members", type: "MEMBER" }, kind, file)
      toast.success(`تم رفع ${label} وربطها بملف العضو. ستظهر المعاينة بعد اكتمال فحص الملف.`)
      setReloadKey(value => value + 1)
    } catch (reason) {
      toast.error(humanError(reason, `تعذر رفع ${label} وربطها بملف العضو.`))
    } finally {
      setUploadingFile(undefined)
    }
  }

  useEffect(() => {
    if (contextLoading || !activeOrganizationId || !activeBranchId || !memberId || !hasRuntimeApi()) return
    let cancelled = false
    const organizationId = activeOrganizationId
    const branchId = activeBranchId
    const branchList = [{ id: branchId }]

    async function acrossBranches(path: (branchId: string) => string) {
      const settled = await Promise.allSettled(branchList.map(branch => apiRequest<Row[] | { items: Row[] }>(path(branch.id))))
      const successful = settled.filter((item): item is PromiseFulfilledResult<{ data: Row[] | { items: Row[] } }> => item.status === "fulfilled")
      if (!successful.length && settled.length) throw (settled[0] as PromiseRejectedResult).reason
      return unique(successful.flatMap(item => rows(item.value.data)))
    }

    async function optional(key: SectionKey, operation: () => Promise<Row[]>) {
      try { return { key, rows: await operation() } }
      catch (error) { return { key, rows: [] as Row[], error: humanError(error, "تعذر تحميل هذا الجزء من ملف العضو.") } }
    }

    async function load() {
      setLoading(true); setFatalError("")
      try {
        const memberResponse = await apiRequest<Row>(`/organizations/${organizationId}/members/${memberId}`)
        const jobs: Promise<{ key: SectionKey; rows: Row[]; error?: string }>[] = []
        if (permissions.subscriptions) jobs.push(optional("subscriptions", async () => rows((await apiRequest<Row[] | { items: Row[] }>(`/organizations/${organizationId}/subscriptions?branchId=${branchId}&memberId=${memberId}&limit=100`)).data)))
        if (permissions.blocks) jobs.push(optional("blocks", async () => rows((await apiRequest<Row[]>(`/organizations/${organizationId}/members/${memberId}/block-history`)).data)))
        if (permissions.bookings) jobs.push(optional("bookings", async () => rows((await apiRequest<Row[] | { items: Row[] }>(`/organizations/${organizationId}/reservations?branchId=${branchId}&memberId=${memberId}&limit=100`)).data)))
        if (permissions.finance) jobs.push(optional("finance", async () => {
          const [invoices, payments] = await Promise.all([
            acrossBranches(branchId => `/organizations/${organizationId}/invoices?branchId=${branchId}&memberId=${memberId}&limit=100`),
            acrossBranches(branchId => `/organizations/${organizationId}/payments?branchId=${branchId}&memberId=${memberId}&limit=100`),
          ])
          return [
            ...invoices.map(row => ({ ...row, profileRecordType: "INVOICE" })),
            ...payments.map(row => ({ ...row, profileRecordType: "PAYMENT" })),
          ]
        }))
        if (permissions.purchases) jobs.push(optional("purchases", () => acrossBranches(branchId => `/organizations/${organizationId}/orders?branchId=${branchId}&memberId=${memberId}&limit=100`)))
        if (permissions.restaurant) jobs.push(optional("restaurant", async () => rows((await apiRequest<Row[] | { items: Row[] }>(`/organizations/${organizationId}/restaurant-orders?branchId=${branchId}&memberId=${memberId}&limit=100`)).data)))
        if (permissions.files) jobs.push(optional("files", () => acrossBranches(branchId => `/organizations/${organizationId}/files?branchId=${branchId}&ownerType=MEMBER&ownerId=${memberId}&limit=100`)))
        const result = await Promise.all(jobs)
        const next: ProfileData = { ...emptyData, member: memberResponse.data, errors: {} }
        for (const item of result) {
          if (item.error) next.errors[item.key] = item.error
          if (item.key === "subscriptions") next.subscriptions = newest(item.rows, "termStart")
          if (item.key === "blocks") next.blockHistory = newest(item.rows, "occurredAt")
          if (item.key === "bookings") next.bookings = newest(item.rows, "startsAt")
          if (item.key === "finance") {
            next.invoices = newest(item.rows.filter(row => text(row.profileRecordType) === "INVOICE"), "issuedAt")
            next.payments = newest(item.rows.filter(row => text(row.profileRecordType) === "PAYMENT"), "receivedAt")
          }
          if (item.key === "purchases") next.orders = newest(item.rows, "createdAt")
          if (item.key === "restaurant") next.restaurantOrders = newest(item.rows, "createdAt")
          if (item.key === "files") next.files = newest(item.rows, "createdAt")
        }
        if (permissions.subscriptions && permissions.catalog) {
          try {
            const [activitiesResponse, servicesResponse] = await Promise.all([
              apiRequest<Row[] | { items: Row[] }>(`/organizations/${organizationId}/activities?limit=500`),
              apiRequest<Row[] | { items: Row[] }>(`/organizations/${organizationId}/services?branchId=${branchId}&limit=500`),
            ])
            next.activities = rows(activitiesResponse.data)
            next.services = rows(servicesResponse.data)
          } catch {
            next.errors.subscriptions ||= "تعذر تحميل العقود المرتبطة بالاشتراكات حاليًا."
          }
        }
        const visibleFiles = next.files.filter(file => text(file.uploadStatus) === "UPLOADED" && text(file.scanStatus) === "CLEAN")
        const urlResults = await Promise.allSettled(visibleFiles.slice(0, 12).map(async file => {
          const response = await apiRequest<{ downloadUrl?: string }>(`/organizations/${organizationId}/files/${text(file.id)}/download-url`)
          return [text(file.id), response.data.downloadUrl ?? ""] as const
        }))
        next.fileUrls = Object.fromEntries(urlResults.filter((item): item is PromiseFulfilledResult<readonly [string, string]> => item.status === "fulfilled").map(item => item.value).filter(([, url]) => url))
        if (!cancelled) setData(next)
      } catch (error) {
        if (!cancelled) setFatalError(humanError(error, "تعذر فتح ملف العضو. تأكد أن السجل ما زال متاحًا لك."))
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [activeBranchId, activeOrganizationId, contextLoading, memberId, permissions.blocks, permissions.bookings, permissions.catalog, permissions.files, permissions.finance, permissions.purchases, permissions.restaurant, permissions.subscriptions, reloadKey])

  if (context.loading || loading) return <div className="grid min-h-[55vh] place-items-center"><div className="text-center"><Loader2 className="mx-auto size-9 animate-spin text-primary"/><p className="mt-3 text-sm text-muted-foreground">جارٍ تجهيز ملف العضو…</p></div></div>
  if (!context.canAccess(["members.read"])) return <Message title="لا تملك صلاحية عرض ملفات الأعضاء" detail="اطلب من مدير النظام منحك صلاحية عرض الأعضاء في هذا الفرع." />
  if (fatalError || !data.member) return <Message title="تعذر فتح ملف العضو" detail={fatalError || "لم يعد سجل العضو متاحًا."} retry={() => setReloadKey(value => value + 1)} />

  const member = data.member
  const contacts = Array.isArray(member.contacts) ? member.contacts.filter(isRow) : []
  const photo = data.files.find(file => text(file.purpose) === "PROFILE_PHOTO" && data.fileUrls[text(file.id)])
  const identity = data.files.find(file => text(file.purpose) === "IDENTITY_DOCUMENT")
  const photoUrl = photo ? data.fileUrls[text(photo.id)] : ""
  const activeSubscriptions = data.subscriptions.filter(row => text(row.status) === "ACTIVE").length
  const upcomingBookings = data.bookings.filter(row => new Date(text(row.startsAt)).getTime() >= loadedAt && text(row.status) !== "CANCELLED").length
  const outstanding = data.invoices.reduce((total, row) => total + minor(row.outstandingMinor, Math.max(0, minor(row.grossMinor) - minor(row.paidMinor))), 0)
  const branchName = branchLabel(text(member.registrationBranchId), context.branches)
  const tabs = [
    { key: "profile" as const, label: "الملف الشخصي", icon: UserRound, show: true },
    { key: "subscriptions" as const, label: "الاشتراكات والباقات", icon: CreditCard, show: permissions.subscriptions },
    { key: "freezes" as const, label: "سجل التجميدات", icon: Snowflake, show: permissions.subscriptions },
    { key: "renewals" as const, label: "سجل التجديدات", icon: RefreshCw, show: permissions.subscriptions },
    { key: "cancellations" as const, label: "سجل الإلغاء", icon: CircleX, show: permissions.subscriptions },
    { key: "blocks" as const, label: "سجل الحظر", icon: ShieldAlert, show: permissions.blocks },
    { key: "bookings" as const, label: "الحجوزات", icon: CalendarDays, show: permissions.bookings },
    { key: "finance" as const, label: "المالية والفواتير", icon: FileText, show: permissions.finance },
    { key: "purchases" as const, label: "المشتريات", icon: ShoppingBag, show: permissions.purchases },
    { key: "restaurant" as const, label: "طلبات المطبخ", icon: UtensilsCrossed, show: permissions.restaurant },
    { key: "files" as const, label: "المستندات", icon: FileBadge, show: permissions.files },
  ].filter(tab => tab.show)

  return <div className="mx-auto max-w-7xl space-y-6 fade-up">
    <Link href="/members" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground transition hover:text-primary"><ArrowRight className="size-4"/>العودة إلى قائمة الأعضاء</Link>
    <Card className="overflow-hidden border-primary/25">
      <div className="bg-gradient-to-l from-primary/15 via-primary/[.06] to-transparent p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={text(member.name, "عضو النادي")} url={photoUrl}/>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black sm:text-3xl">{text(member.name, "عضو النادي")}</h1><StatusBadge status={text(member.status, "ACTIVE")}/></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span dir="ltr">رقم العضوية: <strong>{text(member.memberNumber)}</strong></span>{Boolean(member.legacyMemberNumber) && <span dir="ltr">الرقم القديم: <strong>{text(member.legacyMemberNumber)}</strong></span>}<span className="inline-flex items-center gap-1"><MapPin className="size-3.5"/>{branchName}</span></div></div>
          <Button variant="outline" onClick={() => setReloadKey(value => value + 1)}><RefreshCw/>تحديث الملف</Button>
        </div>
      </div>
      <div className="grid gap-px border-t bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="اشتراكات نشطة" value={String(activeSubscriptions)} icon={Package}/>
        <Metric label="حجوزات قادمة" value={String(upcomingBookings)} icon={CalendarDays}/>
        <Metric label="رصيد مستحق" value={money(outstanding)} icon={CreditCard}/>
        <Metric label="إجمالي الطلبات" value={String(data.orders.length + data.restaurantOrders.length)} icon={ShoppingBag}/>
      </div>
    </Card>

    <nav className="flex gap-2 overflow-x-auto rounded-2xl border bg-card p-2" aria-label="أقسام ملف العضو">{tabs.map(tab => { const Icon = tab.icon; return <button key={tab.key} type="button" onClick={() => setActive(tab.key)} className={cn("inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition", active === tab.key ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}><Icon className="size-4"/>{tab.label}</button> })}</nav>

    {active === "profile" && <ProfileSection member={member} contacts={contacts} branchName={branchName} identity={identity} identityUrl={identity ? data.fileUrls[text(identity.id)] : ""} showSensitiveNotes={context.canAccess(["members.sensitive.read"])} />} 
    {active === "subscriptions" && <SubscriptionSection rows={data.subscriptions} branches={context.branches} activities={data.activities} services={data.services} error={data.errors.subscriptions}/>}
    {active === "freezes" && <FreezeHistorySection subscriptions={data.subscriptions} branches={context.branches} error={data.errors.subscriptions}/>}
    {active === "renewals" && <RenewalHistorySection subscriptions={data.subscriptions} branches={context.branches} error={data.errors.subscriptions}/>}
    {active === "cancellations" && <CancellationHistorySection subscriptions={data.subscriptions} branches={context.branches} error={data.errors.subscriptions}/>}
    {active === "blocks" && <BlockHistorySection rows={data.blockHistory} error={data.errors.blocks}/>}
    {active === "bookings" && <BookingSection rows={data.bookings} branches={context.branches} error={data.errors.bookings}/>} 
    {active === "finance" && <InvoiceSection rows={data.invoices} payments={data.payments} branches={context.branches} error={data.errors.finance}/>} 
    {active === "purchases" && <PurchaseSection rows={data.orders} branches={context.branches} error={data.errors.purchases}/>} 
    {active === "restaurant" && <RestaurantSection rows={data.restaurantOrders} branches={context.branches} error={data.errors.restaurant}/>} 
    {active === "files" && <div className="space-y-5">
      {canUploadFiles && <Card><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div><p className="text-sm font-black">إضافة ملفات إلى ملف العضو</p><p className="mt-1 text-xs leading-6 text-muted-foreground">تُربط الملفات بهذا العضو مباشرة، وتظهر هنا بعد الرفع والفحص الأمني.</p></div><div className="flex flex-wrap gap-2 sm:mr-auto">
        <label className={buttonVariants({ variant: "outline" })}><UploadCloud/>{uploadingFile === "IDENTITY" ? "جارٍ رفع الهوية..." : "رفع صورة الهوية"}<input className="sr-only" type="file" accept="image/jpeg,image/png,application/pdf" disabled={Boolean(uploadingFile)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadMemberFile("IDENTITY", file) }}/></label>
        <label className={buttonVariants({ variant: "outline" })}><Camera/>{uploadingFile === "PROFILE" ? "جارٍ رفع الصورة..." : "رفع صورة العضو"}<input className="sr-only" type="file" accept="image/jpeg,image/png" disabled={Boolean(uploadingFile)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadMemberFile("PROFILE", file) }}/></label>
      </div></CardContent></Card>}
      <FilesSection rows={data.files} urls={data.fileUrls} error={data.errors.files}/>
    </div>}
  </div>
}

function ProfileSection({ member, contacts, branchName, identity, identityUrl, showSensitiveNotes }: { member: Row; contacts: Row[]; branchName: string; identity?: Row; identityUrl?: string; showSensitiveNotes: boolean }) {
  const phone = contacts.find(row => text(row.type) === "PHONE")
  const email = contacts.find(row => text(row.type) === "EMAIL")
  return <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
    <Card><CardHeader><CardTitle>البيانات الشخصية</CardTitle><Badge variant="secondary">بيانات العضو المعتمدة</Badge></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Info label="الاسم" value={text(member.name)} icon={UserRound}/><Info label="رقم الجوال" value={text(phone?.value)} icon={Phone} ltr/><Info label="البريد الإلكتروني" value={text(email?.value)} icon={Mail} ltr/>
      <Info label="تاريخ الميلاد" value={date(member.birthDate)} icon={CalendarDays}/><Info label="الجنس" value={genderLabel(text(member.gender))} icon={UserRound}/><Info label="الجنسية" value={text(member.nationalityCode, "غير مسجلة")} icon={FileBadge}/>
      <Info label="رقم الهوية" value={text(member.nationalId, "غير مسجل")} icon={FileBadge} ltr/>
      <Info label="فرع التسجيل" value={branchName} icon={MapPin}/><Info label="تاريخ التسجيل" value={date(member.registeredOn)} icon={CalendarDays}/><Info label="حساب الدخول" value={accountLabel(text(member.accountStatus))} icon={UserRound}/>
      {showSensitiveNotes && Boolean(member.notes) && <div className="rounded-xl bg-secondary/55 p-4 sm:col-span-2 lg:col-span-3"><p className="text-[10px] font-bold text-muted-foreground">ملاحظات داخلية</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{text(member.notes)}</p></div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>صورة الهوية</CardTitle></CardHeader><CardContent>{!identity ? <Empty compact text="لم تُرفع صورة هوية لهذا العضو."/> : <DocumentPreview file={identity} url={identityUrl}/>}</CardContent></Card>
  </div>
}

function SubscriptionSection({ rows: items, branches, activities, services, error }: ListProps & { activities: Row[]; services: Row[] }) {
  return <SectionShell title="الاشتراكات والباقات" count={items.length} error={error}>{items.length ? <div className="grid gap-3 lg:grid-cols-2">{items.map(row => {
    const snapshot = isRow(row.commercialSnapshot) ? row.commercialSnapshot : {}
    const freezes = Array.isArray(row.freezePeriods) ? row.freezePeriods.filter(isRow) : []
    const contracts = subscriptionContracts(row, services, activities)
    return <article key={text(row.id)} className="rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="font-black">{text(snapshot.packageName, "باقة النادي")}</p><p className="mt-1 text-xs text-muted-foreground" dir="ltr">{text(row.subscriptionNumber)}</p></div><StatusBadge status={text(row.status)}/></div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-xs"><Small label="مدة الاشتراك" value={`${date(row.termStart)} — ${date(row.termEnd)}`}/><Small label="الفرع" value={branchLabel(text(row.sellingBranchId), branches)}/><Small label="القيمة" value={money(minor(snapshot.grossMinor))}/><Small label="الاستخدام" value={row.visitAllowance == null ? "حسب صلاحيات الباقة" : `${minor(row.visitsUsed)} من ${minor(row.visitAllowance)} زيارة`}/></div>
      {freezes.length > 0 && <div className="mt-5 border-t pt-4"><p className="mb-2 flex items-center gap-2 text-xs font-black"><Snowflake className="size-4 text-sky-500"/>سجل التجميدات</p><div className="space-y-2">{freezes.map((freeze, index) => <div key={text(freeze.id, String(index))} className="rounded-xl bg-sky-500/8 p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><strong>{date(freeze.startedAt)} — {date(freeze.plannedEndAt)}</strong><StatusBadge status={freeze.resumedAt ? "COMPLETED" : "FROZEN"}/></div>{Boolean(freeze.reason) && <p className="mt-1 text-muted-foreground">{text(freeze.reason)}</p>}</div>)}</div></div>}
      {contracts.length > 0 && <div className="mt-5 border-t pt-4"><p className="mb-2 text-xs font-black">العقود المرتبطة بالاشتراك</p><div className="space-y-2">{contracts.map(contract => <div key={text(contract.id)} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/55 p-3"><div><p className="text-xs font-bold">{text(contract.contractTitle, `عقد ${text(contract.name)}`)}</p><p className="mt-1 text-[10px] text-muted-foreground">{text(contract.name)}</p></div><Button type="button" size="sm" variant="outline" onClick={() => printContract(contract)}><Printer/>طباعة العقد</Button></div>)}</div></div>}
    </article>
  })}</div> : <Empty text="لا توجد اشتراكات مسجلة لهذا العضو."/>}</SectionShell>
}

function FreezeHistorySection({ subscriptions, branches, error }: { subscriptions: Row[]; branches: Branch[]; error?: string }) {
  const events = subscriptions.flatMap<Row>(subscription => {
    const snapshot = isRow(subscription.commercialSnapshot) ? subscription.commercialSnapshot : {}
    const periods = Array.isArray(subscription.freezePeriods) ? subscription.freezePeriods.filter(isRow) : []
    return periods.map(period => ({
      ...period,
      subscriptionNumber: subscription.subscriptionNumber,
      packageName: snapshot.packageName,
      sellingBranchId: subscription.sellingBranchId,
    }))
  })
  events.sort((a, b) => new Date(text(b.startedAt, "1970-01-01")).getTime() - new Date(text(a.startedAt, "1970-01-01")).getTime())

  return <SectionShell title="سجل التجميدات" count={events.length} error={error}>{events.length ? <div className="divide-y rounded-2xl border bg-card">{events.map((event, index) => <article key={text(event.id, String(index))} className="grid gap-4 p-5 md:grid-cols-[1fr_auto_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black">{text(event.packageName, "باقة العضو")}</p><StatusBadge status={event.resumedAt ? "COMPLETED" : "FROZEN"}/></div><p className="mt-2 text-xs text-muted-foreground">اشتراك <span dir="ltr">{text(event.subscriptionNumber)}</span> · {branchLabel(text(event.sellingBranchId), branches)}</p>{Boolean(event.reason) && <p className="mt-2 rounded-xl bg-secondary/55 p-3 text-xs">السبب: {text(event.reason)}</p>}</div><Small label="بداية التجميد" value={dateTime(event.startedAt)}/><div className="space-y-2"><Small label="النهاية المخططة" value={dateTime(event.plannedEndAt)}/><Small label="الاستئناف الفعلي" value={event.resumedAt ? dateTime(event.resumedAt) : "لم يُستأنف بعد"}/></div></article>)}</div> : <Empty text="لا توجد عمليات تجميد مسجلة لهذا العضو."/>}</SectionShell>
}

function RenewalHistorySection({ subscriptions, branches, error }: { subscriptions: Row[]; branches: Branch[]; error?: string }) {
  const byId = new Map(subscriptions.map(subscription => [text(subscription.id, ""), subscription]))
  const renewals = subscriptions
    .filter(subscription => Boolean(subscription.previousSubscriptionId))
    .sort((a, b) => new Date(text(b.termStart, "1970-01-01")).getTime() - new Date(text(a.termStart, "1970-01-01")).getTime())

  return <SectionShell title="سجل التجديدات" count={renewals.length} error={error}>{renewals.length ? <div className="divide-y rounded-2xl border bg-card">{renewals.map(subscription => {
    const previous = byId.get(text(subscription.previousSubscriptionId, ""))
    const snapshot = isRow(subscription.commercialSnapshot) ? subscription.commercialSnapshot : {}
    return <article key={text(subscription.id)} className="grid gap-4 p-5 md:grid-cols-[1fr_auto_auto] md:items-center">
      <div><div className="flex flex-wrap items-center gap-2"><p className="font-black">{text(snapshot.packageName, "تجديد باقة العضو")}</p><StatusBadge status={text(subscription.status)}/></div><p className="mt-2 text-xs text-muted-foreground">من اشتراك <span dir="ltr">{previous ? text(previous.subscriptionNumber) : text(subscription.previousSubscriptionId).slice(0, 8)}</span> إلى <span dir="ltr">{text(subscription.subscriptionNumber)}</span></p><p className="mt-1 text-[11px] text-muted-foreground">{branchLabel(text(subscription.sellingBranchId), branches)}</p></div>
      <Small label="بداية التجديد" value={dateTime(subscription.termStart)}/><Small label="نهاية المدة الجديدة" value={dateTime(subscription.termEnd)}/>
    </article>
  })}</div> : <Empty text="لا توجد عمليات تجديد مسجلة لهذا العضو."/>}</SectionShell>
}

function CancellationHistorySection({ subscriptions, branches, error }: { subscriptions: Row[]; branches: Branch[]; error?: string }) {
  const cancellations = subscriptions
    .filter(subscription => isRow(subscription.cancellationRequest) || Boolean(subscription.cancelledAt))
    .sort((a, b) => {
      const aRequest = isRow(a.cancellationRequest) ? a.cancellationRequest : {}
      const bRequest = isRow(b.cancellationRequest) ? b.cancellationRequest : {}
      return new Date(text(bRequest.requestedAt ?? b.cancelledAt, "1970-01-01")).getTime() - new Date(text(aRequest.requestedAt ?? a.cancelledAt, "1970-01-01")).getTime()
    })

  return <SectionShell title="سجل الإلغاء" count={cancellations.length} error={error}>{cancellations.length ? <div className="divide-y rounded-2xl border bg-card">{cancellations.map(subscription => {
    const request = isRow(subscription.cancellationRequest) ? subscription.cancellationRequest : {}
    const snapshot = isRow(subscription.commercialSnapshot) ? subscription.commercialSnapshot : {}
    const mode = text(request.mode, "END_OF_TERM")
    return <article key={text(subscription.id)} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto_auto] lg:items-center">
      <div><div className="flex flex-wrap items-center gap-2"><p className="font-black">{text(snapshot.packageName, "إلغاء اشتراك")}</p><StatusBadge status={text(subscription.status)}/></div><p className="mt-2 text-xs text-muted-foreground">اشتراك <span dir="ltr">{text(subscription.subscriptionNumber)}</span> · {branchLabel(text(subscription.sellingBranchId), branches)}</p>{Boolean(request.reason ?? subscription.cancellationReason) && <p className="mt-2 rounded-xl bg-secondary/55 p-3 text-xs">السبب: {text(request.reason ?? subscription.cancellationReason)}</p>}</div>
      <div className="space-y-2"><Small label="وقت الطلب" value={dateTime(request.requestedAt ?? subscription.cancelledAt)}/><Small label="الإلغاء الفعلي" value={subscription.cancelledAt ? dateTime(subscription.cancelledAt) : `مجدول في ${dateTime(request.effectiveAt)}`}/></div>
      <div className="space-y-2"><Small label="طريقة الإلغاء" value={mode === "IMMEDIATE_PRORATED" ? "فوري مع احتساب الاسترداد" : "في نهاية المدة"}/><Small label="الرسم / الاسترداد المؤهل" value={`${money(minor(request.feeMinor))} / ${money(minor(request.eligibleRefundMinor))}`}/></div>
    </article>
  })}</div> : <Empty text="لا توجد طلبات إلغاء مسجلة لهذا العضو."/>}</SectionShell>
}

function BlockHistorySection({ rows: items, error }: { rows: Row[]; error?: string }) {
  return <SectionShell title="سجل الحظر" count={items.length} error={error}>{items.length ? <div className="divide-y rounded-2xl border bg-card">{items.map((event, index) => {
    const blocked = text(event.eventType) === "BLOCKED"
    return <article key={text(event.id, String(index))} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black">{blocked ? "تم حظر العضو" : "تم رفع الحظر"}</p><Badge variant={blocked ? "danger" : "secondary"}>{blocked ? "حظر" : "رفع الحظر"}</Badge></div>{Boolean(event.reason) && <p className="mt-2 text-xs text-muted-foreground">السبب: {text(event.reason)}</p>}<p className="mt-2 text-[11px] text-muted-foreground">نفّذ الإجراء: {text(event.actorName, `حساب ${text(event.actorUserAccountId).slice(0, 8)}`)}</p></div><Small label="وقت الإجراء" value={dateTime(event.occurredAt)}/></article>
  })}</div> : <Empty text="لا توجد عمليات حظر أو رفع حظر مسجلة لهذا العضو."/>}</SectionShell>
}

function BookingSection({ rows: items, branches, error }: ListProps) { return <SectionShell title="الحجوزات" count={items.length} error={error}>{items.length ? <div className="divide-y rounded-2xl border bg-card">{items.map(row => <article key={text(row.id)} className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black">{text(row.resourceName, "حجز خدمة أو مرفق")}</p><StatusBadge status={text(row.status)}/></div><p className="mt-2 text-xs text-muted-foreground">{dateTime(row.startsAt)} حتى {dateTime(row.endsAt)} · {branchLabel(text(row.branchId), branches)} · {minor(row.seats, 1)} مقعد</p></div><strong>{money(minor(row.grossMinor))}</strong></article>)}</div> : <Empty text="لا توجد حجوزات مسجلة لهذا العضو."/>}</SectionShell> }

function InvoiceSection({ rows: items, payments, branches, error }: ListProps & { payments: Row[] }) {
  return <SectionShell title="الفواتير والتفاصيل المالية" count={items.length + payments.length} error={error}>
    <div className="space-y-5">
      <div>
        <h3 className="mb-3 text-sm font-black">الفواتير</h3>
        {items.length ? <div className="divide-y rounded-2xl border bg-card">{items.map(row => <article key={text(row.id)} className="grid gap-4 p-5 md:grid-cols-[1fr_repeat(3,auto)] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><Link href={`/finance/invoices/${text(row.id)}`} className="font-black text-primary hover:underline">فاتورة <span dir="ltr">{text(row.invoiceNumber)}</span></Link><StatusBadge status={text(row.status)}/></div><p className="mt-2 text-xs text-muted-foreground">{dateTime(row.issuedAt)} · {branchLabel(text(row.sellingBranchId), branches)}</p></div><Small label="الإجمالي" value={money(minor(row.grossMinor))}/><Small label="المدفوع" value={money(minor(row.paidMinor))}/><Small label="المتبقي" value={money(minor(row.outstandingMinor, Math.max(0, minor(row.grossMinor) - minor(row.paidMinor))))}/></article>)}</div> : <Empty compact text="لا توجد فواتير أو ذمم مالية لهذا العضو."/>}
      </div>
      <div>
        <h3 className="mb-3 text-sm font-black">سجل المدفوعات</h3>
        {payments.length ? <div className="divide-y rounded-2xl border bg-card">{payments.map(row => <article key={text(row.id)} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black">دفعة <span dir="ltr">#{text(row.id).slice(0, 8).toUpperCase()}</span></p><StatusBadge status={text(row.status)}/></div><p className="mt-2 text-xs text-muted-foreground">{dateTime(row.receivedAt)} · {branchLabel(text(row.collectionBranchId), branches)}</p></div><Small label="طريقة الدفع" value={paymentMethod(text(row.paymentMethodCode))}/><strong>{money(minor(row.amountMinor))}</strong></article>)}</div> : <Empty compact text="لا توجد مدفوعات مسجلة لهذا العضو."/>}
      </div>
    </div>
  </SectionShell>
}

function PurchaseSection({ rows: items, branches, error }: ListProps) { return <SectionShell title="مشتريات المتجر والخدمات" count={items.length} error={error}>{items.length ? <div className="grid gap-3 lg:grid-cols-2">{items.map(row => { const lines = Array.isArray(row.lineItems) ? row.lineItems.filter(isRow) : []; return <article key={text(row.id)} className="rounded-2xl border bg-card p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-black">طلب <span dir="ltr">{text(row.orderNumber)}</span></p><p className="mt-1 text-xs text-muted-foreground">{dateTime(row.createdAt)} · {branchLabel(text(row.sellingBranchId), branches)}</p></div><StatusBadge status={text(row.status)}/></div><div className="mt-4 space-y-2">{lines.length ? lines.map((line, index) => <div key={`${text(line.code)}-${index}`} className="flex justify-between gap-4 rounded-xl bg-secondary/45 p-3 text-xs"><span>{text(line.name, "صنف")}</span><strong>{minor(line.quantity, 1)} × {money(Math.round(minor(line.grossMinor) / Math.max(1, minor(line.quantity, 1))))}</strong></div>) : <p className="text-xs text-muted-foreground">تفاصيل الأصناف غير متاحة لهذا الطلب القديم.</p>}</div><p className="mt-4 border-t pt-3 text-left font-black">الإجمالي: {money(minor(row.grossMinor))}</p></article> })}</div> : <Empty text="لا توجد مشتريات أو طلبات بيع لهذا العضو."/>}</SectionShell> }

function RestaurantSection({ rows: items, branches, error }: ListProps) { return <SectionShell title="طلبات المطبخ" count={items.length} error={error}>{items.length ? <div className="grid gap-3 lg:grid-cols-2">{items.map(row => { const lines = Array.isArray(row.lines) ? row.lines.filter(isRow) : []; return <article key={text(row.id)} className="rounded-2xl border bg-card p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-black">طلب مطبخ <span dir="ltr">#{text(row.id).slice(0, 8).toUpperCase()}</span></p><p className="mt-1 text-xs text-muted-foreground">{dateTime(row.createdAt)} · {branchLabel(text(row.branchId), branches)}</p></div><StatusBadge status={text(row.status)}/></div><div className="mt-4 space-y-2">{lines.map((line, index) => { const quote = isRow(line.quote) ? line.quote : {}; return <div key={`${text(line.id)}-${index}`} className="flex justify-between rounded-xl bg-secondary/45 p-3 text-xs"><span>{text(quote.targetName, "وجبة")}</span><strong>الكمية: {minor(quote.quantity, 1)}</strong></div> })}{!lines.length && <p className="text-xs text-muted-foreground">تفاصيل الوجبات غير متاحة.</p>}</div><p className="mt-4 border-t pt-3 text-left font-black">{text(row.sourceType) === "MEAL_PLAN" ? "ضمن الخطة الغذائية" : money(minor(row.grossMinor))}</p></article> })}</div> : <Empty text="لا توجد طلبات مطبخ لهذا العضو."/>}</SectionShell> }

function FilesSection({ rows: items, urls, error }: { rows: Row[]; urls: Record<string, string>; error?: string }) { return <SectionShell title="الصور والمستندات" count={items.length} error={error}>{items.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map(file => <DocumentPreview key={text(file.id)} file={file} url={urls[text(file.id)]}/>)}</div> : <Empty text="لا توجد صور أو مستندات مرفوعة لهذا العضو."/>}</SectionShell> }

type ListProps = { rows: Row[]; branches: Branch[]; error?: string }
function SectionShell({ title, count, error, children }: { title: string; count: number; error?: string; children: React.ReactNode }) { return <section><div className="mb-4 flex items-center gap-3"><h2 className="text-xl font-black">{title}</h2><Badge variant="secondary">{count}</Badge></div>{error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 p-4 text-xs text-red-600">{error}</p>}{children}</section> }
function Avatar({ name, url }: { name: string; url?: string }) { return <div className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-3xl border-2 border-primary/30 bg-primary/15 text-2xl font-black text-primary" style={url ? { backgroundImage: `url(${JSON.stringify(url).slice(1, -1)})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>{!url && initials(name)}{url && <span className="sr-only">صورة {name}</span>}<Camera className="absolute bottom-1 left-1 size-4 rounded-full bg-card p-0.5"/></div> }
function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Package }) { return <div className="flex items-center gap-3 bg-card p-5"><span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary"><Icon className="size-5"/></span><div><p className="text-[10px] font-bold text-muted-foreground">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div></div> }
function Info({ label, value, icon: Icon, ltr = false }: { label: string; value: string; icon: typeof UserRound; ltr?: boolean }) { return <div className="rounded-xl bg-secondary/55 p-4"><p className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><Icon className="size-3.5"/>{label}</p><p className="mt-2 break-words text-sm font-bold" dir={ltr ? "ltr" : undefined}>{value}</p></div> }
function Small({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-bold text-muted-foreground">{label}</p><p className="mt-1 text-xs font-bold">{value}</p></div> }
function Empty({ text: value, compact = false }: { text: string; compact?: boolean }) { return <div className={cn("grid place-items-center rounded-2xl border border-dashed text-center text-xs text-muted-foreground", compact ? "min-h-44 p-5" : "min-h-64 p-8")}><div><FileText className="mx-auto mb-3 size-9 opacity-30"/>{value}</div></div> }
function Message({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) { return <div className="grid min-h-[55vh] place-items-center text-center"><div><UserRound className="mx-auto size-12 text-muted-foreground/35"/><h1 className="mt-4 text-xl font-black">{title}</h1><p className="mt-2 max-w-lg text-sm text-muted-foreground">{detail}</p>{retry && <Button className="mt-5" onClick={retry}><RefreshCw/>إعادة المحاولة</Button>}</div></div> }
function DocumentPreview({ file, url }: { file: Row; url?: string }) { const image = text(file.expectedMimeType).startsWith("image/"); const content = <div className="overflow-hidden rounded-2xl border bg-card"><div className="grid h-36 place-items-center bg-secondary/45" style={url && image ? { backgroundImage: `url(${JSON.stringify(url).slice(1, -1)})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>{(!url || !image) && <FileBadge className="size-10 text-muted-foreground/35"/>}</div><div className="p-4"><p className="truncate text-sm font-black">{fileLabel(text(file.purpose))}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{text(file.originalFilename, "مستند")}</p><div className="mt-3 flex gap-2"><StatusBadge status={text(file.uploadStatus)}/><StatusBadge status={text(file.scanStatus)}/></div></div></div>; return url ? <a href={url} target="_blank" rel="noreferrer" className="block transition hover:-translate-y-0.5" title="فتح المستند">{content}</a> : content }

function rows(data: Row[] | { items: Row[] }) { return Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [] }
function unique(items: Row[]) { const map = new Map(items.map(item => [text(item.id), item])); return [...map.values()] }
function newest(items: Row[], key: string) { return [...items].sort((a, b) => new Date(text(b[key], "1970-01-01")).getTime() - new Date(text(a[key], "1970-01-01")).getTime()) }
function isRow(value: unknown): value is Row { return typeof value === "object" && value !== null && !Array.isArray(value) }
function text(value: unknown, fallback = "غير مسجل") { return value === null || value === undefined || String(value).trim() === "" ? fallback : String(value) }
function minor(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback }
function money(value: number) { return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 2 }).format(value / 100) }
function date(value: unknown) { if (!value) return "غير مسجل"; const parsed = new Date(String(value)); return Number.isNaN(parsed.getTime()) ? text(value) : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(parsed) }
function dateTime(value: unknown) { if (!value) return "غير مسجل"; const parsed = new Date(String(value)); return Number.isNaN(parsed.getTime()) ? text(value) : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(parsed) }
function branchLabel(id: string, branches: Branch[]) { const branch = branches.find(item => item.id === id); return branch?.nameAr ?? branch?.name ?? (id && id !== "غير مسجل" ? `فرع ${id.slice(0, 8)}` : "غير محدد") }
function genderLabel(value: string) { return ({ MALE: "ذكر", FEMALE: "أنثى", UNSPECIFIED: "غير محدد" } as Record<string, string>)[value] ?? value }
function accountLabel(value: string) { return ({ LINKED: "حساب دخول مفعّل", ACTIVATION_PENDING: "بانتظار تفعيل الحساب", NOT_LINKED: "غير مرتبط بحساب" } as Record<string, string>)[value] ?? "غير مرتبط بحساب" }
function paymentMethod(value: string) { return ({ CASH: "نقدي", CARD: "بطاقة", BANK_TRANSFER: "تحويل بنكي", WALLET: "محفظة إلكترونية", OTHER: "طريقة أخرى" } as Record<string, string>)[value] ?? value }
function fileLabel(value: string) { return ({ PROFILE_PHOTO: "الصورة الشخصية", IDENTITY_DOCUMENT: "إثبات الهوية", CONSENT: "نموذج الموافقة", EMPLOYMENT_DOCUMENT: "مستند" } as Record<string, string>)[value] ?? "مستند العضو" }
function initials(value: string) { return value.trim().split(/\s+/u).slice(0, 2).map(part => part[0]).join("") || "ع" }
function subscriptionContracts(subscription: Row, services: Row[], activities: Row[]) {
  const entitlements = Array.isArray(subscription.entitlements) ? subscription.entitlements.filter(isRow) : []
  const serviceIds = new Set(entitlements.map(item => text(item.serviceId, "")).filter(Boolean))
  const activityIds = new Set(services.filter(service => serviceIds.has(text(service.id))).flatMap(service => Array.isArray(service.activityIds) ? service.activityIds.map(String) : []))
  return activities.filter(activity => activityIds.has(text(activity.id)) && Boolean(activity.contractContent))
}
function printContract(contract: Row) {
  const popup = window.open("", "_blank", "noopener,noreferrer")
  if (!popup) return
  popup.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escapeHtml(text(contract.contractTitle, "عقد النشاط"))}</title><style>body{font-family:Cairo,Arial,sans-serif;max-width:850px;margin:40px auto;line-height:2;color:#111;padding:0 24px}h1{border-bottom:2px solid #111;padding-bottom:16px}p{white-space:pre-wrap}</style></head><body><h1>${escapeHtml(text(contract.contractTitle, `عقد ${text(contract.name)}`))}</h1><p>${escapeHtml(text(contract.contractContent, ""))}</p><script>window.onload=()=>window.print()</script></body></html>`)
  popup.document.close()
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] ?? character)) }
