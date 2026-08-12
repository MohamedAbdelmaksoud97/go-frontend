import { cn } from "@/lib/utils"

export function BrandLogo({ compact=false, className }: { compact?:boolean; className?:string }) {
  return <div className={cn("flex items-center gap-2.5", className)} aria-label="GO Fitness">
    <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary text-black shadow-[0_8px_22px_rgba(255,204,0,.25)]">
      <svg viewBox="0 0 48 48" className="size-8" aria-hidden="true"><path d="M7 11h15l-3.5 7H13l-2.8 12h8.3l3.5 7H9C4.6 37 2 33.7 3 29l3-14c.5-2.4 1.5-4 1-4Zm18 0h14c4.5 0 6.8 3.2 5.8 7.6l-2.4 11.2c-1 4.7-4.3 7.2-8.9 7.2H22l4-7h7c1.1 0 1.7-.6 2-1.8l1.8-8.3c.3-1.3-.2-1.9-1.4-1.9H22l3-7Z" fill="currentColor"/><path d="m16 28 7-8 1.4 5H30l-8.5 10-1.2-5.5H16Z" fill="#fff"/></svg>
    </span>
    {!compact && <span className="leading-none"><span className="block text-lg font-black tracking-tight">GO FITNESS</span><span className="mt-1 block text-[8px] font-bold tracking-[.34em] text-primary">ZULFI</span></span>}
  </div>
}
