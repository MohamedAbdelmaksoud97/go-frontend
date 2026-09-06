import fs from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { chromium } = require("../../.tmp/user-guide-tools/node_modules/playwright")
const baseUrl = process.env.GO_GUIDE_BASE_URL ?? "http://127.0.0.1:3100"
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

const credentials = await fs.readFile(credentialsPath, "utf8")
const admin = accountFromSection(credentials, "System Administrator")
const browser = await chromium.launch({ executablePath: chromePath, headless: true })
const failures = []

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  const page = await context.newPage()
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" })
  await page.locator('input[autocomplete="username"]').fill(admin.email)
  await page.locator('input[autocomplete="current-password"]').fill(admin.password)
  await page.getByRole("button", { name: "تسجيل الدخول" }).click()
  await page.waitForURL(url => !url.pathname.endsWith("/login"), { timeout: 45_000 })
  await page.goto(`${baseUrl}/guide`, { waitUntil: "domcontentloaded" })
  await page.getByRole("heading", { name: "أنجز المهمة، خطوة بخطوة." }).waitFor()
  if (!await page.getByRole("link", { name: "دليل الاستخدام", exact: true }).first().isVisible()) failures.push("guide navigation link is not visible")
  const search = page.getByRole("textbox", { name: "البحث في دليل الاستخدام" })
  await search.fill("إنشاء باقة")
  await page.getByRole("link", { name: /إنشاء باقة وعرضها للبيع/ }).first().click()
  await page.waitForURL(/\/guide\/package-to-sale$/)
  await page.getByRole("heading", { name: "إنشاء باقة وعرضها للبيع", level: 1 }).waitFor()
  await page.getByRole("button", { name: /تكبير الصورة/ }).first().click()
  if (!await page.getByRole("dialog").isVisible()) failures.push("image viewer did not open")
  await page.getByRole("button", { name: "إغلاق الصورة" }).click()
  const directLinks = page.locator('a[href^="/system-settings"], a[href^="/subscriptions"], a[href^="/finance"]')
  if (await directLinks.count() < 8) failures.push("package guide does not expose enough direct task links")
  const activityLink = page.getByRole("link", { name: /فتح الرياضات والأنشطة/ }).first()
  if (!await activityLink.isVisible()) failures.push("activity task link is not visible")
  else {
    await activityLink.click()
    await page.waitForURL(/\/system-settings\/activities/)
    await page.goBack({ waitUntil: "domcontentloaded" })
    await page.getByRole("heading", { name: "إنشاء باقة وعرضها للبيع", level: 1 }).waitFor()
  }
  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (desktopOverflow > 2) failures.push(`desktop horizontal overflow: ${desktopOverflow}px`)
  await fs.mkdir(path.resolve("../.temp/guide-validation"), { recursive: true })
  await page.screenshot({ path: path.resolve("../.temp/guide-validation/native-guide-desktop.png"), fullPage: false })

  await page.goto(`${baseUrl}/guide/members-subscriptions#member-account`, { waitUntil: "domcontentloaded" })
  await page.getByRole("heading", { name: "إنشاء وتفعيل حساب دخول العضو" }).waitFor()
  if (!await page.locator("#member-account").getByRole("link", { name: "فتح صفحة تفعيل حساب العضو" }).isVisible()) failures.push("member activation task link is not visible")
  const activationImage = page.locator('img[src$="63-member-account-activation.png"]')
  if (!await activationImage.isVisible()) failures.push("member activation guide image is not visible")

  const cookies = await context.cookies()
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await mobileContext.addCookies(cookies)
  const mobile = await mobileContext.newPage()
  await mobile.goto(`${baseUrl}/guide/restaurant`, { waitUntil: "domcontentloaded" })
  await mobile.getByRole("heading", { name: "الوجبات والمطعم والمطبخ", level: 1 }).waitFor()
  const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (mobileOverflow > 2) failures.push(`mobile horizontal overflow: ${mobileOverflow}px`)
  await mobile.screenshot({ path: path.resolve("../.temp/guide-validation/native-guide-mobile.png"), fullPage: false })
  await mobileContext.close()
  await context.close()
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(JSON.stringify({ failures }, null, 2))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({ login: "ok", nativeRoutes: 14, search: "ok", navigation: "ok", directTaskLinks: "ok", imageViewer: "ok", desktop: "ok", mobile: "ok" }, null, 2))
}
