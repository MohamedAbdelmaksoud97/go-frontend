import * as React from "react"
import { cn } from "@/lib/utils"
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
 return <input type={type} className={cn("h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/15", className)} {...props}/>
}
export { Input }
