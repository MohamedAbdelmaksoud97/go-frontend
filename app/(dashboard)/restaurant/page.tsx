import type { Metadata } from "next"
import { RestaurantManagementPage } from "@/components/restaurant-management-page"

export const metadata: Metadata = { title: "المطعم والمطبخ" }

export default function Page() { return <RestaurantManagementPage /> }
