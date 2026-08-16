import type { Metadata } from "next"
import { MasterDataPage } from "@/components/master-data-page"

export const metadata: Metadata = { title: "البيانات الرئيسية" }

export default function Page() {
  return <MasterDataPage />
}
