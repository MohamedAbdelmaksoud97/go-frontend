import fs from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { chromium } = require("../../.tmp/user-guide-tools/node_modules/playwright")
const baseUrl = process.env.GO_GUIDE_BASE_URL ?? "http://localhost:3000"
const credentialsPath = process.env.GO_GUIDE_CREDENTIALS ?? "C:/Users/MF/Desktop/manual-test-credentials.local.md"
const chromePath = process.env.GO_GUIDE_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe"

function accountFromSection(source, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const section = source.match(new RegExp(`###\\s+${escaped}([\\s\\S]*?)(?=\\n###\\s+|$)`, "u"))?.[1] ?? ""
  const clean = value => value?.trim().replace(/^[`<]+|[`>]+$/gu, "")
  const email = clean(section.match(/\*\*البريد:\*\*\s*([^\s]+)/u)?.[1])
  const password = clean(section.match(/\*\*كلمة المرور:\*\*\s*(.+)/u)?.[1])
  if (!email || !password) throw new Error(`بيانات حساب ${title} غير مكتملة.`)
  return { email, password }
}

async function login(page, account, member = false) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" })
  if (member) {
    await page.getByRole("tab", { name: "عضو / ولي أمر" }).click()
    const testLogin = page.getByRole("button", { name: /للاختبار فقط/ })
    if (await testLogin.isVisible()) await testLogin.click()
  }
  await page.locator('input[autocomplete="username"]').fill(account.email)
  await page.locator('input[autocomplete="current-password"]').fill(account.password)
  await page.getByRole("button", { name: "تسجيل الدخول" }).click()
  await page.waitForURL(url => !url.pathname.endsWith("/login"), { timeout: 45_000 })
}

async function verifyRoutes(page, routes, audience, failures) {
  for (const route of routes) {
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(error => {
      failures.push(`${audience} ${route}: ${error.message}`)
      return undefined
    })
    if (!response) continue
    await page.waitForTimeout(250)
    const pathname = new URL(page.url()).pathname
    if (response.status() >= 400 || pathname === "/forbidden" || pathname === "/not-found" || pathname === "/login") {
      failures.push(`${audience} ${route}: HTTP ${response.status()} -> ${pathname}`)
    }
  }
}

const source = await fs.readFile(path.resolve("lib/system-guide-content.ts"), "utf8")
const links = [...new Set([...source.matchAll(/href:\s*"([^"]+)"/gu)].map(match => match[1]))]
const images = [...new Set([...source.matchAll(/shot\("([^"]+)"/gu)].map(match => match[1]))]
const missingImages = []
for (const image of images) {
  await fs.access(path.resolve("public/guide/screenshots", image)).catch(() => missingImages.push(image))
}

const credentials = await fs.readFile(credentialsPath, "utf8")
const admin = accountFromSection(credentials, "System Administrator")
const member = accountFromSection(credentials, "عضو تجريبي")
const browser = await chromium.launch({ executablePath: chromePath, headless: true })
const failures = missingImages.map(image => `missing image: ${image}`)

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  await login(page, admin)
  await verifyRoutes(page, links.filter(link => !link.startsWith("/self-service")), "admin", failures)
  await context.clearCookies()
  await login(page, member, true)
  await verifyRoutes(page, links.filter(link => link.startsWith("/self-service")), "member", failures)
  await context.close()
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(JSON.stringify({ failures }, null, 2))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({ links: links.length, images: images.length, adminRoutes: links.filter(link => !link.startsWith("/self-service")).length, memberRoutes: links.filter(link => link.startsWith("/self-service")).length, status: "ok" }, null, 2))
}
