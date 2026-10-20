import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { chromium, expect } from "@playwright/test"
import { createLocalCoachingEnvironment } from "../../gosystem/tests/support/local-coaching-environment.ts"
import { seedLocalReportingData } from "../../gosystem/tests/support/local-reporting-data.ts"

const frontendRoot = fileURLToPath(new URL("../", import.meta.url))
const artifactRoot = path.join(frontendRoot, "artifacts", "report-pages-e2e")
const baseUrl = "http://127.0.0.1:3138"
await fs.mkdir(artifactRoot, { recursive: true })
const checks = [], browserErrors = [], failedResponses = [], requests = []
let environment, frontend, browser, page, cleanup, browserVersion, frontendOutput = ""
async function check(name, work) {
  const start = Date.now()
  try { await work(); checks.push({ name, passed: true, durationMs: Date.now() - start }); console.log(`PASS ${name}`) }
  catch (reason) { checks.push({ name, passed: false, error: reason.message }); await page?.screenshot({ path: path.join(artifactRoot, "failure.png"), fullPage: true }); throw reason }
}
const tableRows = () => page.locator("table:visible tbody tr")
async function contextFor(token) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addCookies([{ name: "go_access_token", value: token, url: baseUrl, httpOnly: true, sameSite: "Lax" }])
  await context.addInitScript(({ organization, branch }) => { localStorage.setItem("go-organization", organization); localStorage.setItem("go-branch", branch) }, { organization: environment.ids.organization, branch: environment.ids.branch })
  await context.route("**/*", route => { const url = new URL(route.request().url()); return ["127.0.0.1", "localhost"].includes(url.hostname) || ["data:", "blob:"].includes(url.protocol) ? route.continue() : route.abort() })
  return context
}
async function reportResponse(predicate, action) {
  const [response] = await Promise.all([page.waitForResponse(response => response.url().includes("/reports/") && response.status() === 200 && predicate(new URL(response.url()))), action()])
  return response.json()
}
async function csvDownload(name, expectedRows) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "تصدير CSV", exact: true }).click()])
  const target = path.join(artifactRoot, name)
  await download.saveAs(target)
  const csv = await fs.readFile(target, "utf8")
  assert.equal(csv.trim().split("\n").length, expectedRows + 1)
  return csv
}
try {
  environment = await createLocalCoachingEnvironment()
  const fixtures = await seedLocalReportingData(environment)
  frontend = spawn(process.execPath, [path.join(frontendRoot, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3138"], { cwd: frontendRoot, windowsHide: true, env: { ...process.env, NODE_ENV: "development", API_BASE_URL: environment.url, NEXT_PUBLIC_API_BASE_URL: environment.url, NEXT_PUBLIC_ORGANIZATION_ID: environment.ids.organization, NEXT_PUBLIC_GATE_LIVE_UPDATES_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] })
  frontend.stdout.on("data", data => { frontendOutput += data })
  frontend.stderr.on("data", data => { frontendOutput += data })
  const deadline = Date.now() + 120000
  let ready = false
  while (Date.now() < deadline) { if (frontend.exitCode !== null) throw Error(frontendOutput.slice(-3000)); try { ready = (await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(3000) })).ok } catch {} if (ready) break; await new Promise(resolve => setTimeout(resolve, 500)) }
  assert.ok(ready, "Local frontend did not start")
  browser = await chromium.launch({ headless: true }); browserVersion = browser.version()
  page = await (await contextFor(environment.tokens.admin)).newPage()
  page.setDefaultTimeout(20000)
  page.on("pageerror", error => browserErrors.push(error.message))
  page.on("response", response => { if (response.url().includes("/api/") && response.status() >= 500) failedResponses.push({ status: response.status(), path: new URL(response.url()).pathname }) })
  page.on("request", request => { if (request.url().includes("/reports/")) requests.push(new URL(request.url())) })
  await page.goto(`${baseUrl}/reports`)
  await check("opening-report-loads-a-bounded-daily-page-only", async () => {
    await expect(page.getByRole("heading", { name: "التقارير الإدارية والمالية", exact: true })).toBeVisible()
    await expect(tableRows()).toHaveCount(20)
    const data = requests.filter(url => url.pathname.includes("/api/backend/") && url.pathname.includes("/reports/"))
    assert.equal(data.length, 1); assert.equal(data[0].searchParams.get("limit"), "50"); assert.equal(data[0].searchParams.get("view"), "PAGE")
  })
  await check("subscription-summary-covers-all-123-and-next-page-does-not-fetch-summary-again", async () => {
    const first = await reportResponse(url => url.searchParams.get("reportType") === "SUBSCRIPTIONS", () => page.getByRole("tab", { name: "الاشتراكات", exact: true }).click())
    assert.equal(first.data.length, 50); assert.equal(first.meta.summary.totalRows, 123); assert.equal(first.meta.summary.sums.discountMinor, "7626")
    await expect(tableRows()).toHaveCount(50)
    const metric = page.locator(".reports-metric-card").filter({ hasText: "إجمالي الاشتراكات" })
    await expect(metric).toContainText("123")
    const next = await reportResponse(url => url.searchParams.get("offset") === "50", () => page.getByRole("button", { name: "التالي", exact: true }).click())
    assert.equal(next.data.length, 50); assert.equal(next.meta.summary, undefined)
    await expect(metric).toContainText("123"); await expect(page.getByText("الصفحة 2 من 3", { exact: true })).toBeVisible()
    assert.equal(new Set([...first.data, ...next.data].map(row => row.subscriptionId)).size, 100)
  })
  await check("search-filters-the-complete-result-and-retains-focus", async () => {
    const search = page.getByLabel("البحث في نتائج التقرير", { exact: true })
    const result = await reportResponse(url => url.searchParams.get("search") === "RPTSUB000123", () => search.fill("RPTSUB000123"))
    assert.equal(result.meta.summary.totalRows, 1); await expect(tableRows()).toHaveCount(1); await expect(search).toBeFocused()
    await reportResponse(url => !url.searchParams.has("search"), () => search.fill(""))
    const filtered = await reportResponse(url => url.searchParams.get("packageFilter") === `id:${fixtures.packageB}`, () => page.getByLabel("فلترة الاشتراكات باسم الباقة", { exact: true }).selectOption(`id:${fixtures.packageB}`))
    assert.equal(filtered.meta.summary.totalRows, 3); await expect(tableRows()).toHaveCount(3)
    const valid = await reportResponse(url => url.searchParams.get("validity") === "VALID", () => page.getByLabel("حالة سريان الاشتراك", { exact: true }).selectOption("VALID"))
    assert.equal(valid.meta.summary.totalRows, 2); await expect(tableRows()).toHaveCount(2)
  })
  await check("treasury-summary-is-complete-and-export-fetches-full-detail-only-on-demand", async () => {
    assert.equal(requests.filter(url => url.searchParams.get("limit") === "1000").length, 0)
    const result = await reportResponse(url => url.searchParams.get("reportType") === "TREASURY", () => page.getByRole("tab", { name: "الخزنة", exact: true }).click())
    assert.equal(result.meta.summary.totalRows, 123)
    assert.equal(result.meta.summary.treasurySources.find(row => row.source === "OTHER").gross, 19926)
    await expect(page.locator(".treasury-other-income-section:visible tbody tr")).toHaveCount(50)
    const csv = await csvDownload("treasury-full.csv", 123)
    assert.ok(csv.includes("Report income 001") && csv.includes("Report income 123"))
    assert.equal(requests.filter(url => url.searchParams.get("limit") === "1000").length, 1)
    await page.screenshot({ path: path.join(artifactRoot, "01-treasury.png"), fullPage: false })
  })
  await check("print-prepares-every-matching-row-before-opening-print", async () => {
    await page.evaluate(() => { window.print = () => { window.__printedReportRows = document.querySelectorAll(".hidden.print\\:block .treasury-other-income-section tbody tr").length } })
    await page.getByRole("button", { name: "طباعة التقرير", exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.__printedReportRows)).toBe(123)
  })
  await check("target-package-report-pages-searches-and-exports-its-full-filtered-scope", async () => {
    await page.goto(`${baseUrl}/reports/package/${fixtures.packageA}?from=2026-10-01&to=2026-10-20&branchId=${environment.ids.branch}&name=Report%20package%20A`)
    await expect(tableRows()).toHaveCount(50); await expect(page.getByText("الصفحة 1 من 3", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "التالي", exact: true }).click(); await expect(page.getByText("الصفحة 2 من 3", { exact: true })).toBeVisible()
    const search = page.getByLabel("البحث في التقرير المستهدف", { exact: true })
    await reportResponse(url => url.searchParams.get("search") === "RPTSUB000120", () => search.fill("RPTSUB000120"))
    await expect(tableRows()).toHaveCount(1); await csvDownload("target-filtered.csv", 1)
    await reportResponse(url => !url.searchParams.has("search"), () => search.fill(""))
    await expect(tableRows()).toHaveCount(50); await csvDownload("target-full.csv", 120)
  })
  await check("daily-pagination-and-monthly-grouping-preserve-full-period-totals", async () => {
    await page.goto(`${baseUrl}/reports`)
    await page.getByLabel("بداية فترة التقرير", { exact: true }).fill("2026-09-01")
    await page.getByLabel("نهاية فترة التقرير", { exact: true }).fill("2026-10-31")
    const daily = await reportResponse(url => url.searchParams.get("from") === "2026-09-01", () => page.getByRole("button", { name: "تطبيق الفترة", exact: true }).click())
    assert.equal(daily.meta.summary.totalRows, 61); assert.equal(daily.meta.summary.sums.collectedMinor, "26026")
    await expect(tableRows()).toHaveCount(50); await page.getByRole("button", { name: "التالي", exact: true }).click(); await expect(tableRows()).toHaveCount(11)
    await page.getByRole("tab", { name: "صافي الخزنة", exact: true }).click()
    const monthly = await reportResponse(url => url.searchParams.get("groupBy") === "MONTH", () => page.getByRole("button", { name: "شهري", exact: true }).click())
    assert.equal(monthly.data.length, 2); assert.equal(monthly.meta.summary.sums.collectedMinor, "26026")
    await expect(tableRows()).toHaveCount(2)
  })
  await check("export-failure-produces-no-partial-file-and-can-be-retried", async () => {
    let downloads = 0
    const downloaded = () => { downloads++ }
    page.on("download", downloaded)
    const failExport = route => new URL(route.request().url()).searchParams.get("limit") === "1000"
      ? route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ type: "about:blank", title: "تعذر تجهيز التقرير", status: 400, code: "invalid_report_range", detail: "أعد المحاولة." }) })
      : route.fallback()
    await page.route("**/reports/branch-daily?**", failExport)
    await page.getByRole("button", { name: "تصدير CSV", exact: true }).click()
    await expect(page.getByText("تعذر عرض التقرير", { exact: true })).toBeVisible()
    assert.equal(downloads, 0)
    await page.unroute("**/reports/branch-daily?**", failExport)
    await page.getByRole("button", { name: "إعادة المحاولة", exact: true }).click()
    await expect(tableRows()).toHaveCount(2)
    await csvDownload("monthly-full.csv", 2)
    assert.equal(downloads, 1)
    page.off("download", downloaded)
  })
  await check("report-access-and-mobile-layout-remain-scoped", async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2))
    const outsider = await (await contextFor(environment.tokens.outsider)).newPage()
    let reportRequests = 0
    outsider.on("request", request => { if (request.url().includes("/api/backend/") && request.url().includes("/reports/")) reportRequests++ })
    await outsider.goto(`${baseUrl}/reports`)
    await expect(outsider).toHaveURL(`${baseUrl}/self-service`)
    assert.equal(reportRequests, 0)
  })
  assert.deepEqual(browserErrors, []); assert.deepEqual(failedResponses, [])
} catch (reason) { console.error(reason.stack ?? reason.message); process.exitCode = 1 }
finally {
  if (browser) await browser.close()
  if (frontend && frontend.exitCode === null) {
    if (process.platform === "win32") { const killer = spawn("taskkill", ["/PID", String(frontend.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); await once(killer, "exit").catch(() => {}) }
    else { frontend.kill("SIGTERM"); await Promise.race([once(frontend, "exit"), new Promise(resolve => setTimeout(resolve, 5000))]) }
  }
  if (environment) { try { cleanup = await environment.cleanup(); assert.equal(cleanup.remainingTestTables, 0); console.log("CLEANUP verified: no test data remain") } catch (reason) { cleanup = { error: reason.message }; process.exitCode = 1 } }
  if (!process.exitCode) await fs.rm(path.join(artifactRoot, "failure.png"), { force: true })
  await fs.writeFile(path.join(artifactRoot, "frontend.log"), frontendOutput, "utf8")
  await fs.writeFile(path.join(artifactRoot, "report.json"), JSON.stringify({ runAt: new Date().toISOString(), browser: "Playwright Chromium", browserVersion, database: "isolated local PostgreSQL (PGlite), real migrations, HTTP routes and business services", checks, browserErrors, failedResponses, cleanup, passed: !process.exitCode && checks.every(check => check.passed) }, null, 2), "utf8")
}
