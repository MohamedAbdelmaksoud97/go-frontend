import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import { rejectUnsafeRequest } from "../lib/request-security.ts"

const origin = "https://fitness.example.com"

function request(method = "POST", headers = {}, body = "{}") {
  return new Request(`${origin}/api/session`, {
    method,
    headers,
    ...(body === undefined || ["GET", "HEAD"].includes(method) ? {} : { body }),
  })
}

test("same-origin JSON requests and bodyless mutations are allowed", () => {
  assert.equal(rejectUnsafeRequest(request("POST", { origin, "content-type": "application/json; charset=utf-8", "sec-fetch-site": "same-origin" })), undefined)
  assert.equal(rejectUnsafeRequest(request("POST", { referer: `${origin}/account`, "content-type": "application/json" })), undefined)
  assert.equal(rejectUnsafeRequest(new Request(`${origin}/api/session/refresh`, { method: "POST", headers: { origin } })), undefined)
  assert.equal(rejectUnsafeRequest(new Request(`${origin}/api/session`, { method: "DELETE", headers: { origin } })), undefined)
  assert.equal(rejectUnsafeRequest(request("GET")), undefined)
})

test("uses the public Host when Next's URL contains an internal listen address", () => {
  const req = new Request("https://localhost:3000/api/session", {
    method: "POST", headers: { host: "fitness.example.com", origin, "content-type": "application/json" }, body: "{}",
  })
  assert.equal(rejectUnsafeRequest(req), undefined)
})

test("an attacker-controlled forwarded host cannot change the allowed origin", () => {
  const req = request("POST", { host: "fitness.example.com", origin: "https://attacker.example", "x-forwarded-host": "attacker.example", "content-type": "application/json" })
  assert.equal(rejectUnsafeRequest(req)?.status, 403)
})

test("malformed Host and Referer values fail closed", () => {
  assert.equal(rejectUnsafeRequest(request("POST", { host: "invalid host", referer: "invalid url", "content-type": "application/json" }))?.status, 403)
})

for (const headers of [
  {}, { "sec-fetch-site": "same-origin" }, { origin: "null", referer: `${origin}/account` },
  { origin: "https://attacker.example" }, { referer: "https://attacker.example/page" },
  { origin: "https://other.example.com", "sec-fetch-site": "same-site" },
  { origin, "sec-fetch-site": "cross-site" }, { origin: `${origin}/pretend-origin` },
  { referer: "invalid url" }, { referer: `https://user:password@fitness.example.com/account` },
]) {
  test(`denies untrusted or missing source headers: ${JSON.stringify(headers)}`, () => {
    assert.equal(rejectUnsafeRequest(request("POST", { ...headers, "content-type": "application/json" }))?.status, 403)
  })
}

for (const contentType of [undefined, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
  test(`denies simple/non-JSON content type: ${contentType}`, () => {
    assert.equal(rejectUnsafeRequest(request("POST", { origin, ...(contentType ? { "content-type": contentType } : {}) }), { requireJson: true })?.status, 415)
  })
}

const routes = [
  ["app/api/session/route.ts", "POST"], ["app/api/session/route.ts", "DELETE"],
  ["app/api/session/refresh/route.ts", "POST"], ["app/api/login/[audience]/route.ts", "POST"],
  ...["POST", "PATCH", "PUT", "DELETE"].map(method => ["app/api/backend/[...path]/route.ts", method]),
]

for (const [path, method] of routes) {
  test(`${method} ${path} rejects a foreign origin before accessing cookies or providers`, async () => {
    const fixture = loadRoute(path)
    const response = await fixture.route[method](request(method, { origin: "https://attacker.example", "content-type": "application/json" }), routeParams())
    assert.equal(response.status, 403)
    assert.equal((await response.json()).code, "request_origin_denied")
    assert.deepEqual(fixture.effects, [])
  })
}

for (const path of ["app/api/session/route.ts", "app/api/login/[audience]/route.ts", "app/api/backend/[...path]/route.ts"]) {
  test(`${path} rejects a text/plain JSON payload before writing cookies or forwarding`, async () => {
    const fixture = loadRoute(path)
    const response = await fixture.route.POST(request("POST", { origin, "content-type": "text/plain" }, JSON.stringify({ accessToken: "attacker-token", refreshToken: "attacker-refresh" })), routeParams())
    assert.equal(response.status, 415)
    assert.deepEqual(fixture.effects, [])
  })
}

for (const [path, method] of routes) {
  test(`${method} ${path} preserves legitimate same-origin behavior`, async () => {
    const fixture = loadRoute(path)
    const body = method === "DELETE" || path.includes("/refresh/") ? undefined : JSON.stringify({ accessToken: "access", refreshToken: "refresh" })
    const req = new Request(`${origin}/api/test`, { method, headers: { origin, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body } : {}) })
    const response = await fixture.route[method](req, routeParams())
    assert.equal(response.status, path === "app/api/session/route.ts" && method === "DELETE" ? 204 : 200)
    assert.ok(fixture.effects.length > 0)
  })
}

test("backend GET continues to work without CSRF headers", async () => {
  const fixture = loadRoute("app/api/backend/[...path]/route.ts")
  const response = await fixture.route.GET(request("GET"), routeParams())
  assert.equal(response.status, 200)
})

function routeParams() {
  return { params: Promise.resolve({ audience: "staff", path: ["api", "v1", "me"] }) }
}

// Execute the actual route handlers with only Next's request-bound cookie store
// and external providers replaced. A missing guard exposes side effects here.
function loadRoute(path) {
  const effects = []
  const testModule = { exports: {} }
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const cookieStore = {
    get: name => ({ value: name === "go_access_token" ? "access" : "refresh" }),
    set: name => effects.push(`set:${name}`),
    delete: name => effects.push(`delete:${name}`),
  }
  runInNewContext(code, {
    module: testModule, exports: testModule.exports, Response, Request, Headers, URL,
    process: { env: { API_BASE_URL: "http://backend.example" } },
    fetch: async () => {
      effects.push("fetch")
      return Response.json({ data: { accessToken: "access", refreshToken: "refresh", expiresIn: 3600 } })
    },
    require: name => {
      if (name === "@/lib/request-security") return { rejectUnsafeRequest }
      if (name === "next/server") return { NextResponse: Response }
      if (name === "next/headers") return { cookies: async () => { effects.push("cookies"); return cookieStore } }
      if (name === "@/lib/api-problem") return { toPublicApiProblem: (payload, status) => ({ ...payload, status }) }
      if (name === "@/lib/server-session") return {
        accessTokenCookieOptions: () => ({}), refreshTokenCookieOptions: {},
        refreshSessionOnce: async () => { effects.push("refresh"); return { ok: true, session: { accessToken: "access", refreshToken: "refresh" } } },
      }
      throw new Error(`Unexpected dependency: ${name}`)
    },
  }, { filename: path })
  return { route: testModule.exports, effects }
}
