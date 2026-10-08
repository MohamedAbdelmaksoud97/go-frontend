import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { Window } from "happy-dom"
import ts from "typescript"

const browser = new Window({ url: "http://localhost/" })
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Node", "Event", "MouseEvent", "MutationObserver"]) {
  Object.defineProperty(globalThis, name, { value: name === "window" ? browser : browser[name], configurable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = await import("react")
const jsx = await import("react/jsx-runtime")
const { createRoot } = await import("react-dom/client")
const { renderToStaticMarkup } = await import("react-dom/server")
const pause = () => new Promise(resolve => setTimeout(resolve, 25))
const native = tag => function TestControl({ children, variant, size, priority, ...props }) { void variant; void size; void priority; return React.createElement(tag, props, children) }
const apiError = class ApiError extends Error { constructor(code) { super(code); this.problem = { code, status: 409 } } }
function loadModule(path, overrides = {}, appended = "") {
  const testModule = { exports: {} }
  const text = readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
  const code = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  runInNewContext(code + appended, { module: testModule, exports: testModule.exports, window: browser, document, setTimeout, clearTimeout,
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
    require: name => {
      if (name in overrides) return overrides[name]
      if (name === "react") return React
      if (name === "react/jsx-runtime") return jsx
      if (name === "lucide-react") return new Proxy({}, { get: () => () => null })
      if (name === "next/link") return { default: native("a") }
      if (name === "next/image") return { default: native("img") }
      if (name === "@/components/status-badge") return { StatusBadge: ({ status }) => React.createElement("span", null, status) }
      if (name.startsWith("@/components/ui/")) return new Proxy({}, { get: (_, key) => key === "buttonVariants" ? () => "" : native(key === "Button" ? "button" : key === "Input" ? "input" : "div") })
      return {}
    },
  })
  return testModule.exports
}
const preview = { sourceType: "SERVICE", sourceId: "line", name: "خدمة اختبار", customerName: "عضو اختبار", quantity: 2, status: "FULFILLED", amountMinor: "10500", expectedVersion: 2, expectedInvoiceVersion: 4, invoiceNumber: "INV-1", settlement: "REFUND_REQUIRED" }
const result = { id: "correction", sourceType: "SERVICE", sourceId: "line", status: "CANCELLED", amountMinor: "10500", settlement: "REFUND_REQUIRED", reason: "اختيار خدمة بالخطأ", correctedAt: "2026-10-08T10:00:00Z", invoiceNumber: "INV-1", refundRequestId: "refund", balanceMinor: "0" }
const servicePath = "/organizations/org/orders/order/lines/line/administrative-corrections"
async function mountDialog({ data = preview, failOnce = false, failPreview = false } = {}) {
  const calls = [], saved = []
  let key = 0, failed = false
  const api = { ApiError: apiError, createIdempotencyKey: () => `correction-key-${++key}`, apiRequest: async (path, options = {}) => {
    calls.push({ path, ...options })
    if (!options.method && failPreview) throw new apiError("correction_partial_payment")
    if (options.method === "POST" && failOnce && !failed) { failed = true; throw new apiError("network_error") }
    return { data: options.method === "POST" ? result : data }
  } }
  const human = loadModule("lib/human-errors.ts", { "@/lib/api-client": api })
  const moduleExports = loadModule("components/administrative-correction-dialog.tsx", { "@/lib/api-client": api, "@/lib/human-errors": human })
  const container = document.createElement("div"); document.body.append(container)
  const root = createRoot(container)
  await React.act(async () => { root.render(React.createElement(moduleExports.AdministrativeCorrectionDialog, { path: servicePath, onClose: () => {}, onSaved: value => saved.push(value) })); await pause() })
  const button = text => [...container.querySelectorAll("button")].find(item => item.textContent.trim() === text)
  async function reason(value) {
    const input = container.querySelector("textarea")
    await React.act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLTextAreaElement.prototype, "value").set.call(input, value); input.dispatchEvent(new browser.Event("input", { bubbles: true })); await pause() })
  }
  async function click(text) { const element = button(text); assert.ok(element); assert.equal(element.disabled, false); await React.act(async () => { element.click(); await pause() }) }
  return { container, calls, saved, button, reason, click, close: async () => { await React.act(async () => root.unmount()); container.remove() } }
}

test("administrative correction previews the actual line amount and requires a reason before confirmation", async () => {
  const view = await mountDialog()
  try {
    assert.ok(view.container.textContent.includes("خدمة اختبار"))
    assert.ok(view.container.textContent.includes("عضو اختبار"))
    assert.ok(view.container.textContent.includes("إنشاء طلب استرداد للمراجعة في المالية"))
    assert.ok(view.container.textContent.includes("١٠٥"))
    assert.equal(view.button("تأكيد التصحيح وإلغاء البند الخاطئ").disabled, true)
    await view.reason("اختيار خدمة بالخطأ")
    await view.click("تأكيد التصحيح وإلغاء البند الخاطئ")
    const request = view.calls.find(call => call.method === "POST")
    assert.deepEqual(JSON.parse(request.body), { reason: "اختيار خدمة بالخطأ", expectedVersion: 2, expectedInvoiceVersion: 4 })
    assert.ok(request.idempotencyKey)
    assert.equal(view.saved.length, 1)
  } finally { await view.close() }
})

test("network retry reuses the correction key, and changing the reason creates another key", async () => {
  const view = await mountDialog({ failOnce: true })
  try {
    await view.reason("اختيار خدمة بالخطأ")
    await view.click("تأكيد التصحيح وإلغاء البند الخاطئ")
    await view.click("تأكيد التصحيح وإلغاء البند الخاطئ")
    const posts = view.calls.filter(call => call.method === "POST")
    assert.equal(posts[0].idempotencyKey, posts[1].idempotencyKey)
    await view.reason("سبب مختلف للتصحيح")
    await view.click("تأكيد التصحيح وإلغاء البند الخاطئ")
    assert.notEqual(view.calls.at(-1).idempotencyKey, posts[0].idempotencyKey)
  } finally { await view.close() }
})

test("partial-payment errors block correction and manual bookings omit the invoice version", async () => {
  const blocked = await mountDialog({ failPreview: true })
  try {
    assert.ok(blocked.container.textContent.includes("الفاتورة مسددة جزئيًا"))
    await blocked.reason("خطأ في التسجيل")
    assert.equal(blocked.button("تأكيد التصحيح وإلغاء البند الخاطئ").disabled, true)
  } finally { await blocked.close() }
  const manual = await mountDialog({ data: { ...preview, sourceType: "BOOKING", settlement: "NO_FINANCIAL_SETTLEMENT", expectedInvoiceVersion: undefined } })
  try {
    await manual.reason("خطأ في التسجيل")
    await manual.click("تأكيد التصحيح وإلغاء البند الخاطئ")
    assert.equal(JSON.parse(manual.calls.at(-1).body).expectedInvoiceVersion, undefined)
  } finally { await manual.close() }
})

test("invoice detail exposes correction actions only for eligible line types and permissions", async () => {
  for (const allowed of [false, true]) {
    const invoice = { id: "invoice", orderId: "order", invoiceNumber: "INV-1", status: "ISSUED", netMinor: "20000", discountMinor: "0", taxMinor: "3000", grossMinor: "23000", paidMinor: "0", balanceMinor: "11500", receivableReductionMinor: "11500", payableGrossMinor: "11500", currency: "SAR", issuedAt: result.correctedAt,
      branch: { name: "Test branch" }, lines: ["SERVICE", "BOOKING", "RETAIL"].map((lineType, index) => ({ id: String(index), orderLineId: `line-${index}`, lineType, targetName: "Test item", description: "Test item", quantity: 1, unitNetMinor: "10000", netMinor: "10000", taxMinor: "1500", grossMinor: "11500", discountMinor: "0", taxRateBps: 1500, taxInclusive: true, fulfillmentStatus: lineType === "SERVICE" ? "NOT_REQUIRED" : "FULFILLED", contractSnapshots: [], ...(lineType === "BOOKING" ? { booking: { id: "booking", status: "COMPLETED", startsAt: result.correctedAt, endsAt: result.correctedAt } } : {}) })), payments: [], refunds: [] }
    const exports = loadModule("components/invoice-details-page.tsx", { "@/components/app-context": { useAppContext: () => ({ organizationId: "org", loading: false, canAccess: permissions => permissions.includes("finance.invoices.read") || allowed }) },
      "@/lib/api-client": { hasRuntimeApi: () => true, apiRequest: async () => ({ data: invoice }) } })
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container)
    try {
      await React.act(async () => { root.render(React.createElement(exports.InvoiceDetailsPage, { invoiceId: "invoice" })); await pause() })
      const actions = [...container.querySelectorAll("button")].filter(button => button.textContent.includes("مسجل") || button.textContent.includes("مسجلة"))
      assert.equal(actions.length, allowed ? 2 : 0)
      assert.ok(!actions.some(button => button.textContent.includes("منتج")))
    } finally { await React.act(async () => root.unmount()); container.remove() }
  }
})

test("printed corrections show the original document, reduction, reason, and current balance", () => {
  const correctionExports = loadModule("components/administrative-correction-dialog.tsx")
  const exports = loadModule("components/invoice-details-page.tsx", { "@/components/administrative-correction-dialog": correctionExports }, "\nexports.testPrint=InvoicePrintSheet")
  const invoice = { invoiceNumber: "INV-1", status: "ISSUED", branch: { name: "Test branch" }, grossMinor: "23000", netMinor: "20000", taxMinor: "3000", discountMinor: "0", paidMinor: "0", receivableReductionMinor: "11500", payableGrossMinor: "11500", balanceMinor: "11500", currency: "SAR", issuedAt: result.correctedAt,
    lines: [], payments: [], refunds: [], corrections: [{ ...result, settlement: "REDUCED_UNPAID", reason: '<script>unsafe</script>', correctedByName: "Administrator" }] }
  const html = renderToStaticMarkup(React.createElement(exports.testPrint, { invoice, invoiceType: "Service", memberships: [] }))
  assert.ok(html.includes("INV-1"))
  assert.ok(html.includes("تخفيض المستحق للتصحيح الإداري"))
  assert.ok(html.includes("قيمة البنود الصحيحة"))
  assert.ok(html.includes("Administrator"))
  assert.ok(!html.includes("<script>"))
})

test("treasury attributes correction refunds to the correct source and payment method", () => {
  const exports = loadModule("components/reports-workspace.tsx", {}, "\nexports.testSummary=treasurySourceSummaries")
  const row = { entryId: "invoice", sourceFinancialBreakdown: "SERVICE:10000:8700:1300:0:2000|BOOKING:20000:17400:2600:0:500", paymentMethodRevenueBreakdown: "CARD:10000:2000|BANK_TRANSFER:20000:500", sourceMethodRefundBreakdown: "SERVICE:CARD:2000|BOOKING:CARD:0|SERVICE:BANK_TRANSFER:0|BOOKING:BANK_TRANSFER:500", outstandingMinor: "0" }
  const all = exports.testSummary([row])
  assert.equal(all.find(item => item.source === "SERVICE").refunded, 2000)
  assert.equal(all.find(item => item.source === "BOOKING").refunded, 500)
  const card = exports.testSummary([row], "CARD")
  assert.equal(card.find(item => item.source === "SERVICE").refunded, 2000)
  assert.equal(card.find(item => item.source === "BOOKING").refunded, 0)
})
