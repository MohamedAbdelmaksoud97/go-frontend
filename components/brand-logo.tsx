import Image from "next/image"
import { cn } from "@/lib/utils"

export function BrandLogo({ compact=false, className }: { compact?:boolean; className?:string }) {
  return <div className={cn("flex items-center", className)} aria-label="GO Fitness Zulfi">
    <Image
      src="/go-fitness-logo.png"
      alt="GO Fitness Zulfi"
      width={5028}
      height={3476}
      priority
      sizes={compact ? "40px" : "84px"}
      className={cn("shrink-0 object-contain drop-shadow-[0_8px_20px_rgba(255,204,0,.2)]", compact ? "h-10 w-14" : "h-14 w-[84px]")}
    />
  </div>
}
