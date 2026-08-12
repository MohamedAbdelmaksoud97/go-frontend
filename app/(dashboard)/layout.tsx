import { AppShell } from "@/components/app-shell"
import { AppProvider } from "@/components/app-context"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppProvider><AppShell>{children}</AppShell></AppProvider>
}
