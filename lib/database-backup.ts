import { ApiError, apiRequest, apiFileResponse } from "@/lib/api-client"

export async function databaseBackupAccess() {
  return (await apiRequest<{ allowed: boolean }>("/system/database-backup/access")).data.allowed
}

type DownloadFileHandle = { createWritable(): Promise<WritableStream<Uint8Array>> }
type SaveFileWindow = Window & { showSaveFilePicker?: (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<DownloadFileHandle> }

export async function downloadDatabaseBackup() {
  const filename = `go-fitness-database-${new Date().toISOString().slice(0, 10)}.zip`
  // Chrome can stream directly to disk without holding the database in browser
  // memory. Invoke the picker synchronously with the user's click gesture.
  const picker = (window as SaveFileWindow).showSaveFilePicker
  const file = picker ? await picker.call(window, { suggestedName: filename, types: [{ description: "نسخة بيانات قاعدة البيانات CSV", accept: { "application/zip": [".zip"] } }] }) : undefined
  const response = await apiFileResponse("/system/database-backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
  if (!response.body || !response.headers.get("content-type")?.includes("application/zip")) {
    throw new ApiError({ type: "about:blank", title: "تعذر تحميل النسخة", status: 503, code: "database_backup_failed", detail: "لم يرجع الخادم ملف النسخة المتوقع." })
  }
  if (file) {
    await response.body.pipeTo(await file.createWritable())
  } else {
    const url = URL.createObjectURL(await response.blob())
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename
    document.body.appendChild(anchor); anchor.click(); anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
