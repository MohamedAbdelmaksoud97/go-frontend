import type { Metadata } from "next"
import { MasterDataPage } from "@/components/master-data-page"

export const metadata: Metadata = { title: "إعداد النظام" }

export default async function SystemSettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  return <MasterDataPage key={section} initialSection={section} />
}
