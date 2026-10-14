import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const port = 3147;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: new URL("..", import.meta.url), windowsHide: true,
  env: { ...process.env, API_BASE_URL: "http://127.0.0.1:1", NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
for (const stream of [server.stdout, server.stderr]) stream.on("data", chunk => { output = (output + chunk).slice(-4000); });

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Next exited before readiness: ${output}`);
    try { ready = (await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await delay(200);
  }
  assert.ok(ready, `Next did not become ready: ${output}`);
  for (const path of ["/privacy", "/support"]) {
    const response = await fetch(`${origin}${path}`, { redirect: "manual" });
    assert.equal(response.status, 200, `${path} must be available without a session`);
    const html = await response.text();
    assert.ok(html.includes("mailto:Go.fitness.zulfi@gmail.com"), `${path} must expose the actual support contact`);
    assert.equal(response.headers.get("set-cookie"), null, "Legal pages must not create a session");
  }
  const protectedPage = await fetch(`${origin}/account`, { redirect: "manual" });
  assert.equal(protectedPage.status, 307);
  assert.ok(protectedPage.headers.get("location").includes("/login"));
  console.log("Public privacy/support pages return 200 without authentication; account page remains protected.");
} finally {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else {
    server.kill();
  }
  if (server.exitCode === null) await once(server, "exit");
  server.stdout.destroy();
  server.stderr.destroy();
}
