"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react"

type ToastKind = "success" | "error" | "warning" | "info"
type ToastInput = { message: string; title?: string; kind?: ToastKind; duration?: number }
type ToastItem = Required<Pick<ToastInput, "message" | "kind">> & Pick<ToastInput, "title"> & { id: number }
type ToastApi = {
  show: (input: string | ToastInput) => number
  success: (message: string, title?: string) => number
  error: (message: string, title?: string) => number
  warning: (message: string, title?: string) => number
  info: (message: string, title?: string) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const sequence = useRef(0)
  const dismiss = useCallback((id: number) => setItems(current => current.filter(item => item.id !== id)), [])
  const show = useCallback((value: string | ToastInput) => {
    const input = typeof value === "string" ? { message: value } : value
    const id = ++sequence.current
    const item: ToastItem = { id, message: input.message, title: input.title, kind: input.kind ?? "info" }
    setItems(current => [...current.slice(-3), item])
    window.setTimeout(() => dismiss(id), Math.max(1500, input.duration ?? 4500))
    return id
  }, [dismiss])
  const api = useMemo<ToastApi>(() => ({
    show,
    success: (message, title) => show({ message, title, kind: "success" }),
    error: (message, title) => show({ message, title, kind: "error", duration: 6000 }),
    warning: (message, title) => show({ message, title, kind: "warning", duration: 6000 }),
    info: (message, title) => show({ message, title, kind: "info" }),
    dismiss,
  }), [dismiss, show])

  return <ToastContext.Provider value={api}>{children}<div dir="rtl" aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed left-4 top-4 z-[200] flex w-[min(92vw,420px)] flex-col gap-3 sm:left-6 sm:top-6">{items.map(item => <ToastCard key={item.id} item={item} dismiss={dismiss} />)}</div></ToastContext.Provider>
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext)
  if (!value) throw new Error("useToast must be used inside ToastProvider")
  return value
}

function ToastCard({ item, dismiss }: { item: ToastItem; dismiss: (id: number) => void }) {
  const appearance = {
    success: { icon: CheckCircle2, title: "تمت العملية", className: "border-emerald-500/35 text-emerald-600" },
    error: { icon: AlertCircle, title: "تعذر إتمام العملية", className: "border-red-500/35 text-red-600" },
    warning: { icon: TriangleAlert, title: "تنبيه", className: "border-amber-500/35 text-amber-600" },
    info: { icon: Info, title: "معلومة", className: "border-blue-500/35 text-blue-600" },
  }[item.kind]
  const Icon = appearance.icon
  return <div role={item.kind === "error" ? "alert" : "status"} className={`pointer-events-auto flex items-start gap-3 rounded-2xl border bg-card/95 p-4 text-foreground shadow-2xl backdrop-blur-xl toast-in ${appearance.className}`}>
    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-secondary"><Icon className="size-5" /></span>
    <div className="min-w-0 flex-1"><p className="text-sm font-black text-foreground">{item.title ?? appearance.title}</p><p className="mt-1 text-xs leading-6 text-muted-foreground">{item.message}</p></div>
    <button type="button" onClick={() => dismiss(item.id)} className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground" aria-label="إغلاق الإشعار"><X className="size-4" /></button>
  </div>
}
