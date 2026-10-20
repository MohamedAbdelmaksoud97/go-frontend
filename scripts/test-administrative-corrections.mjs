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

test("treasury displays server correction-refund summaries by source and selected payment method independently of detail pages", () => {
  const exports = loadModule("components/reports-workspace.tsx", {}, "\nexports.testTreasury=TreasurySections")
  const service = { source: "SERVICE", gross: 10000, netBeforeTax: 8700, tax: 1300, discount: 0, entries: 1, received: 10000, refunded: 2000, outstanding: 0, methods: [{ method: "CARD", received: 10000, refunded: 2000, net: 8000 }] }
  const booking = { source: "BOOKING", gross: 20000, netBeforeTax: 17400, tax: 2600, discount: 0, entries: 1, received: 20000, refunded: 500, outstanding: 0, methods: [{ method: "CARD", received: 5000, refunded: 0, net: 5000 }, { method: "BANK_TRANSFER", received: 15000, refunded: 500, net: 14500 }] }
  const money = minor => new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(minor / 100)
  // The API now calculates these summaries over the full filtered scope. An empty
  // detail page must not erase refunds or reallocate them to another source.
  for (const sources of [[service, booking], [service, { ...booking, received: 5000, refunded: 0, methods: [booking.methods[0]] }]]) {
    const document = new Window().document
    document.body.innerHTML = renderToStaticMarkup(React.createElement(exports.testTreasury, { rows: [], sources, branches: new Map() }))
    const tables = document.querySelectorAll(".treasury-management-summary table")
    const sourceRows = tables[0].querySelectorAll("tbody tr")
    assert.equal(sourceRows.length, 2)
    assert.equal(sourceRows[0].cells[0].textContent, "خدمات")
    assert.equal(sourceRows[0].cells[7].textContent, money(2000))
    assert.equal(sourceRows[1].cells[0].textContent, "حجوزات")
    assert.equal(sourceRows[1].cells[7].textContent, money(sources[1].refunded))
    const methodRows = [...tables[1].querySelectorAll("tbody tr")]
    assert.equal(methodRows[0].cells[0].textContent, "خدمات")
    assert.equal(methodRows[0].cells[1].textContent, "بطاقة")
    assert.equal(methodRows[0].cells[3].textContent, money(2000))
    assert.equal(methodRows[1].cells[0].textContent, "حجوزات")
    assert.equal(methodRows[1].cells[3].textContent, money(0))
    assert.equal(methodRows.length, sources[1].methods.length + 1)
    assert.equal(tables[0].querySelector("tfoot tr").cells[7].textContent, money(2000 + sources[1].refunded))
  }
})

test("member invoice history keeps authorized amounts while finance links follow visibility", () => {
  const exports = loadModule("components/member-profile-page.tsx", { "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") } }, "\nexports.testInvoiceSection=InvoiceSection")
  for (const canOpenInvoice of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(exports.testInvoiceSection, {
      branches: [], payments: [], canOpenInvoice,
      rows: [{ id: "invoice-1", invoiceNumber: "INV-TEST-1", status: "PAID", grossMinor: "10000", paidMinor: "10000", issuedAt: result.correctedAt }],
    }))
    const document = new Window().document
    document.body.innerHTML = html
    assert.ok(document.body.textContent.includes("INV-TEST-1"))
    assert.equal(document.querySelectorAll('a[href="/finance/invoices/invoice-1"]').length, canOpenInvoice ? 1 : 0)
  }
})

test("member service history distinguishes a cancelled line within a fulfilled paid order", () => {
  const exports = loadModule("components/member-profile-page.tsx", {}, "\nexports.testPurchasedServices=PurchasedServicesSection")
  const html = renderToStaticMarkup(React.createElement(exports.testPurchasedServices, {
    branches: [], canViewInvoice: true,
    rows: [{ id: "paid-order", orderNumber: "ORD-1", status: "FULFILLED", invoiceId: "invoice", createdAt: result.correctedAt,
      lineItems: [
        { id: "cancelled-line", lineType: "SERVICE", name: "Mistaken service", quantity: 1, grossMinor: "12000", fulfillmentStatus: "CANCELLED" },
        { id: "valid-line", lineType: "BOOKING", name: "Valid booking", quantity: 1, grossMinor: "6000", fulfillmentStatus: "FULFILLED" },
      ],
    }],
  }))
  const document = new Window().document
  document.body.innerHTML = html
  const rows = [...document.querySelectorAll("tbody tr")]
  assert.equal(rows.length, 2)
  assert.equal(rows[0].querySelectorAll("td")[7].textContent, "CANCELLED")
  assert.equal(rows[1].querySelectorAll("td")[7].textContent, "FULFILLED")
  assert.ok(rows[0].querySelector("a").getAttribute("href").endsWith("/finance/invoices/invoice"))
  assert.ok(document.body.textContent.includes("حالة الخدمة"))
})
