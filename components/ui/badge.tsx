import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold", { variants: { variant: {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  success: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/14 text-amber-700 dark:text-amber-400",
  danger: "bg-red-500/12 text-red-600 dark:text-red-400",
  outline: "border border-border text-muted-foreground",
}}, defaultVariants: { variant: "default" } })
function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
export { Badge, badgeVariants }
