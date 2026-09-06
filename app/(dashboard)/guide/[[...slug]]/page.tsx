import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { SystemUserGuide } from "@/components/system-user-guide"
import { findGuidePage, guidePages } from "@/lib/system-guide-content"

type Props = { params: Promise<{ slug?: string[] }> }

export function generateStaticParams() {
  return [{ slug: [] }, ...guidePages.map(page => ({ slug: [page.slug] }))]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = slug?.[0] ? findGuidePage(slug[0]) : undefined
  return {
    title: page ? `${page.title} | دليل GO Fitness` : "دليل استخدام GO Fitness",
    description: page?.description ?? "الدليل التشغيلي الكامل لاستخدام نظام GO Fitness.",
  }
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params
  if (slug && slug.length > 1) notFound()
  const page = slug?.[0] ? findGuidePage(slug[0]) : undefined
  if (slug?.[0] && !page) notFound()
  return <SystemUserGuide pages={guidePages} page={page} />
}
