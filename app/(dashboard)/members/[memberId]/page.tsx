import type { Metadata } from "next"
import { MemberProfilePage } from "@/components/member-profile-page"

export const metadata: Metadata = { title: "ملف العضو" }

export default async function MemberDetailsPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params
  return <MemberProfilePage memberId={memberId}/>
}
