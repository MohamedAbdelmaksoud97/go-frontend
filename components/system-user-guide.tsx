"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { ArrowLeft, BookOpenText, Check, ChevronLeft, Clock3, Download, Home, Lightbulb, Search, TriangleAlert, UsersRound, X, ZoomIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { guideGroups, type GuidePage, type GuideSection } from "@/lib/system-guide-content"

const toneClasses = {
  info: "border-blue-500/25 bg-blue-500/8 text-blue-700 dark:text-blue-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  danger: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
}

function searchText(page: GuidePage) {
  return [page.title, page.description, ...page.keywords, ...page.flow, ...page.sections.flatMap(section => [section.title, section.description ?? "", ...(section.steps ?? []), ...(section.points ?? []), section.note?.title ?? "", section.note?.body ?? ""])].join(" ").toLocaleLowerCase("ar")
}

function GuideSearch({ pages }: { pages: GuidePage[] }) {
  const [query, setQuery] = useState("")
  const results = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase("ar").split(/\s+/).filter(Boolean)
    if (!terms.length) return []
    return pages.filter(page => terms.every(term => searchText(page).includes(term))).slice(0, 8)
  }, [pages, query])

  return <div className="relative z-20 w-full max-w-2xl">
    <Search className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
    <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث عن إجراء: إنشاء باقة، تجميد، بيع وجبة…" className="h-14 w-full rounded-2xl border bg-background pr-12 pl-4 text-sm font-semibold shadow-sm outline-none transition placeholder:font-normal focus:border-primary focus:ring-4 focus:ring-primary/10" aria-label="البحث في دليل الاستخدام" />
    {query.trim() && <div className="absolute inset-x-0 top-[62px] max-h-96 overflow-y-auto rounded-2xl border bg-card p-2 shadow-2xl">
      {results.length ? results.map(page => <Link key={page.slug} href={`/guide/${page.slug}`} className="block rounded-xl p-3 transition hover:bg-secondary focus:bg-secondary">
        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">{page.group}</span>
        <p className="font-black">{page.title}</p><p className="mt-1 text-xs text-muted-foreground">{page.description}</p>
      </Link>) : <p className="p-5 text-center text-sm text-muted-foreground">لا توجد نتيجة. جرّب اسم الشاشة أو كلمة أقصر.</p>}
    </div>}
  </div>
}

function GuideNavigation({ pages, activeSlug }: { pages: GuidePage[]; activeSlug?: string }) {
  const router = useRouter()
  return <Card className="h-fit xl:sticky xl:top-24"><CardContent className="p-3">
    <div className="xl:hidden"><label className="text-xs font-black" htmlFor="guide-page-select">انتقل إلى صفحة في الدليل</label><select id="guide-page-select" value={activeSlug ?? ""} onChange={event => router.push(event.target.value ? `/guide/${event.target.value}` : "/guide")} className="mt-2 h-12 w-full rounded-xl border bg-background px-3 text-sm font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"><option value="">الرئيسية</option>{guideGroups.map(group => <optgroup key={group} label={group}>{pages.filter(page => page.group === group).map(page => <option key={page.slug} value={page.slug}>{page.title}</option>)}</optgroup>)}</select></div>
    <div className="hidden items-center gap-2 border-b px-2 pb-3 xl:flex"><span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-amber-700"><BookOpenText className="size-4" /></span><div><p className="text-sm font-black">محتويات الدليل</p><p className="text-[10px] text-muted-foreground">انتقل إلى رحلة العمل المطلوبة</p></div></div>
    <nav className="mt-3 hidden max-h-[calc(100vh-190px)] space-y-4 overflow-y-auto xl:block" aria-label="صفحات دليل الاستخدام">
      <Link href="/guide" className={cn("flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold transition hover:bg-secondary", !activeSlug && "bg-primary text-primary-foreground")}><Home className="size-4" />الرئيسية</Link>
      {guideGroups.map(group => {
        const groupPages = pages.filter(page => page.group === group)
        return <section key={group}><p className="px-3 pb-1 text-[10px] font-bold text-muted-foreground">{group}</p><div className="space-y-1">{groupPages.map(page => <Link key={page.slug} href={`/guide/${page.slug}`} aria-current={activeSlug === page.slug ? "page" : undefined} className={cn("flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold transition hover:bg-secondary", activeSlug === page.slug && "bg-primary text-primary-foreground")}><ChevronLeft className="size-3.5" />{page.title}</Link>)}</div></section>
      })}
    </nav>
  </CardContent></Card>
}

function Workflow({ items }: { items: string[] }) {
  return <ol className="grid gap-3 rounded-2xl bg-zinc-950 p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="تسلسل رحلة العمل">
    {items.map((item, index) => <li key={item} className={cn("relative flex min-h-24 flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[.07] p-3 text-center text-xs font-black text-white", (index === 0 || index === items.length - 1) && "bg-primary text-black")}>
      <span className="mb-2 grid size-7 place-items-center rounded-full border border-current text-[10px]">{index + 1}</span>{item}
      {index < items.length - 1 && <ArrowLeft className="absolute -left-5 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-primary lg:block" aria-hidden="true" />}
    </li>)}
  </ol>
}

function SectionCallout({ note }: { note: NonNullable<GuideSection["note"]> }) {
  const tone = note.tone ?? "info"
  return <aside className={cn("mt-5 flex items-start gap-3 rounded-2xl border p-4", toneClasses[tone])}>
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-current/10">{tone === "warning" || tone === "danger" ? <TriangleAlert className="size-5" /> : tone === "success" ? <Check className="size-5" /> : <Lightbulb className="size-5" />}</span>
    <div><p className="font-black">{note.title}</p><p className="mt-1 text-sm leading-7 text-foreground/75">{note.body}</p></div>
  </aside>
}

function GuideImage({ image, onZoom }: { image: NonNullable<GuideSection["image"]>; onZoom: (image: NonNullable<GuideSection["image"]>) => void }) {
  return <figure className="mt-5 overflow-hidden rounded-2xl border bg-secondary/30">
    <button type="button" onClick={() => onZoom(image)} className="group relative block w-full overflow-hidden bg-zinc-950 text-right" aria-label={`تكبير الصورة: ${image.alt}`}>
      <Image src={image.src} alt={image.alt} width={2048} height={1050} unoptimized className="h-auto w-full transition duration-300 group-hover:scale-[1.01]" />
      <span className="absolute bottom-3 left-3 flex items-center gap-2 rounded-xl bg-black/80 px-3 py-2 text-[11px] font-bold text-white"><ZoomIn className="size-4" />تكبير الصورة</span>
    </button>
    <figcaption className="p-4 text-xs leading-6 text-muted-foreground">{image.caption}<span className="mt-2 block border-t pt-2 text-[10px]">تعرض الصورة بيانات تدريبية، وقد تختلف العناصر حسب الصلاحية والفرع.</span></figcaption>
  </figure>
}

function GuideSectionCard({ section, onZoom }: { section: GuideSection; onZoom: (image: NonNullable<GuideSection["image"]>) => void }) {
  return <section id={section.id} className="scroll-mt-24 rounded-3xl border bg-card p-5 shadow-sm sm:p-7">
    <h2 className="text-xl font-black sm:text-2xl">{section.title}</h2>
    {section.description && <p className="mt-2 text-sm leading-7 text-muted-foreground">{section.description}</p>}
    {section.image && <GuideImage image={section.image} onZoom={onZoom} />}
    {section.steps && <ol className="mt-5 space-y-3">{section.steps.map((step, index) => <li key={step} className="grid grid-cols-[36px_1fr] items-start gap-3 rounded-2xl border bg-secondary/25 p-3 text-sm leading-7"><span className="grid size-9 place-items-center rounded-xl bg-primary font-black text-black">{index + 1}</span><p>{step}</p></li>)}</ol>}
    {section.points && <ul className="mt-5 space-y-2">{section.points.map(point => <li key={point} className="flex items-start gap-3 text-sm leading-7"><Check className="mt-1.5 size-4 shrink-0 text-emerald-600" /><span>{point}</span></li>)}</ul>}
    {section.note && <SectionCallout note={section.note} />}
  </section>
}

function GuideHome({ pages }: { pages: GuidePage[] }) {
  return <div className="space-y-8">
    <section className="relative overflow-visible rounded-3xl border border-primary/25 bg-gradient-to-bl from-zinc-950 via-zinc-900 to-zinc-800 p-6 text-white shadow-2xl sm:p-10 lg:p-14">
      <div className="max-w-3xl"><span className="inline-flex rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs font-black text-primary">دليل GO Fitness الرقمي</span><h1 className="mt-5 text-4xl font-black leading-tight sm:text-5xl">أنجز المهمة، خطوة بخطوة.</h1><p className="mt-4 max-w-2xl text-sm leading-8 text-zinc-300 sm:text-base">مرجع داخل النظام يجمع رحلة كل إجراء، الخطوات، صور الواجهة، النتيجة المتوقعة وأسباب تعطل العملية.</p><div className="mt-7"><GuideSearch pages={pages} /></div></div>
    </section>
    <section><div className="mb-5"><p className="text-xs font-black text-amber-700 dark:text-amber-300">كل مهام النظام</p><h2 className="mt-1 text-2xl font-black">اختر رحلة العمل</h2><p className="mt-1 text-sm text-muted-foreground">الترتيب حسب ما تريد إنجازه، وليس حسب أسماء الجداول أو المكونات التقنية.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{pages.map((page, index) => <Link key={page.slug} href={`/guide/${page.slug}`} className="group relative min-h-52 overflow-hidden rounded-3xl border bg-card p-6 shadow-sm transition hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl"><span className="absolute left-4 top-1 text-6xl font-black text-foreground/[.04]">{String(index + 1).padStart(2, "0")}</span><p className="text-[10px] font-black text-amber-700 dark:text-amber-300">{page.group}</p><h3 className="mt-3 text-lg font-black leading-7">{page.title}</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">{page.description}</p><span className="absolute bottom-5 right-6 flex items-center gap-2 text-xs font-black group-hover:text-amber-700 dark:group-hover:text-amber-300">فتح المسار <ArrowLeft className="size-4" /></span></Link>)}</div>
    </section>
  </div>
}

export function SystemUserGuide({ pages, page }: { pages: GuidePage[]; page?: GuidePage }) {
  const [zoomed, setZoomed] = useState<NonNullable<GuideSection["image"]>>()
  if (!page) return <GuideHome pages={pages} />
  const index = pages.findIndex(item => item.slug === page.slug)
  const previous = pages[index - 1]
  const next = pages[index + 1]

  return <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
    <GuideNavigation pages={pages} activeSlug={page.slug} />
    <div className="min-w-0 space-y-5">
      <nav className="flex items-center gap-2 text-xs text-muted-foreground" aria-label="مسار الصفحة"><Link href="/guide" className="transition hover:text-foreground">دليل الاستخدام</Link><ChevronLeft className="size-3" /><span>{page.group}</span></nav>
      <section className="overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-bl from-zinc-950 to-zinc-800 p-6 text-white shadow-xl sm:p-9">
        <span className="inline-flex rounded-full bg-primary px-3 py-1 text-[11px] font-black text-black">{page.group}</span><h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">{page.title}</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">{page.description}</p>
        <div className="mt-6 flex flex-wrap gap-3 text-xs"><span className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2"><Clock3 className="size-4 text-primary" />{page.duration}</span><span className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2"><UsersRound className="size-4 text-primary" />{page.roles}</span><a href="/guide/GO-Fitness-Complete-User-Guide-ar.pdf" className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 transition hover:border-primary"><Download className="size-4 text-primary" />نسخة PDF</a></div>
      </section>
      <GuideSearch pages={pages} />
      <Workflow items={page.flow} />
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="عناوين هذه الصفحة">{page.sections.map(section => <a key={section.id} href={`#${section.id}`} className="whitespace-nowrap rounded-full border bg-card px-3 py-2 text-[11px] font-bold transition hover:border-primary hover:text-amber-700">{section.title}</a>)}</nav>
      {page.sections.map(section => <GuideSectionCard key={section.id} section={section} onZoom={setZoomed} />)}
      <nav className="grid gap-3 sm:grid-cols-2" aria-label="التنقل بين صفحات الدليل">{previous ? <Link href={`/guide/${previous.slug}`} className="rounded-2xl border bg-card p-4 transition hover:border-primary"><span className="text-[10px] text-muted-foreground">السابق</span><p className="mt-1 font-black">→ {previous.title}</p></Link> : <span />}{next && <Link href={`/guide/${next.slug}`} className="rounded-2xl border bg-card p-4 text-left transition hover:border-primary"><span className="text-[10px] text-muted-foreground">التالي</span><p className="mt-1 font-black">{next.title} ←</p></Link>}</nav>
    </div>
    {zoomed && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/90 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={zoomed.alt} onClick={() => setZoomed(undefined)}><Button variant="outline" size="icon" className="absolute left-5 top-5 bg-black/60 text-white" onClick={() => setZoomed(undefined)} aria-label="إغلاق الصورة"><X /></Button><div className="max-h-[92vh] max-w-[96vw]" onClick={event => event.stopPropagation()}><Image src={zoomed.src} alt={zoomed.alt} width={2048} height={1050} unoptimized className="max-h-[86vh] w-auto rounded-xl object-contain" /><p className="mt-2 text-center text-xs text-white">{zoomed.caption}</p></div></div>}
  </div>
}
