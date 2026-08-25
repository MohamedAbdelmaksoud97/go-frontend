import type { Metadata } from "next"
import { EmployeeProfilePage } from "@/components/employee-profile-page"

export const metadata: Metadata = { title: "ملف الموظف" }

export default async function EmployeeDetailsPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params
  return <EmployeeProfilePage employeeId={employeeId}/>
}
