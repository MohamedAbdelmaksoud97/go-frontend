import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { chromium, expect } from "@playwright/test"
import { createLocalCoachingEnvironment } from "../../gosystem/tests/support/local-coaching-environment.ts"

const frontendRoot = fileURLToPath(new URL("../", import.meta.url))
const artifactRoot = path.join(frontendRoot, "artifacts", "coaching-e2e")
await fs.mkdir(artifactRoot, { recursive: true })
const checks = [], browserErrors = [], failedResponses = []
let environment, frontend, browser, activePage, cleanup, frontendOutput = "", browserVersion = ""
const baseUrl = "http://127.0.0.1:3137"
let coachId, secondCoachId, templateId, ownPlanId, administrativePlanId
const planName = "خطة متابعة تجريبية"
async function check(name, work) {
  const start = Date.now()
  try { await work(); checks.push({ name, passed: true, durationMs: Date.now() - start }); console.log(`PASS ${name}`) }
  catch (error) { checks.push({ name, passed: false, error: error.message, durationMs: Date.now() - start }); if (activePage) await activePage.screenshot({ path: path.join(artifactRoot, "failure.png"), fullPage: true }).catch(() => {}); throw error }
}
async function api(token, relative, method = "GET", body, expected = 200) {
  const response = await fetch(`${environment.url}/api/v1${relative}`, { method, headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const result = await response.json()
  assert.equal(response.status, expected, JSON.stringify(result)); return result
}
const org = () => `/organizations/${environment.ids.organization}`
async function contextFor(token, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport })
  await context.addCookies([{ name: "go_access_token", value: token, url: baseUrl, httpOnly: true, sameSite: "Lax" }])
  await context.addInitScript(({ organization, branch }) => { localStorage.setItem("go-organization", organization); localStorage.setItem("go-branch", branch) }, { organization: environment.ids.organization, branch: environment.ids.branch })
  await context.route("**/*", route => { const url = new URL(route.request().url()); return ["127.0.0.1", "localhost"].includes(url.hostname) || ["data:", "blob:"].includes(url.protocol) ? route.continue() : route.abort() })
  const page = await context.newPage()
  page.on("pageerror", error => browserErrors.push(error.message))
  page.on("response", response => { if (response.status() >= 500 && response.url().startsWith(baseUrl) && response.url().includes("/api/")) failedResponses.push({ status: response.status(), url: new URL(response.url()).pathname }) })
  page.setDefaultTimeout(20000)
  return { context, page }
}
async function saveDialog(page, name = "حفظ التعديلات", expected = 200) {
  const dialog = page.getByRole("dialog")
  const [response] = await Promise.all([page.waitForResponse(response => response.url().includes("/api/backend/") && ["POST", "PATCH"].includes(response.request().method())), dialog.getByRole("button", { name, exact: true }).click()])
  assert.equal(response.status(), expected, await response.text())
  await expect(dialog).toHaveCount(0)
}
async function selectConfiguration(page, trainerId) {
  await page.getByRole("button", { name: "ملفات المدربين والجداول", exact: true }).click()
  await expect(page.getByRole("heading", { name: "ملفات المدربين والجداول", exact: true })).toBeVisible()
  if (trainerId) await page.getByLabel("اختر المدرب", { exact: true }).selectOption(trainerId)
}
async function capture(page, name) { const dismiss = page.getByRole("button", { name: "إغلاق الإشعار", exact: true }); while (await dismiss.count()) await dismiss.first().click(); await page.screenshot({ path: path.join(artifactRoot, `${name}.png`), fullPage: false }) }

try {
  environment = await createLocalCoachingEnvironment()
  frontend = spawn(process.execPath, [path.join(frontendRoot, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3137"], { cwd: frontendRoot, windowsHide: true, env: { ...process.env, NODE_ENV: "development", API_BASE_URL: environment.url, NEXT_PUBLIC_API_BASE_URL: environment.url, NEXT_PUBLIC_ORGANIZATION_ID: environment.ids.organization, NEXT_PUBLIC_GATE_LIVE_UPDATES_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] })
  frontend.stdout.on("data", data => { frontendOutput += data.toString() })
  frontend.stderr.on("data", data => { frontendOutput += data.toString() })
  const deadline = Date.now() + 120000
  let ready = false
  while (Date.now() < deadline) { if (frontend.exitCode !== null) throw new Error(`Local frontend stopped: ${frontendOutput.slice(-3000)}`); try { ready = (await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(3000) })).ok } catch {} if (ready) break; await new Promise(resolve => setTimeout(resolve, 500)) }
  assert.ok(ready, "Local frontend did not start")
  browser = await chromium.launch({ headless: true })
  browserVersion = browser.version()
  const { page: admin } = await contextFor(environment.tokens.admin)
  activePage = admin
  const assignmentMemberRequests = []
  admin.on("request", request => {
    const url = new URL(request.url())
    if (url.pathname === `/api/backend/api/v1/organizations/${environment.ids.organization}/members`) assignmentMemberRequests.push(url)
  })
  await admin.goto(`${baseUrl}/trainer`)
  await check("assignment-screen-opens-without-downloading-branch-members", async () => {
    await expect(admin.getByRole("heading", { name: "مدربو الفرع", exact: true })).toBeVisible()
    assert.equal(assignmentMemberRequests.length, 0, "Opening assignments must not download the branch member directory")
  })
  await check("profile-specialty-branch-and-availability-through-ui", async () => {
    await selectConfiguration(admin)
    await admin.getByRole("button", { name: "إضافة تخصص", exact: true }).click()
    let dialog = admin.getByRole("dialog")
    await dialog.getByLabel("رمز التخصص", { exact: true }).fill("QA_STRENGTH")
    await dialog.getByLabel("اسم التخصص", { exact: true }).fill("تدريب القوة التجريبي")
    await saveDialog(admin, "حفظ التعديلات", 201)
    for (const [employee, name] of [[environment.ids.employee, "مدرب اختبار أول"], [environment.ids.otherEmployee, "مدرب اختبار ثان"]]) {
      await admin.getByRole("button", { name: "إنشاء ملف مدرب", exact: true }).click()
      dialog = admin.getByRole("dialog")
      await dialog.getByLabel("الموظف", { exact: true }).selectOption(employee)
      await dialog.getByLabel("الاسم الظاهر للمدرب", { exact: true }).fill(name)
      await dialog.getByLabel("نبذة المدرب", { exact: true }).fill("ملف تجريبي لاختبارات المسار المحلي")
      await dialog.getByRole("checkbox", { name: "تدريب القوة التجريبي" }).check()
      await saveDialog(admin, "حفظ التعديلات", 201)
    }
    const trainers = (await api(environment.tokens.admin, `${org()}/trainers?limit=100`)).data
    coachId = trainers.find(row => row.employeeId === environment.ids.employee).id
    secondCoachId = trainers.find(row => row.employeeId === environment.ids.otherEmployee).id
    for (const id of [coachId, secondCoachId]) {
      await admin.getByLabel("اختر المدرب", { exact: true }).selectOption(id)
      await admin.getByRole("button", { name: "تعيين للفرع", exact: true }).click()
      await saveDialog(admin, "حفظ التعديلات", 201)
    }
    await admin.getByLabel("اختر المدرب", { exact: true }).selectOption(coachId)
    await admin.getByRole("button", { name: "تعديل ملف المدرب", exact: true }).click()
    await admin.getByRole("dialog").getByLabel("نبذة المدرب", { exact: true }).fill("نبذة معدلة من المتصفح")
    await saveDialog(admin)
    await expect(admin.getByText("نبذة معدلة من المتصفح", { exact: true })).toBeVisible()
    await admin.getByRole("button", { name: "إضافة ساعات إتاحة", exact: true }).click()
    dialog = admin.getByRole("dialog")
    await dialog.getByLabel("يوم الإتاحة", { exact: true }).selectOption("1")
    await dialog.getByLabel("من الساعة", { exact: true }).fill("09:00")
    await dialog.getByLabel("إلى الساعة", { exact: true }).fill("17:00")
    await saveDialog(admin, "حفظ التعديلات", 201)
    await admin.getByRole("button", { name: "تعديل أو إيقاف الإتاحة", exact: true }).click()
    await admin.getByRole("dialog").getByLabel("إلى الساعة", { exact: true }).fill("18:00")
    await saveDialog(admin)
    await expect(admin.getByText("09:00 — 18:00", { exact: true })).toBeVisible()
    await capture(admin, "01-coaching-configuration")
  })

  await check("member-picker-loads-bounded-pages-and-searches-beyond-the-first-page", async () => {
    await environment.pg.query("insert into app.members(id,organization_id,member_number,name,gender,registration_branch_id,registration_origin,registered_on,status) select ('00000000-0000-4000-8000-'||lpad(to_hex(n),12,'0'))::uuid,$1,'GO'||(910000+n),'متدرب بحث تجريبي '||n,'MALE',$2,'ADMIN',current_date,'ACTIVE' from generate_series(1,151) n", [environment.ids.organization, environment.ids.branch])
    await admin.getByRole("button", { name: "تعيينات المدربين", exact: true }).click()
    await admin.getByRole("button", { name: /مدرب اختبار أول/ }).first().click()
    const before = assignmentMemberRequests.length
    assert.equal(before, 0, "Switching back to assignments must not load members either")
    await admin.getByRole("button", { name: "ربط عضو بالمدرب", exact: true }).click()
    const dialog = admin.getByRole("dialog")
    await expect(dialog.locator("button[aria-pressed]")).toHaveCount(50)
    assert.equal(assignmentMemberRequests.length - before, 1, "Member picker must fetch only the first page on open")
    assert.equal(assignmentMemberRequests.at(-1).searchParams.get("limit"), "50")
    assert.equal(assignmentMemberRequests.at(-1).searchParams.get("status"), "ACTIVE")
    await expect(dialog.getByRole("button", { name: /متدرب بحث تجريبي 1 GO910001/ })).toHaveCount(0)
    await dialog.getByRole("button", { name: "عرض المزيد من الأعضاء", exact: true }).click()
    await expect(dialog.locator("button[aria-pressed]")).toHaveCount(100)
    assert.equal(assignmentMemberRequests.length - before, 2, "Only an explicit load-more action may fetch another page")
    assert.ok(assignmentMemberRequests.at(-1).searchParams.get("cursor"))
    await dialog.getByLabel("ابحث عن العضو", { exact: true }).fill("GO910001")
    await expect(dialog.locator("button[aria-pressed]")).toHaveCount(1)
    await expect(dialog.getByRole("button", { name: /متدرب بحث تجريبي 1 GO910001/ })).toBeVisible()
    assert.equal(assignmentMemberRequests.at(-1).searchParams.get("search"), "GO910001")
    assert.equal(assignmentMemberRequests.at(-1).searchParams.has("cursor"), false)
    await dialog.getByLabel("ابحث عن العضو", { exact: true }).fill("GO910001 ")
    await expect(dialog.getByRole("button", { name: /متدرب بحث تجريبي 1 GO910001/ })).toBeVisible()
    assert.equal(assignmentMemberRequests.length - before, 3, "Whitespace must not restart or abort an identical search")
    await dialog.getByRole("button", { name: "إلغاء", exact: true }).click()
  })

  await check("member-assignment-through-ui", async () => {
    await admin.getByRole("button", { name: "تعيينات المدربين", exact: true }).click()
    await admin.getByRole("button", { name: /مدرب اختبار أول/ }).first().click()
    await admin.getByRole("button", { name: "ربط عضو بالمدرب", exact: true }).click()
    const dialog = admin.getByRole("dialog")
    await dialog.getByRole("button", { name: /متدرب اختبار أول/ }).click()
    await saveDialog(admin, "اعتماد التعيين", 201)
    await expect(admin.getByText("متدرب اختبار أول", { exact: true })).toBeVisible()
    await capture(admin, "02-coaching-assignments")
  })

  await check("template-and-administrative-plan-through-ui", async () => {
    const beforeMembers = assignmentMemberRequests.length
    await admin.getByRole("button", { name: "الخطط والقوالب", exact: true }).click()
    await expect(admin.getByRole("heading", { name: "خطط التدريب والقوالب", exact: true })).toBeVisible()
    assert.equal(assignmentMemberRequests.length, beforeMembers, "Opening programs must not load the member directory")
    await admin.getByRole("button", { name: "قوالب التدريب", exact: true }).click()
    await admin.getByRole("button", { name: "قالب تدريب جديد", exact: true }).click()
    const dialog = admin.getByRole("dialog")
    await dialog.getByLabel("رمز القالب", { exact: true }).fill("QA_PROGRAM")
    await dialog.getByLabel("اسم الخطة", { exact: true }).fill("برنامج تأسيس تجريبي")
    await dialog.getByLabel("الهدف", { exact: true }).fill("متابعة تطور القوة واللياقة")
    await dialog.getByLabel("اسم التمرين 1", { exact: true }).fill("قرفصاء تجريبية")
    await dialog.getByLabel("المجموعات 1", { exact: true }).fill("3")
    await dialog.getByLabel("التكرارات 1", { exact: true }).fill("10")
    await dialog.getByLabel("تعليمات التمرين 1", { exact: true }).fill("حافظ على الظهر مستقيمًا")
    await dialog.getByRole("button", { name: "إضافة تمرين", exact: true }).click()
    await dialog.getByLabel("اليوم 2", { exact: true }).fill("2")
    await dialog.getByLabel("اسم التمرين 2", { exact: true }).fill("مشي تجريبي")
    await dialog.getByLabel("المدة بالدقائق 2", { exact: true }).fill("20")
    await saveDialog(admin, "حفظ الخطة", 201)
    const templates = (await api(environment.tokens.admin, `${org()}/training-plan-templates`)).data
    templateId = templates.find(row => row.code === "QA_PROGRAM").id
    assert.equal(templates[0].items[0].exerciseName, "قرفصاء تجريبية")
    await admin.getByRole("button", { name: "خطط الأعضاء", exact: true }).click()
    await admin.getByRole("button", { name: "خطة تدريب جديدة", exact: true }).click()
    const planDialog = admin.getByRole("dialog")
    await planDialog.getByRole("button", { name: "اختيار المتدرب", exact: true }).click()
    await planDialog.getByLabel("ابحث عن العضو", { exact: true }).fill("GO900001")
    await planDialog.getByRole("button", { name: /متدرب اختبار أول/ }).click()
    await planDialog.getByLabel("ابدأ من قالب", { exact: true }).selectOption(templateId)
    await planDialog.getByLabel("اسم الخطة", { exact: true }).fill("خطة إدارية تجريبية")
    await planDialog.getByLabel("المدرب المسؤول", { exact: true }).selectOption(coachId)
    await saveDialog(admin, "حفظ الخطة", 201)
    administrativePlanId = (await api(environment.tokens.admin, `${org()}/member-training-plans?limit=100`)).data.find(row => row.name === "خطة إدارية تجريبية").id
    await admin.getByTestId(`training-program-${administrativePlanId}`).getByRole("button", { name: "تفعيل الخطة", exact: true }).click()
    await expect(admin.getByTestId(`training-program-${administrativePlanId}`).getByText("نشط", { exact: true })).toBeVisible()
  })

  const { page: coach } = await contextFor(environment.tokens.coach)
  activePage = coach
  const coachHistoryRequests = []
  coach.on("request", request => { const url = new URL(request.url()); if (url.pathname.includes("/trainer/") && /training-plans|commissions|measurements/.test(url.pathname)) coachHistoryRequests.push(url) })
  await coach.goto(`${baseUrl}/trainer`)
  await check("trainer-overview-loads-summary-without-plan-commission-or-measurement-history", async () => {
    await expect(coach.getByRole("heading", { name: /مرحبًا/ })).toBeVisible()
    await expect(coach.getByText("إجمالي عمولاتي", { exact: true })).toBeVisible()
    assert.equal(coachHistoryRequests.length, 0)
  })
  await check("multiple-measurements-and-immediate-history-refresh-through-ui", async () => {
    await api(environment.tokens.admin, `${org()}/measurement-types`, "POST", { code: "QA_WEIGHT", name: "الوزن التجريبي", unit: "kg", dataKind: "DECIMAL", minimumValue: "20", maximumValue: "300" }, 201)
    await api(environment.tokens.admin, `${org()}/measurement-types`, "POST", { code: "QA_HEIGHT", name: "الطول التجريبي", unit: "cm", dataKind: "INTEGER", minimumValue: "50", maximumValue: "250" }, 201)
    const types = (await api(environment.tokens.admin, `${org()}/measurement-types`)).data
    const weight = types.find(row => row.code === "QA_WEIGHT").id, height = types.find(row => row.code === "QA_HEIGHT").id
    await coach.getByRole("button", { name: "المتدربون", exact: true }).click()
    await coach.getByRole("button", { name: "تسجيل قياس", exact: true }).first().click()
    let dialog = coach.getByRole("dialog")
    await dialog.getByLabel("نوع القياس 1", { exact: true }).selectOption(weight)
    await dialog.getByLabel("قيمة القياس 1", { exact: true }).fill("80.5")
    await dialog.getByRole("button", { name: "إضافة قياس آخر", exact: true }).click()
    await dialog.getByLabel("نوع القياس 2", { exact: true }).selectOption(height)
    await dialog.getByLabel("قيمة القياس 2", { exact: true }).fill("180")
    await saveDialog(coach, "حفظ جلسة القياس", 201)
    await expect(coach.getByText(/الوزن التجريبي: 80.5/)).toBeVisible()
    await coach.getByRole("button", { name: "تسجيل قياس", exact: true }).first().click()
    dialog = coach.getByRole("dialog")
    await dialog.getByLabel("نوع القياس 1", { exact: true }).selectOption(weight)
    await dialog.getByLabel("قيمة القياس 1", { exact: true }).fill("79.2")
    await saveDialog(coach, "حفظ جلسة القياس", 201)
    await expect(coach.getByText(/الوزن التجريبي: 79.2/)).toBeVisible()
    await capture(coach, "03-coaching-measurements")
  })

  await check("administrative-measurements-load-with-member-labels-and-no-directory-download", async () => {
    activePage = admin
    const before = assignmentMemberRequests.length
    await admin.getByRole("button", { name: "القياسات", exact: true }).click()
    await expect(admin.getByRole("heading", { name: "سجل قياسات المتدربين", exact: true })).toBeVisible()
    await expect(admin.getByRole("heading", { name: "متدرب اختبار أول", exact: true })).toHaveCount(2)
    assert.equal(assignmentMemberRequests.length, before)
    await admin.getByRole("button", { name: "تسجيل جلسة قياس", exact: true }).click()
    const dialog = admin.getByRole("dialog")
    assert.equal(assignmentMemberRequests.length, before, "Measurement dialog must not fetch members until the picker is opened")
    await dialog.getByRole("button", { name: "اختيار المتدرب", exact: true }).click()
    await dialog.getByLabel("ابحث عن العضو", { exact: true }).fill("GO900001")
    await dialog.getByRole("button", { name: /متدرب اختبار أول/ }).click()
    await dialog.getByRole("button", { name: "إغلاق", exact: true }).click()
    activePage = coach
  })

  await check("trainer-creates-and-edits-plan-from-template-through-ui", async () => {
    await coach.getByRole("button", { name: "خطة تدريب جديدة", exact: true }).click()
    let dialog = coach.getByRole("dialog")
    await dialog.getByLabel("ابدأ من قالب", { exact: true }).selectOption(templateId)
    await dialog.getByLabel("اسم الخطة", { exact: true }).fill(planName)
    await saveDialog(coach, "حفظ الخطة", 201)
    ownPlanId = (await api(environment.tokens.coach, `/self/organizations/${environment.ids.organization}/trainer/training-plans?limit=100`)).data.find(row => row.name === planName).id
    const card = coach.getByTestId(`training-plan-${ownPlanId}`)
    await expect(card.getByText("قرفصاء تجريبية", { exact: true })).toBeVisible()
    await card.getByRole("button", { name: "تعديل الخطة", exact: true }).click()
    dialog = coach.getByRole("dialog")
    await dialog.getByLabel("تعليمات التمرين 1", { exact: true }).fill("تعليمات معدلة قبل بدء التنفيذ")
    await saveDialog(coach, "حفظ الخطة")
    await expect(card.getByText("تعليمات معدلة قبل بدء التنفيذ", { exact: true })).toBeVisible()
    await capture(coach, "04-coaching-plans")
  })

  const { page: member } = await contextFor(environment.tokens.member)
  activePage = member
  await member.goto(`${baseUrl}/self-service/activity`)
  await check("member-reads-exercises-and-records-completion-through-ui", async () => {
    await member.getByRole("button", { name: "خطط التدريب", exact: true }).click()
    const card = member.getByTestId(`training-plan-${ownPlanId}`)
    await expect(card.getByText("قرفصاء تجريبية", { exact: true })).toBeVisible()
    await expect(card.getByText("تعليمات معدلة قبل بدء التنفيذ", { exact: true })).toBeVisible()
    await card.getByRole("button", { name: "تم تنفيذ التمرين", exact: true }).first().click()
    await expect(card.getByText("مكتمل", { exact: true })).toBeVisible()
    await capture(member, "05-member-training-plan")
    await member.setViewportSize({ width: 390, height: 844 })
    assert.ok(await member.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2), "Member training page overflows mobile viewport")
    await capture(member, "06-member-training-mobile")
  })

  activePage = coach
  await check("recorded-progress-is-preserved-and-plan-can-close-through-ui", async () => {
    await coach.reload()
    await coach.getByRole("button", { name: "خطط التدريب", exact: true }).click()
    const card = coach.getByTestId(`training-plan-${ownPlanId}`)
    await card.getByRole("button", { name: "تعديل الخطة", exact: true }).click()
    const dialog = coach.getByRole("dialog")
    await expect(dialog.getByLabel("اسم التمرين 1", { exact: true })).toBeDisabled()
    await dialog.getByLabel("الهدف", { exact: true }).fill("هدف معدل مع حفظ التنفيذ")
    await saveDialog(coach, "حفظ الخطة")
    await card.getByRole("button", { name: "إنهاء الخطة كمكتملة", exact: true }).click()
    await expect(card.getByRole("button", { name: "اعتماد التنفيذ", exact: true })).toHaveCount(0)
    const rows = (await api(environment.tokens.coach, `/self/organizations/${environment.ids.organization}/trainer/training-plans?limit=100`)).data
    assert.equal(rows.find(row => row.id === ownPlanId).status, "COMPLETED")
  })

  activePage = admin
  await check("member-transfer-retains-history-and-moves-active-plan-through-ui", async () => {
    await admin.getByRole("button", { name: "تعيينات المدربين", exact: true }).click()
    await admin.getByRole("button", { name: /مدرب اختبار أول/ }).first().click()
    await admin.getByRole("button", { name: "تعديل أو نقل أو إنهاء التعيين", exact: true }).click()
    const dialog = admin.getByRole("dialog")
    await dialog.getByLabel("المدرب المسؤول", { exact: true }).selectOption(secondCoachId)
    await saveDialog(admin, "حفظ تعيين المتدرب")
    await expect(admin.getByText("تعيين سابق", { exact: true })).toBeVisible()
    const history = await environment.pg.query("select trainer_profile_id,status from app.trainer_member_assignments where organization_id=$1 and member_id=$2 order by created_at", [environment.ids.organization, environment.ids.member])
    assert.equal(history.rows.length, 2)
    assert.equal(history.rows[0].status, "ENDED")
    const plan = await environment.pg.query("select trainer_profile_id from app.member_training_plans where id=$1", [administrativePlanId])
    assert.equal(plan.rows[0].trainer_profile_id, secondCoachId)
    const second = await contextFor(environment.tokens.otherCoach)
    await second.page.goto(`${baseUrl}/trainer`)
    await second.page.getByRole("button", { name: "المتدربون", exact: true }).click()
    await expect(second.page.getByText("متدرب اختبار أول", { exact: true }).first()).toBeVisible()
    await expect(second.page.getByText("جلسة قياس", { exact: true })).toHaveCount(2)
  })

  await check("commission-rule-accrual-approval-and-payment-through-ui", async () => {
    await admin.getByRole("button", { name: "قواعد العمولات", exact: true }).click()
    await admin.getByRole("button", { name: "قاعدة عمولة جديدة", exact: true }).click()
    let dialog = admin.getByRole("dialog")
    await dialog.getByLabel("المدرب", { exact: true }).selectOption(secondCoachId)
    await dialog.getByLabel("نسبة العمولة بالمئة", { exact: true }).fill("10")
    await saveDialog(admin, "حفظ العمولة", 201)
    await admin.getByRole("button", { name: "تعديل قاعدة العمولة", exact: true }).click()
    dialog = admin.getByRole("dialog")
    await dialog.getByLabel("نسبة العمولة بالمئة", { exact: true }).fill("12.5")
    await saveDialog(admin, "حفظ العمولة")
    await admin.getByRole("button", { name: "تسجيل استحقاق عمولة", exact: true }).click()
    dialog = admin.getByRole("dialog")
    await dialog.getByLabel("المدرب", { exact: true }).selectOption(secondCoachId)
    await dialog.getByLabel("قيمة أساس الاحتساب بالريال", { exact: true }).fill("100")
    await saveDialog(admin, "حفظ العمولة", 201)
    await expect(admin.getByText(/12.5 ر.س/)).toBeVisible()
    await admin.getByRole("button", { name: "اعتماد العمولة", exact: true }).click()
    await admin.getByRole("button", { name: "توثيق صرف العمولة", exact: true }).click()
    await expect(admin.getByText("مدفوع", { exact: true })).toBeVisible()
    await capture(admin, "07-coaching-commissions")
  })

  await check("assignment-ending-and-branch-ending-through-ui", async () => {
    await admin.getByRole("button", { name: "تعيينات المدربين", exact: true }).click()
    await admin.getByRole("button", { name: /مدرب اختبار ثان/ }).first().click()
    await admin.getByRole("button", { name: "تعديل أو نقل أو إنهاء التعيين", exact: true }).click()
    await admin.getByRole("dialog").getByLabel("حالة التعيين", { exact: true }).selectOption("ENDED")
    await saveDialog(admin, "حفظ تعيين المتدرب")
    await selectConfiguration(admin, secondCoachId)
    await admin.getByRole("button", { name: "تعديل أو إنهاء التعيين", exact: true }).click()
    await admin.getByRole("dialog").getByLabel("الحالة", { exact: true }).selectOption("ENDED")
    await saveDialog(admin)
    await expect(admin.getByText("تعيين منتهٍ", { exact: true })).toBeVisible()
  })

  await check("permissions-and-stale-version-protection-through-real-api", async () => {
    await api(environment.tokens.outsider, `${org()}/trainer-member-assignments/${crypto.randomUUID()}`, "PATCH", { expectedVersion: 1, status: "ENDED" }, 404)
    const current = (await api(environment.tokens.admin, `${org()}/trainers/${coachId}`)).data
    await api(environment.tokens.outsider, `${org()}/trainers/${coachId}`, "PATCH", { expectedVersion: current.version, displayName: "مرفوض" }, 403)
    await api(environment.tokens.admin, `${org()}/trainers/${coachId}`, "PATCH", { expectedVersion: 1, displayName: "نسخة قديمة" }, 409)
    await api(environment.tokens.coach, `/self/organizations/${environment.ids.organization}/trainer/training-plans/${administrativePlanId}`, "PATCH", { expectedVersion: 3, branchId: environment.ids.branch, name: "خطة المدرب الآخر" }, 403)
  })

  await check("plans-and-templates-load-one-page-at-a-time-and-search-the-full-list", async () => {
    await environment.pg.query("insert into app.member_training_plans(id,organization_id,member_id,trainer_profile_id,name,starts_on,status,created_by) select ('b1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,$2,$3,'Resource plan '||lpad(n::text,3,'0'),current_date,'ACTIVE',$4 from generate_series(1,55) n", [environment.ids.organization, environment.ids.member, coachId, environment.ids.admin])
    await environment.pg.query("insert into app.training_plan_templates(id,organization_id,code,name,status,created_by) select ('b2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,'RESOURCE_QA_'||n,'Resource template '||lpad(n::text,3,'0'),'ACTIVE',$2 from generate_series(1,55) n", [environment.ids.organization, environment.ids.admin])
    const pageRequests = []
    const track = request => { const url = new URL(request.url()); if (url.searchParams.get("q")?.startsWith("Resource ") && /\/(member-training-plans|training-plan-templates)$/.test(url.pathname)) pageRequests.push(url) }
    admin.on("request", track)
    const beforeMembers = assignmentMemberRequests.length
    await admin.getByRole("button", { name: "الخطط والقوالب", exact: true }).click()
    const search = admin.getByLabel("البحث في خطط التدريب", { exact: true })
    const cards = admin.getByTestId(/^training-program-/)
    for (const [tab, prefix] of [["خطط الأعضاء", "Resource plan"], ["قوالب التدريب", "Resource template"]]) {
      const more = admin.getByRole("button", { name: tab === "خطط الأعضاء" ? "عرض المزيد من الخطط" : "عرض المزيد من القوالب", exact: true })
      await admin.getByRole("button", { name: tab, exact: true }).click()
      await Promise.all([admin.waitForResponse(response => new URL(response.url()).searchParams.get("q") === prefix && response.request().method() === "GET" && response.status() === 200), search.fill(prefix)])
      await expect(cards).toHaveCount(50)
      await expect(admin.getByRole("heading", { name: `${prefix} 001`, exact: true })).toHaveCount(0)
      await expect(more).toBeVisible()
      assert.equal(pageRequests.filter(url => url.searchParams.get("q") === prefix && url.searchParams.has("cursor")).length, 0, "The next cursor must not be fetched automatically")
      await more.click()
      await expect(cards).toHaveCount(55)
      await expect(more).toHaveCount(0)
      const ids = await cards.evaluateAll(elements => elements.map(element => element.getAttribute("data-testid")))
      assert.equal(new Set(ids).size, 55, "Appending a page must not repeat records")
      await search.fill(`${prefix} 001`)
      await expect(cards).toHaveCount(1)
      await expect(admin.getByRole("heading", { name: `${prefix} 001`, exact: true })).toBeVisible()
    }
    assert.equal(assignmentMemberRequests.length, beforeMembers, "Browsing full plan and template histories must not load the member directory")
    admin.off("request", track)
    const ownPath = `/api/backend/api/v1/self/organizations/${environment.ids.organization}/trainer/training-plans`
    const ownRequests = []
    coach.on("request", request => { const url = new URL(request.url()); if (url.pathname === ownPath) ownRequests.push(url) })
    await coach.getByRole("button", { name: "نظرة اليوم", exact: true }).click()
    await coach.getByRole("button", { name: "تحديث", exact: true }).click()
    await expect(coach.getByText("إجمالي عمولاتي", { exact: true })).toBeVisible()
    assert.equal(ownRequests.length, 0)
    await coach.getByRole("button", { name: "خطط التدريب", exact: true }).click()
    await Promise.all([coach.waitForResponse(response => new URL(response.url()).pathname === ownPath && new URL(response.url()).searchParams.get("q") === "Resource plan" && response.status() === 200), coach.getByLabel("البحث في خططي", { exact: true }).fill("Resource plan")])
    await expect(coach.getByTestId(/^training-plan-/)).toHaveCount(50)
    await coach.getByRole("button", { name: "عرض المزيد من الخطط", exact: true }).click()
    await expect(coach.getByTestId(/^training-plan-/)).toHaveCount(55)
  })

  await check("detailed-guide-and-mobile-layout-through-ui", async () => {
    await admin.goto(`${baseUrl}/guide/coaching`)
    await expect(admin.getByRole("heading", { name: "التدريب والمدربون من الإعداد إلى المتابعة", level: 1 })).toBeVisible()
    await expect(admin.getByRole("heading", { name: "5. ربط المتدرب ونقله أو إنهاء تعيينه" })).toBeVisible()
    await expect(admin.getByRole("heading", { name: "10. قواعد العمولات والمستحقات" })).toBeVisible()
    for (const source of await admin.locator("main img").evaluateAll(images => images.map(image => image.getAttribute("src")).filter(Boolean))) { const response = await admin.request.get(new URL(source, baseUrl).href); assert.equal(response.status(), 200, `Missing guide image: ${source}`) }
    await capture(admin, "08-coaching-guide")
    await admin.setViewportSize({ width: 390, height: 844 })
    assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2), "Guide overflows mobile viewport")
    await capture(admin, "09-coaching-guide-mobile")
  })
  assert.deepEqual(browserErrors, [], "Unexpected browser errors")
  assert.deepEqual(failedResponses, [], "Unexpected server failures in the UI")
} catch (error) {
  console.error(error.stack ?? error.message)
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  if (frontend && frontend.exitCode === null) {
    if (process.platform === "win32") { const killer = spawn("taskkill", ["/PID", String(frontend.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); await once(killer, "exit").catch(() => {}) }
    else { frontend.kill("SIGTERM"); await Promise.race([once(frontend, "exit"), new Promise(resolve => setTimeout(resolve, 5000))]) }
  }
  if (environment) { try { cleanup = await environment.cleanup(); assert.equal(cleanup.remainingTestTables, 0); console.log("CLEANUP verified: no test tables or test data remain") } catch (error) { cleanup = { error: error.message }; process.exitCode = 1 } }
  if (!process.exitCode) await fs.rm(path.join(artifactRoot, "failure.png"), { force: true })
  await fs.writeFile(path.join(artifactRoot, "frontend.log"), frontendOutput, "utf8")
  const report = { runAt: new Date().toISOString(), database: "isolated local PostgreSQL (PGlite), real migrations and business services", browser: "Playwright Chromium", browserVersion, checks, browserErrors, failedResponses, cleanup, passed: !process.exitCode && checks.length > 0 && checks.every(check => check.passed) }
  await fs.writeFile(path.join(artifactRoot, "report.json"), JSON.stringify(report, null, 2), "utf8")
  console.log(`Report: ${path.join(artifactRoot, "report.json")}`)
}
