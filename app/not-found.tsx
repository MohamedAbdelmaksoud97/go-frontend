import Link from "next/link"
import { SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"
export default function NotFound(){return <main className="grid min-h-screen place-items-center p-5 text-center"><div><SearchX className="mx-auto size-14 text-primary"/><p className="mt-5 text-6xl font-black">404</p><h1 className="mt-3 text-2xl font-black">الصفحة غير موجودة</h1><p className="mt-2 text-sm text-muted-foreground">ربما تغير الرابط أو لم تعد الصفحة متاحة في هذا السياق.</p><Link href="/"><Button className="mt-6">العودة للوحة التحكم</Button></Link></div></main>}
