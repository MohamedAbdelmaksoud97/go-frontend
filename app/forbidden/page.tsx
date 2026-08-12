import Link from "next/link"
import { ShieldX } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"
import { Button } from "@/components/ui/button"
export default function ForbiddenPage(){return <main dir="rtl" className="grid min-h-screen place-items-center p-5"><div className="max-w-md text-center"><BrandLogo className="mb-10 justify-center"/><span className="mx-auto grid size-16 place-items-center rounded-3xl bg-red-500/10 text-red-600"><ShieldX className="size-8"/></span><h1 className="mt-5 text-3xl font-black">هذه الصفحة غير متاحة لحسابك</h1><p className="mt-3 text-sm leading-7 text-muted-foreground">قد تكون متاحة في فرع آخر أو تحتاج إلى موافقة المسؤول. جرّب تغيير الفرع أو العودة إلى لوحة التحكم.</p><div className="mt-6 flex justify-center gap-2"><Link href="/select-context"><Button>تغيير الفرع</Button></Link><Link href="/"><Button variant="outline">لوحة التحكم</Button></Link></div></div></main>}

