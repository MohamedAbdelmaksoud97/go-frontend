const safeMethods = new Set(["GET", "HEAD", "OPTIONS"])

/** Protect cookie-authenticated BFF mutations before reading cookies or forwarding requests. */
export function rejectUnsafeRequest(request: Request, options: { requireJson?: boolean } = {}): Response | undefined {
  if (safeMethods.has(request.method.toUpperCase())) return undefined

  const targetOrigin = requestOrigin(request)
  const origin = request.headers.get("origin")
  const referer = request.headers.get("referer")
  const fetchSite = request.headers.get("sec-fetch-site")
  // SameSite cookies do not separate sibling subdomains. Require the exact origin.
  const sourceMatches = origin !== null
    ? origin === targetOrigin
    : referer !== null && refererOrigin(referer) === targetOrigin
  if (targetOrigin === undefined || !sourceMatches || (fetchSite !== null && fetchSite !== "same-origin")) {
    return rejected(403, "request_origin_denied")
  }

  // Next exposes a body stream even for bodyless POST/DELETE requests. Only
  // body-consuming handlers require JSON; reject simple declared types too.
  if (options.requireJson || request.headers.has("content-type")) {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase()
    if (contentType !== "application/json") return rejected(415, "json_content_type_required")
  }
  return undefined
}

function requestOrigin(request: Request): string | undefined {
  const url = new URL(request.url)
  // Next can construct Request.url using its internal listen address. The
  // HTTP Host is the browser-facing host; do not trust x-forwarded-host here.
  const host = request.headers.get("host")
  if (host === null) return url.origin
  try {
    const target = new URL(`${url.protocol}//${host}`)
    if (target.username || target.password || target.pathname !== "/" || target.search || target.hash) return undefined
    return target.origin
  } catch {
    return undefined
  }
}

function refererOrigin(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined
    return url.origin
  } catch {
    return undefined
  }
}

function rejected(status: number, code: string): Response {
  return Response.json({
    type: `https://gofitness.local/problems/${code}`,
    title: "تعذر تنفيذ الطلب",
    status,
    detail: "تعذر قبول الطلب الحالي. حدّث الصفحة ثم حاول مرة أخرى.",
    code,
  }, { status, headers: { "Cache-Control": "no-store" } })
}
