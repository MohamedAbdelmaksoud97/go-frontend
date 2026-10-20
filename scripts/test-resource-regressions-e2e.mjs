import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { chromium, expect as playwrightExpect } from "@playwright/test"
import { createLocalCoachingEnvironment } from "../../gosystem/tests/support/local-coaching-environment.ts"
import { seedLocalResourceData, addLocalResourceNotification } from "../../gosystem/tests/support/local-resource-data.ts"

const frontendRoot = fileURLToPath(new URL("../", import.meta.url))
const artifactRoot = path.join(frontendRoot, "artifacts", "resource-regressions-e2e")
const baseUrl = "http://127.0.0.1:3139"
const expect = playwrightExpect.configure({ timeout: 25000 })
const checks = [], browserErrors = [], failedResponses = [], metrics = {}
let environment, fixtures, frontend, browser, page, cleanup, browserVersion, frontendOutput = ""
await fs.mkdir(artifactRoot, { recursive: true })
async function check(name, work) {
  const start = Date.now()
  try { await work(); checks.push({ name, passed: true, durationMs: Date.now() - start }); console.log(`PASS ${name}`) }
  catch (error) {
    checks.push({ name, passed: false, error: error.message })
    await page?.screenshot({ path: path.join(artifactRoot, "failure.png"), fullPage: true }).catch(() => {})
    if (page) await fs.writeFile(path.join(artifactRoot, "failure.txt"), await page.locator("main").innerText().catch(() => ""), "utf8")
    throw error
  }
}
const orgPath = () => `/organizations/${environment.ids.organization}`
async function api(relative, method = "GET", body, expected = 200, token = environment.tokens.admin) {
  const response = await fetch(`${environment.url}/api/v1${relative}`, { method, headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": randomUUID(), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const result = await response.json()
  assert.equal(response.status, expected, JSON.stringify(result)); return result
}
async function contextFor(token = environment.tokens.admin, clock = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addCookies([{ name: "go_access_token", value: token, url: baseUrl, httpOnly: true, sameSite: "Lax" }])
  await context.addInitScript(({ organization, branch }) => {
    localStorage.setItem("go-organization", organization); localStorage.setItem("go-branch", branch)
  }, { organization: environment.ids.organization, branch: environment.ids.branch })
  await context.route("**/*", route => { const url = new URL(route.request().url()); return ["127.0.0.1", "localhost"].includes(url.hostname) || ["data:", "blob:"].includes(url.protocol) ? route.continue() : route.abort() })
  const target = await context.newPage()
  if (clock) await target.clock.install({ time: new Date() })
  // Install this observer after Playwright installs its clock, which replaces setInterval.
  await context.addInitScript(() => {
    // Observe registration times without changing callbacks, periods or the scheduler.
    window.__resourceIntervals = []
    const original = window.setInterval.bind(window)
    window.setInterval = (callback, delay, ...args) => {
      if (delay === 60000 || delay === 300000) window.__resourceIntervals.push({ delay, registeredAt: Date.now() })
      return original(callback, delay, ...args)
    }
  })
  target.setDefaultTimeout(25000)
  const requests = []
  target.on("request", request => { if (request.url().includes("/api/backend/")) requests.push(new URL(request.url())) })
  target.on("pageerror", error => browserErrors.push(error.message))
  target.on("response", response => { if (response.status() >= 500 && response.url().includes("/api/")) failedResponses.push({ status: response.status(), path: new URL(response.url()).pathname }) })
  return { context, page: target, requests }
}
const tableRows = () => page.locator("table:visible tbody tr")
async function searchSubscription(number) {
  await page.getByPlaceholder("ابحث باسم العضو أو رقم الهوية أو رقم الهاتف أو رقم الاشتراك...").fill(number)
  await expect(tableRows()).toHaveCount(1)
  await expect(tableRows().first()).toContainText(number)
}
async function changeSubscription(button, suffix, fill) {
  await page.getByRole("button", { name: button, exact: true }).click()
  const dialog = page.getByRole("dialog")
  if (fill) await fill(dialog)
  const submit = suffix === "freezes" ? "تأكيد التجميد الآن" : suffix === "resumptions" ? "استئناف الاشتراك" : /تأكيد.*الإلغاء/
  const [response] = await Promise.all([page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/${suffix}`)), dialog.getByRole("button", { name: submit, exact: typeof submit === "string" }).click()])
  assert.equal(response.status(), 201, await response.text())
  await expect(dialog).toHaveCount(0)
  return response.json()
}
async function pauseClock(target) { await target.clock.pauseAt(new Date(await target.evaluate(() => Date.now()) + 200)) }
async function reachTime(target, time) { const remaining = time - await target.evaluate(() => Date.now()); if (remaining > 0) await target.clock.fastForward(remaining) }

try {
  environment = await createLocalCoachingEnvironment()
  fixtures = await seedLocalResourceData(environment)
  frontend = spawn(process.execPath, [path.join(frontendRoot, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3139"], { cwd: frontendRoot, windowsHide: true, env: { ...process.env, NODE_ENV: "development", API_BASE_URL: environment.url, NEXT_PUBLIC_API_BASE_URL: environment.url, NEXT_PUBLIC_ORGANIZATION_ID: environment.ids.organization, NEXT_PUBLIC_GATE_LIVE_UPDATES_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] })
  frontend.stdout.on("data", data => { frontendOutput += data })
  frontend.stderr.on("data", data => { frontendOutput += data })
  const deadline = Date.now() + 120000
  let ready = false
  while (Date.now() < deadline) { if (frontend.exitCode !== null) throw Error(frontendOutput.slice(-3000)); try { ready = (await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(3000) })).ok } catch {} if (ready) break; await new Promise(resolve => setTimeout(resolve, 500)) }
  assert.ok(ready, "Local frontend did not start")
  browser = await chromium.launch({ headless: true }); browserVersion = browser.version()
  let session = await contextFor(); page = session.page
  await page.goto(`${baseUrl}/subscriptions`)
  await check("subscription-pages-retain-members-policies-and-cursor-order", async () => {
    await expect(tableRows()).toHaveCount(25)
    const first = await tableRows().allTextContents()
    assert.ok(first.every(row => row.includes("متدرب اختبار أول")))
    await page.getByRole("button", { name: "الصفحة التالية", exact: true }).click()
    await expect(page.getByText("عرض 25 سجلًا · الصفحة 2", { exact: true })).toBeVisible()
    await expect(tableRows()).toHaveCount(25)
    const second = await tableRows().allTextContents()
    assert.equal(new Set([...first, ...second]).size, 50)
    assert.ok(session.requests.filter(url => url.pathname.endsWith("/subscriptions")).every(url => url.searchParams.get("limit") === "25"))
    const rich = fixtures.subscriptions[0]
    await searchSubscription(rich.state.subscriptionNumber)
    const loaded = (await api(`${orgPath()}/subscriptions/${rich.state.id}`)).data
    assert.equal(loaded.entitlements.length, 1); assert.equal(loaded.accessPeriods.length, 3)
    assert.equal(loaded.freezePeriods.length, 1); assert.equal(loaded.freezeSchedules.length, 1); assert.equal(loaded.adjustments.length, 2)
    await expect(page.getByRole("button", { name: "إدارة التجميد المجدول", exact: true })).toBeEnabled()
    await expect(page.getByRole("button", { name: "تجديد هذا الاشتراك وفق سياسة الباقة", exact: true })).toBeDisabled()
  })
  await check("freeze-and-resume-update-the-list-and-full-persisted-history", async () => {
    const value = fixtures.subscriptions[1]; await searchSubscription(value.state.subscriptionNumber)
    await changeSubscription("تجميد هذا الاشتراك", "freezes", async dialog => { await dialog.getByLabel(/عدد أيام التجميد/).fill("2"); await dialog.getByLabel(/سبب التجميد/).fill("اختبار تجميد بعد تحسين الموارد") })
    await expect(page.getByRole("button", { name: "استئناف هذا الاشتراك", exact: true })).toBeEnabled()
    const frozen = (await api(`${orgPath()}/subscriptions/${value.state.id}`)).data
    assert.equal(frozen.status, "FROZEN"); assert.equal(frozen.freezePeriods.length, 1)
    await changeSubscription("استئناف هذا الاشتراك", "resumptions")
    await expect(page.getByRole("button", { name: "تجميد هذا الاشتراك", exact: true })).toBeEnabled()
    const resumed = (await api(`${orgPath()}/subscriptions/${value.state.id}`)).data
    assert.equal(resumed.status, "ACTIVE"); assert.equal(resumed.accessPeriods.length, 2); assert.ok(resumed.freezePeriods[0].resumedAt)
  })
  await check("renewal-policy-dialog-and-cancellation-preview-remain-correct", async () => {
    await page.getByRole("button", { name: "تجديد هذا الاشتراك وفق سياسة الباقة", exact: true }).click()
    const renewal = page.locator("form").filter({ has: page.getByRole("heading", { name: "تجديد الاشتراك", exact: true }) })
    await expect(renewal).toContainText("تجديد مالي كامل دون فقد المدة المتبقية")
    await renewal.getByRole("button", { name: "إغلاق", exact: true }).click()
    await page.getByRole("button", { name: "إلغاء هذا الاشتراك وفق سياسة الباقة", exact: true }).click()
    const dialog = page.locator("form").filter({ has: page.getByRole("heading", { name: "إلغاء الاشتراك", exact: true }) })
    await expect(dialog).toContainText("الأثر قبل التأكيد")
    await expect(dialog).toContainText("إلغاء في نهاية مدة الاشتراك")
    await dialog.getByLabel(/سبب الإلغاء/).fill("اختبار إلغاء بعد تحسين الموارد")
    const [response] = await Promise.all([page.waitForResponse(response => response.url().endsWith("/cancellations") && response.request().method() === "POST"), dialog.locator('button[type="submit"]').click()])
    assert.equal(response.status(), 201, await response.text()); await expect(dialog).toHaveCount(0)
    const cancelled = (await api(`${orgPath()}/subscriptions/${fixtures.subscriptions[1].state.id}`)).data
    assert.equal(cancelled.cancellationRequest.mode, "END_OF_TERM"); assert.equal(cancelled.status, "ACTIVE")
    await expect(page.getByRole("button", { name: "إلغاء هذا الاشتراك وفق سياسة الباقة", exact: true })).toHaveCount(0)
  })
  await check("attendance-consumes-the-chosen-subscription-on-the-local-database", async () => {
    const subscriptionId = fixtures.subscriptions[2].state.id
    const attempt = (await api(`${orgPath()}/attendance-attempts`, "POST", { branchId: environment.ids.branch, memberId: environment.ids.member, subscriptionId, serviceId: fixtures.accessService }, 201)).data
    assert.equal(attempt.decision, "ACCEPTED"); assert.equal(attempt.subscriptionId, subscriptionId)
    assert.equal((await api(`${orgPath()}/subscriptions/${subscriptionId}`)).data.visitsUsed, 1)
    await page.goto(`${baseUrl}/attendance`); await expect(tableRows()).toHaveCount(1)
  })
  await check("subscriptions-remain-scoped-by-branch-and-permission", async () => {
    const scoped = await contextFor(environment.tokens.coach); page = scoped.page
    await page.goto(`${baseUrl}/subscriptions`); await expect(tableRows()).toHaveCount(25)
    await page.getByPlaceholder("ابحث باسم العضو أو رقم الهوية أو رقم الهاتف أو رقم الاشتراك...").fill(fixtures.otherSubscription.state.subscriptionNumber)
    await expect(page.getByText("لا توجد نتائج", { exact: true })).toBeVisible()
    await api(`${orgPath()}/subscriptions?branchId=${environment.ids.otherBranch}`, "GET", undefined, 403, environment.tokens.coach)
    await api(`${orgPath()}/subscriptions`, "GET", undefined, 403, environment.tokens.outsider)
    await scoped.context.close()
  })
  await check("notifications-poll-at-five-minutes-and-marking-read-still-persists", async () => {
    session = await contextFor(environment.tokens.admin, true); page = session.page
    await page.goto(`${baseUrl}/subscriptions`); await expect(tableRows()).toHaveCount(25)
    const isInbox = url => url.pathname.endsWith("/me/account-notifications") && url.searchParams.get("limit") === "5"
    await expect.poll(() => session.requests.filter(isInbox).length).toBe(1)
    await pauseClock(page)
    const interval = await page.evaluate(() => window.__resourceIntervals.find(item => item.delay === 300000))
    assert.ok(interval)
    await addLocalResourceNotification(environment, "إشعار الموارد بعد خمس دقائق")
    await reachTime(page, interval.registeredAt + 299000)
    assert.equal(session.requests.filter(isInbox).length, 1)
    await reachTime(page, interval.registeredAt + 301000)
    await expect.poll(() => session.requests.filter(isInbox).length).toBe(2)
    await expect.poll(() => session.requests.filter(url => url.pathname.endsWith("/unread-count")).length).toBe(2)
    await page.clock.resume()
    await page.getByRole("button", { name: "الإشعارات", exact: true }).click()
    await expect(page.getByText("إشعار الموارد بعد خمس دقائق", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "قراءة الكل", exact: true }).click()
    await expect(page.getByText("لا توجد رسائل جديدة", { exact: true })).toBeVisible()
    assert.equal((await api("/me/account-notifications/unread-count")).data.unreadCount, 0)
    metrics.notifications = { intervalMs: 300000, initialInboxRequests: 1, inboxRequestsBeforeDeadline: 1, inboxRequestsAfterDeadline: 2 }
    await session.context.close()
  })
  let orderId
  await check("kitchen-orders-and-menu-refresh-once-per-minute-with-new-live-database-data", async () => {
    session = await contextFor(environment.tokens.admin, true); page = session.page
    await page.goto(`${baseUrl}/restaurant`)
    await page.getByRole("button", { name: "المطبخ", exact: true }).click()
    await expect(page.getByRole("heading", { name: "طلبات جديدة", exact: true })).toBeVisible()
    // Wait for the initial queue to finish, rather than advancing time while
    // its overlap guard is correctly suppressing another refresh.
    await expect(page.getByRole("button", { name: "تحديث الطلبات", exact: true })).toBeEnabled()
    const isQueue = url => url.pathname.endsWith("/restaurant-orders")
    await expect.poll(() => session.requests.filter(isQueue).length).toBe(3)
    await pauseClock(page)
    const intervals = await page.evaluate(() => window.__resourceIntervals.filter(item => item.delay === 60000))
    assert.equal(intervals.length, 2)
    orderId = (await api(`${orgPath()}/restaurant-orders/meal-plan-redemptions`, "POST", { branchId: environment.ids.branch, memberId: environment.ids.member, subscriptionId: fixtures.mealSubscription.state.id, mealId: fixtures.mealId, quantity: 1 }, 201)).data.id
    const menuRequestsBefore = session.requests.filter(url => url.pathname.endsWith(`/daily-menus/${fixtures.businessDate}`)).length
    await reachTime(page, Math.min(...intervals.map(item => item.registeredAt)) + 59000)
    assert.equal(session.requests.filter(isQueue).length, 3)
    await expect(page.locator("article")).toHaveCount(0)
    await reachTime(page, Math.max(...intervals.map(item => item.registeredAt)) + 61000)
    await expect.poll(() => session.requests.filter(isQueue).length, { timeout: 25000 }).toBe(6)
    await expect.poll(() => session.requests.filter(url => url.pathname.endsWith(`/daily-menus/${fixtures.businessDate}`)).length).toBe(menuRequestsBefore + 1)
    await page.clock.resume()
    await expect(page.locator("article")).toHaveCount(1)
    await expect(page.locator("article")).toContainText("وجبة اختبار الموارد")
    metrics.kitchen = { intervalMs: 60000, queueRequestsBeforeDeadline: 3, queueRequestsAfterDeadline: 6, additionalMenuRequests: 1 }
  })
  await check("kitchen-preparation-delivery-and-meal-entitlement-consumption-still-work", async () => {
    for (const [label, status] of [["بدء التحضير", "PREPARING"], ["جاهز للاستلام", "READY"], ["تسليم وإكمال", "COMPLETED"]]) {
      const [response] = await Promise.all([page.waitForResponse(response => response.url().endsWith(`/${orderId}/transitions`) && response.request().method() === "POST"), page.locator("article").getByRole("button", { name: label, exact: true }).click()])
      assert.equal(response.status(), 201, await response.text()); assert.equal((await response.json()).data.status, status)
    }
    await expect(page.locator("article")).toHaveCount(0)
    const subscription = (await api(`${orgPath()}/subscriptions/${fixtures.mealSubscription.state.id}`)).data
    assert.equal(subscription.visitsUsed, 1); assert.equal(subscription.entitlements[0].visitsUsed, 1)
    await session.context.close()
  })
  await check("gates-do-not-stream-or-poll-and-manual-refresh-and-reload-show-new-data", async () => {
    session = await contextFor(environment.tokens.admin, true); page = session.page
    await page.goto(`${baseUrl}/access-control`)
    await expect(page.getByRole("heading", { name: "البوابات والبصمة", exact: true })).toBeVisible()
    await expect(page.getByText("بوابة اختبار الموارد", { exact: true })).toBeVisible()
    await expect(page.getByText("تحديث يدوي", { exact: true })).toBeVisible()
    const gateCount = () => session.requests.filter(url => /\/access-devices$|\/access-device-events$/.test(url.pathname)).length
    const initial = gateCount()
    await pauseClock(page)
    await environment.pg.query("update app.access_devices set name='بوابة بعد التحديث اليدوي' where id=$1", [fixtures.deviceId])
    await page.clock.fastForward(60000)
    assert.equal(gateCount(), initial); assert.equal(session.requests.filter(url => url.pathname.endsWith("/stream")).length, 0)
    await expect(page.getByText("بوابة اختبار الموارد", { exact: true })).toBeVisible()
    await page.clock.resume()
    await page.getByRole("button", { name: "تحديث", exact: true }).click()
    await expect(page.getByText("بوابة بعد التحديث اليدوي", { exact: true })).toBeVisible()
    await environment.pg.query("update app.access_devices set name='بوابة بعد إعادة تحميل الصفحة' where id=$1", [fixtures.deviceId])
    await page.reload(); await expect(page.getByText("بوابة بعد إعادة تحميل الصفحة", { exact: true })).toBeVisible()
    metrics.gates = { streamRequests: 0, additionalPeriodicRequestsInOneMinute: 0, manualRefreshVerified: true, pageReloadVerified: true }
    await page.screenshot({ path: path.join(artifactRoot, "01-manual-gates.png"), fullPage: false })
    await session.context.close()
  })
  await check("main-system-pages-open-without-browser-or-server-errors", async () => {
    session = await contextFor(); page = session.page
    const paths = ["/", "/members", "/subscriptions", "/attendance", "/restaurant", "/access-control", "/finance", "/cashier", "/reports", "/audit", "/operations", "/notifications"]
    for (const target of paths) {
      const response = await page.goto(baseUrl + target)
      assert.equal(response.status(), 200, target)
      await expect(page.locator("main h1").first()).toBeVisible()
      await expect(page.getByText("تعذر تحميل البيانات. حاول مرة أخرى.", { exact: true })).toHaveCount(0)
    }
    metrics.smokePages = paths
    await page.screenshot({ path: path.join(artifactRoot, "02-notifications.png"), fullPage: false })
  })
  assert.deepEqual(browserErrors, []); assert.deepEqual(failedResponses, [])
} catch (error) { console.error(error.stack ?? error.message); process.exitCode = 1 }
finally {
  if (browser) await browser.close()
  if (frontend && frontend.exitCode === null) {
    if (process.platform === "win32") { const killer = spawn("taskkill", ["/PID", String(frontend.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); await once(killer, "exit").catch(() => {}) }
    else { frontend.kill("SIGTERM"); await Promise.race([once(frontend, "exit"), new Promise(resolve => setTimeout(resolve, 5000))]) }
  }
  if (environment) { try { cleanup = await environment.cleanup(); assert.equal(cleanup.remainingTestTables, 0); console.log("CLEANUP verified: no test tables or data remain") } catch (error) { cleanup = { error: error.message }; process.exitCode = 1 } }
  if (!process.exitCode) for (const name of ["failure.png", "failure.txt"]) await fs.rm(path.join(artifactRoot, name), { force: true })
  await fs.writeFile(path.join(artifactRoot, "frontend.log"), frontendOutput, "utf8")
  await fs.writeFile(path.join(artifactRoot, "report.json"), JSON.stringify({ runAt: new Date().toISOString(), browser: "Playwright Chromium", browserVersion, database: "isolated local PostgreSQL (PGlite), real migrations, SQL, HTTP routes and business services; test-only token verifier", checks, metrics, browserErrors, failedResponses, cleanup, limitations: ["Local development build, not production hosting or billing", "Supabase Auth provider and physical gate hardware are outside this local test", "Renewal dialog is exercised in Chromium; renewal persistence is covered by the backend integration suite"], passed: !process.exitCode && checks.length > 0 && checks.every(item => item.passed) }, null, 2), "utf8")
}
