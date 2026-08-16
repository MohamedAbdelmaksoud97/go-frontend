import type { Metadata } from "next"
import { CashierWorkstation } from "@/components/cashier-workstation"

export const metadata: Metadata = { title: "نقطة البيع والكاشير" }

export default function Page() { return <CashierWorkstation /> }
