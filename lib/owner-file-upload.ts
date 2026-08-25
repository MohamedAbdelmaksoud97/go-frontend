import { apiRequest, ApiError, createIdempotencyKey } from "@/lib/api-client"

export type OwnerFileKind = "IDENTITY" | "PROFILE"
export type FileOwner = { module: "workforce" | "members"; type: "EMPLOYEE" | "MEMBER" }

const MAX_FILE_SIZE = 10 * 1024 * 1024

export async function ownerFileValidationError(file: File, kind: OwnerFileKind, label: string): Promise<string> {
  if (file.size < 1) return `${label} فارغ ولا يحتوي على بيانات.`
  if (file.size > MAX_FILE_SIZE) return `${label} يتجاوز الحد الأقصى وهو 10 ميجابايت.`
  const mimeType = await detectSupportedMimeType(await file.arrayBuffer())
  if (!mimeType || (kind === "PROFILE" && mimeType === "application/pdf")) {
    return `صيغة ${label} غير مدعومة. استخدم JPG أو PNG${kind === "IDENTITY" ? " أو PDF" : ""}.`
  }
  return ""
}

export async function uploadOwnerFile(
  organizationId: string,
  ownerId: string,
  owner: FileOwner,
  kind: OwnerFileKind,
  file: File,
) {
  const bytes = await file.arrayBuffer()
  const mimeType = await detectSupportedMimeType(bytes)
  if (!mimeType || (kind === "PROFILE" && mimeType === "application/pdf")) {
    throw new ApiError({ type: "about:blank", title: "صيغة ملف غير مدعومة", status: 422, detail: "File MIME type is not allowed.", code: "file_type_not_allowed" })
  }
  if (file.size < 1 || file.size > MAX_FILE_SIZE) {
    throw new ApiError({ type: "about:blank", title: "حجم ملف غير صالح", status: 422, detail: "File size is outside the allowed range.", code: "invalid_file_size" })
  }

  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(byte => byte.toString(16).padStart(2, "0")).join("")
  const request = await apiRequest<{ fileId: string; uploadUrl: string; expectedVersion: number }>(`/organizations/${organizationId}/files/upload-requests`, {
    method: "POST",
    headers: { "Idempotency-Key": createIdempotencyKey() },
    body: JSON.stringify({ ownerModule: owner.module, ownerType: owner.type, ownerId, purpose: kind === "IDENTITY" ? "IDENTITY_DOCUMENT" : "PROFILE_PHOTO", originalFilename: file.name, mimeType, size: file.size, checksumSha256: sha256 }),
  })
  const upload = await fetch(request.data.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: bytes })
  if (!upload.ok) {
    throw new ApiError({ type: "about:blank", title: "تعذر رفع الملف", status: upload.status || 502, detail: "The storage service rejected the file upload.", code: "owner_file_upload_failed" })
  }
  const completion = await apiRequest<{ fileId: string; uploadStatus: string; scanStatus: string; version: number }>(`/organizations/${organizationId}/files/${request.data.fileId}/upload-completions`, {
    method: "POST",
    headers: { "Idempotency-Key": createIdempotencyKey() },
    body: JSON.stringify({ expectedVersion: request.data.expectedVersion }),
  })
  return completion.data
}

async function detectSupportedMimeType(buffer: ArrayBuffer): Promise<"application/pdf" | "image/jpeg" | "image/png" | undefined> {
  const bytes = new Uint8Array(buffer.slice(0, 8))
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png"
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf"
  return undefined
}
