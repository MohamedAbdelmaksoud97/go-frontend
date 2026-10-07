import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"

// Run after npm run build. Use a separate local port and no real auth provider.
const listener = createServer()
listener.listen(0, "127.0.0.1")
await once(listener, "listening")
const port = listener.address().port
await new Promise(resolve => listener.close(resolve))
const origin = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: new URL("..", import.meta.url), windowsHide: true,
  env: { ...process.env, API_BASE_URL: "http://127.0.0.1:1", NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
})
let output = ""
for (const stream of [server.stdout, server.stderr]) stream.on("data", chunk => { output = (output + chunk).slice(-4000) })

try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Next exited before readiness: ${output}`)
    try { ready = (await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1000) })).ok } catch {}
    if (ready) break
    await delay(200)
  }
  assert.ok(ready, `Next did not become ready: ${output}`)

  for (const [path, method] of [
    ["/api/session", "POST"], ["/api/session", "DELETE"], ["/api/session/refresh", "POST"],
    ["/api/login/staff", "POST"], ["/api/backend/api/v1/me", "POST"],
  ]) {
    const response = await fetch(`${origin}${path}`, {
      method, headers: { origin: "https://attacker.example", "content-type": "application/json" }, body: "{}",
    })
    assert.equal(response.status, 403, `${method} ${path}`)
    assert.equal(response.headers.get("set-cookie"), null)
  }
  const plain = await fetch(`${origin}/api/session`, {
    method: "POST", headers: { origin, "content-type": "text/plain" }, body: JSON.stringify({ accessToken: "test-token" }),
  })
  assert.equal(plain.status, 415)
  assert.equal(plain.headers.get("set-cookie"), null)

  const legitimate = await fetch(`${origin}/api/session`, {
    method: "POST", headers: { origin, "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ accessToken: "local-test-token", refreshToken: "local-test-refresh" }),
  })
  assert.equal(legitimate.status, 200)
  assert.match(legitimate.headers.get("set-cookie"), /HttpOnly/i)
  assert.match(legitimate.headers.get("set-cookie"), /SameSite=lax/i)

  const logout = await fetch(`${origin}/api/session`, { method: "DELETE", headers: { origin } })
  assert.equal(logout.status, 204)
  console.log("Production HTTP CSRF checks passed: foreign mutations and plain-text JSON rejected; same-origin session save and logout accepted.")
} finally {
  server.kill()
  if (server.exitCode === null) await once(server, "exit")
}
