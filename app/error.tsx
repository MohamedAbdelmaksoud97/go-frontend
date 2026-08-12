"use client"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){return <main className="grid min-h-[70vh] place-items-center p-5"><div className="max-w-md text-center"><span className="mx-auto grid size-16 place-items-center rounded-3xl bg-red-500/10 text-red-600"><AlertTriangle className="size-8"/></span><h1 className="mt-5 text-2xl font-black">تعذر عرض الصفحة</h1><p className="mt-3 text-sm leading-7 text-muted-foreground">حدث عطل مؤقت أثناء عرض المحتوى. أعد المحاولة، ولن تتكرر أي عملية سبق حفظها.</p><Button className="mt-6" onClick={reset}><RotateCcw/>إعادة المحاولة</Button></div></main>}
