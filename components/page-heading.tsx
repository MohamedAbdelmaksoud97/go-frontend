import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Download, Plus } from "lucide-react"

export function PageHeading({ eyebrow, title, description, action="إضافة جديد", actionHref="#", showExport=false }: { eyebrow?:string; title:string; description:string; action?:string; actionHref?:string; showExport?:boolean }) {
 return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
   <div>{eyebrow && <Badge variant="outline" className="mb-3 border-primary/30 bg-primary/8 text-amber-700 dark:text-primary">{eyebrow}</Badge>}<h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{description}</p></div>
   <div className="flex gap-2">{showExport && <Button variant="outline" size="lg"><Download />تصدير</Button>}<Link href={actionHref}><Button size="lg" className="brand-shadow"><Plus />{action}</Button></Link></div>
 </div>
}
import Link from "next/link"
