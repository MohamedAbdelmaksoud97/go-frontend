import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { TargetSubscriptionsReport } from "@/components/target-subscriptions-report"

export const metadata: Metadata = { title: "تفاصيل اشتراكات الباقة أو العرض" }

type SearchQuery = { from?: string; to?: string; branchId?: string; name?: string; code?: string }

export default async function TargetSubscriptionsReportPage({ params, searchParams }: { params: Promise<{ targetType: string; targetId: string }>; searchParams: Promise<SearchQuery> }) {
  const [{ targetType, targetId }, query] = await Promise.all([params, searchParams])
  if ((targetType !== "package" && targetType !== "promotion") || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) notFound()
  return <TargetSubscriptionsReport
    targetType={targetType}
    targetId={targetId}
    initialFrom={validDate(query.from)}
    initialTo={validDate(query.to)}
    initialBranchId={query.branchId === "ALL" ? "" : validUuid(query.branchId)}
    targetName={query.name?.slice(0, 160) ?? ""}
    targetCode={query.code?.slice(0, 80) ?? ""}
  />
}

function validDate(value: string | undefined) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined }
function validUuid(value: string | undefined) { return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined }
