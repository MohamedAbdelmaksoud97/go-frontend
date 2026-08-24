"use client"

import { useRef, type ComponentProps } from "react"
import { CalendarDays, Clock3 } from "lucide-react"
import { Input } from "@/components/ui/input"

type DateTimeInputProps = Omit<ComponentProps<"input">, "type"> & {
  type: "date" | "datetime-local" | "time"
}

export function DateTimeInput({ type, className, ...props }: DateTimeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const Icon = type === "time" ? Clock3 : CalendarDays
  const pickerLabel = type === "date"
    ? "فتح التقويم واختيار التاريخ"
    : type === "time"
      ? "فتح قائمة اختيار الوقت"
      : "فتح التقويم واختيار التاريخ والوقت"

  function openPicker() {
    const input = inputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null
    input?.focus()
    try {
      input?.showPicker?.()
    } catch {
      // Some browsers only allow focusing the native date field.
    }
  }

  return (
    <span className="relative block">
      <Input
        {...props}
        ref={inputRef}
        type={type}
        dir={props.dir ?? "ltr"}
        className={`pl-12 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:opacity-0 ${className ?? ""}`}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={props.disabled || props.readOnly}
        className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        aria-label={pickerLabel}
        title={pickerLabel}
      >
        <Icon className="size-4" />
      </button>
    </span>
  )
}
