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
const jsxRuntime = await import("react/jsx-runtime")
const { createRoot } = await import("react-dom/client")
const { renderToStaticMarkup } = await import("react-dom/server")
const source = readFileSync(new URL("../components/cashier-workstation.tsx", import.meta.url), "utf8")
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
const pause = () => new Promise(resolve => setTimeout(resolve, 35))

class ApiError extends Error {
  constructor(code) { super(code); this.problem = { code, status: 409 }; this.status = 409 }
}

async function mount() {
  const calls = []
  const notices = []
  const invoices = []
  let failPayment = false
  let slowReply
  const context = { organizationId: "org", branchId: "branch", canAccess: () => true }
  const container = document.createElement("div")
  document.body.append(container)
  function quote(body) {
    const grossBefore = body.lines.reduce((sum, line) => sum + 11500 * line.quantity, 0)
    const saving = body.invoicePromoCode === "FREE" ? grossBefore : body.invoicePromoCode ? Math.min(1000, grossBefore) : 0
    const gross = grossBefore - saving
    return { currency: "SAR", grossMinor: String(gross), netMinor: String(Math.round(gross / 1.15)), taxMinor: String(gross - Math.round(gross / 1.15)), discountMinor: String(saving),
      ...(body.invoicePromoCode ? { invoicePromotion: { id: "promo", code: body.invoicePromoCode, name: "خصم الكاونتر", grossBeforeMinor: String(grossBefore), grossDiscountMinor: String(saving) } } : {}) }
  }
  async function apiRequest(path, options = {}) {
    const body = options.body ? JSON.parse(options.body) : undefined
    calls.push({ path, body, method: options.method })
    let data = []
    if (path.endsWith("/order-quotes")) {
      if (body.invoicePromoCode === "INVALID") throw new ApiError("invoice_promotion_not_applicable")
      if (body.invoicePromoCode === "SLOW") await new Promise(resolve => { slowReply = resolve })
      data = quote(body)
    } else if (path.endsWith("/quotes")) data = { grossMinor: "11500", taxMinor: "1500", discountMinor: "0", currency: "SAR" }
    else if (path.endsWith("/orders")) {
      const priced = quote(body)
      const invoice = { id: "invoice-1", invoiceNumber: "INV-1", grossMinor: priced.grossMinor, paidMinor: "0", status: Number(priced.grossMinor) ? "ISSUED" : "PAID" }
      invoices.push(invoice)
      data = { invoiceId: invoice.id, grossMinor: priced.grossMinor }
    } else if (path.endsWith("/payments")) {
      if (failPayment) throw new ApiError("payment_failed")
      invoices[0].paidMinor = invoices[0].grossMinor
      data = {}
    } else if (/\/invoices\/invoice-1$/u.test(path)) data = invoices[0]
    else if (path.includes("/invoices?")) data = invoices
    else if (path.includes("/restaurant/meals")) data = [{ id: "meal-1", name: "وجبة اختبار", remainingQuantity: 100 }]
    else if (path.includes("/daily-menus/")) data = { status: "PUBLISHED", items: [{ mealId: "meal-1", enabled: true, remainingQuantity: 100 }] }
    else if (path.includes("/sellable-products")) data = [{ id: "product-1", name: "منتج اختبار", quantityAvailable: 100, grossMinor: "11500" }]
    else if (path.includes("/services?")) data = [{ id: "service-1", name: "خدمة اختبار" }]
    return { data }
  }
  const api = { apiRequest, ApiError, hasRuntimeApi: () => true, createIdempotencyKey: () => "test-key" }
  const errorModule = { exports: {} }
  runInNewContext(compile(readFileSync(new URL("../lib/human-errors.ts", import.meta.url), "utf8")), {
    exports: errorModule.exports, module: errorModule, require: () => api,
  })
  const native = tag => function NativeTestControl({ children, variant, size, ...props }) {
    void variant; void size
    return React.createElement(tag, props, children)
  }
  const testModule = { exports: {} }
  runInNewContext(compile(source), { exports: testModule.exports, module: testModule, window: browser, document: browser.document, setTimeout, clearTimeout, crypto: globalThis.crypto, requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
    require: name => {
      if (name === "react") return React
      if (name === "react/jsx-runtime") return jsxRuntime
      if (name === "lucide-react") return new Proxy({}, { get: () => () => null })
      if (name === "@/components/app-context") return { useAppContext: () => context }
      if (name === "@/components/toast-provider") return { useToast: () => ({ success: message => notices.push(message) }) }
      if (name === "@/lib/api-client") return api
      if (name === "@/lib/human-errors") return errorModule.exports
      if (name === "@/lib/permission-display") return { permissionArabicLabel: value => value }
      if (name.startsWith("@/components/ui/")) return new Proxy({}, { get: (_, key) => native(key === "Button" ? "button" : key === "Input" ? "input" : "div") })
      throw new Error(`Unexpected dependency ${name}`)
    },
  })
  const root = createRoot(container)
  const render = () => root.render(React.createElement(testModule.exports.CashierWorkstation))
  await React.act(async () => { render(); await pause() })
  const button = label => {
    const element = [...container.querySelectorAll("button")].findLast(item => item.textContent.trim() === label)
    assert.ok(element, `Missing button: ${label}`)
    return element
  }
  async function click(label) {
    const element = button(label)
    assert.equal(element.disabled, false, `Disabled button: ${label}`)
    await React.act(async () => { element.click(); await pause() })
  }
  async function enterCode(value) {
    const input = container.querySelector("#counter-invoice-promo")
    assert.ok(input)
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value").set.call(input, value)
      input.dispatchEvent(new browser.Event("input", { bubbles: true }))
      await pause()
    })
  }
  async function add(kind = "MEAL") {
    if (kind !== "MEAL") await click(kind === "SERVICE" ? "خدمة" : "منتج من المتجر")
    const option = [...container.querySelectorAll("option")].find(item => item.value === (kind === "MEAL" ? "meal-1" : kind === "SERVICE" ? "service-1" : "product-1"))
    assert.ok(option)
    await React.act(async () => { option.parentElement.value = option.value; option.parentElement.dispatchEvent(new browser.Event("change", { bubbles: true })); await pause() })
    await click("إضافة للفاتورة")
  }
  async function chooseSaleMethod(value) {
    const select = [...container.querySelectorAll("select")].findLast(item => [...item.options].some(option => option.value === "CARD"))
    await React.act(async () => { select.value = value; select.dispatchEvent(new browser.Event("change", { bubbles: true })); await pause() })
  }
  return { container, calls, notices, context, button, click, enterCode, add, chooseSaleMethod, setFailPayment: () => { failPayment = true },
    releaseSlow: () => slowReply?.(), rerender: async () => { await React.act(async () => { render(); await pause() }) },
    close: async () => { await React.act(async () => root.unmount()); container.remove() } }
}

test("cashier applies and removes a code for meals, services, and retail; edits block checkout", async () => {
  for (const kind of ["MEAL", "SERVICE", "RETAIL"]) {
    const view = await mount()
    try {
      await view.add(kind)
      await view.enterCode("counter10")
      assert.equal(view.button("إصدار فاتورة واحدة وتحصيلها").disabled, true)
      await view.click("تطبيق الكود")
      assert.ok(view.container.textContent.includes("تم قبول COUNTER10"))
      assert.ok(view.container.textContent.includes("توفير الكود شامل الضريبة"))
      assert.equal(view.calls.filter(call => call.path.endsWith("/order-quotes")).at(-1).body.invoicePromoCode, "COUNTER10")
      await React.act(async () => { view.container.querySelector('button[aria-label^="زيادة كمية"]').click(); await pause() })
      const updated = view.calls.filter(call => call.path.endsWith("/order-quotes")).at(-1).body
      assert.equal(updated.lines[0].quantity, 2)
      assert.equal(updated.invoicePromoCode, "COUNTER10")
      await view.enterCode("OTHER")
      assert.equal(view.button("إصدار فاتورة واحدة وتحصيلها").disabled, true)
      await view.click("إزالة")
      assert.equal(view.container.querySelector("#counter-invoice-promo").value, "")
      assert.equal(view.calls.filter(call => call.path.endsWith("/order-quotes")).at(-1).body.invoicePromoCode, undefined)
    } finally { await view.close() }
  }
})

test("invalid codes display Arabic errors and removing a pending code ignores its late response", async () => {
  const view = await mount()
  try {
    await view.add()
    await view.enterCode("INVALID")
    await view.click("تطبيق الكود")
    assert.ok(view.container.textContent.includes("كود خصم الفاتورة غير صالح"))
    assert.equal(view.button("إصدار فاتورة واحدة وتحصيلها").disabled, true)
    await view.enterCode("SLOW")
    await view.click("تطبيق الكود")
    assert.equal(view.button("إصدار فاتورة واحدة وتحصيلها").disabled, true)
    await view.click("إزالة")
    await React.act(async () => { view.releaseSlow(); await pause() })
    assert.ok(!view.container.textContent.includes("تم قبول SLOW"))
    assert.ok(!view.container.textContent.includes("توفير الكود شامل الضريبة"))
  } finally { await view.close() }
})

test("fully discounted cash invoice issues without an open shift or payment", async () => {
  const view = await mount()
  try {
    await view.add("RETAIL")
    await view.enterCode("FREE")
    await view.click("تطبيق الكود")
    await view.click("إصدار فاتورة دون مبلغ مستحق")
    assert.equal(view.calls.filter(call => call.path.endsWith("/orders")).length, 1)
    assert.equal(view.calls.find(call => call.path.endsWith("/orders")).body.invoicePromoCode, "FREE")
    assert.equal(view.calls.filter(call => call.path.endsWith("/payments")).length, 0)
    assert.equal(view.container.querySelector("#counter-invoice-promo"), null)
  } finally { await view.close() }
})

test("a changed invoice total keeps entered split payments and requires redistribution", async () => {
  const view = await mount()
  try {
    await view.add()
    await view.click("تقسيم على عدة وسائل")
    const before = [...view.container.querySelectorAll('input[type="number"]')].map(input => input.value)
    await view.enterCode("COUNTER10")
    await view.click("تطبيق الكود")
    assert.deepEqual([...view.container.querySelectorAll('input[type="number"]')].map(input => input.value), before)
    assert.ok(view.container.textContent.includes("خفّض مجموع الدفعات"), view.container.textContent)
    assert.equal(view.button("إصدار فاتورة واحدة وتسجيل 2 دفعات").disabled, true)
  } finally { await view.close() }
})

test("changing branch clears the current invoice and its code", async () => {
  const view = await mount()
  try {
    await view.add()
    await view.enterCode("COUNTER10")
    await view.click("تطبيق الكود")
    view.context.branchId = "another-branch"
    await view.rerender()
    assert.equal(view.container.querySelector("#counter-invoice-promo"), null)
    await view.add()
    assert.equal(view.container.querySelector("#counter-invoice-promo").value, "")
  } finally { await view.close() }
})

test("payment failure retains the issued discounted invoice for collection and clears the cart", async () => {
  const view = await mount()
  try {
    await view.add()
    await view.enterCode("COUNTER10")
    await view.click("تطبيق الكود")
    await view.chooseSaleMethod("CARD")
    view.setFailPayment()
    await view.click("إصدار فاتورة واحدة وتحصيلها")
    assert.equal(view.calls.filter(call => call.path.endsWith("/orders")).length, 1)
    assert.equal(view.calls.find(call => call.path.endsWith("/orders")).body.invoicePromoCode, "COUNTER10")
    assert.equal(view.container.querySelector("#counter-invoice-promo"), null)
    assert.ok(view.container.textContent.includes("تم إنشاء الفاتورة لكن لم يكتمل تحصيلها"))
    assert.ok([...view.container.querySelectorAll("option")].some(option => option.value === "invoice-1" && option.parentElement.value === "invoice-1"))
  } finally { await view.close() }
})

test("invoice print renders the immutable code and gross savings, including escaped names", () => {
  const testModule = { exports: {} }
  const text = readFileSync(new URL("../components/invoice-details-page.tsx", import.meta.url), "utf8")
  runInNewContext(`${compile(text)}\nexports.testPromotion = InvoicePromotionDetails`, { exports: testModule.exports, module: testModule,
    require: name => name === "react" ? React : name === "react/jsx-runtime" ? jsxRuntime : {} })
  const html = renderToStaticMarkup(React.createElement(testModule.exports.testPromotion, { currency: "SAR", lines: [
    { commercialSnapshot: { invoicePromotion: { id: "promo", code: "COUNTER10", name: "<script>unsafe</script>", grossBeforeMinor: "11500", grossDiscountMinor: "1000" } } },
  ] }))
  assert.ok(html.includes("COUNTER10"))
  assert.ok(html.includes("توفير الكود شامل الضريبة"))
  assert.ok(html.includes("١٠"))
  assert.ok(!html.includes("<script>"))
})

test("promotion settings expose invoice scope, hide item targets, and send the correct minor units", async () => {
  const testModule = { exports: {} }
  const text = readFileSync(new URL("../components/master-data-page.tsx", import.meta.url), "utf8")
  const native = tag => function NativeTestControl({ children, variant, size, ...props }) { void variant; void size; return React.createElement(tag, props, children) }
  runInNewContext(`${compile(text)}\nexports.testForm = MasterForm; exports.testConfigs = configs`, { exports: testModule.exports, module: testModule,
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
    require: name => {
      if (name === "react") return React
      if (name === "react/jsx-runtime") return jsxRuntime
      if (name === "lucide-react") return new Proxy({}, { get: () => () => null })
      if (name === "@/components/date-time-input") return { DateTimeInput: native("input") }
      if (name === "@/lib/api-client") return { hasRuntimeApi: () => false }
      if (name.startsWith("@/components/ui/")) return new Proxy({}, { get: (_, key) => native(key === "Button" ? "button" : key === "Input" ? "input" : "div") })
      return {}
    },
  })
  const config = testModule.exports.testConfigs.find(item => item.id === "promotions")
  assert.ok(config.createFields.some(field => field.name === "applicationScope"))
  assert.ok(config.editFields.some(field => field.name === "applicationScope"))
  const values = { ...config.initial, applicationScope: "COUNTER_INVOICE", code: "counter10", name: "Counter offer", benefitType: "FIXED_DISCOUNT", benefitValue: "10", packageIds: ["old-package"], serviceIds: ["old-service"] }
  const created = config.createBody(values)
  assert.equal(created.applicationScope, "COUNTER_INVOICE")
  assert.equal(created.eligibility, "PROMO_CODE")
  assert.equal(created.benefitValue, 1000)
  assert.equal(created.code, "COUNTER10")
  assert.equal(created.targets.length, 0)
  assert.equal(config.editBody({ ...values, benefitType: "PERCENTAGE", benefitValue: "25", status: "ACTIVE" }, { version: 1 }).benefitValue, 2500)
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  try {
    await React.act(async () => root.render(React.createElement(testModule.exports.testForm, { config, mode: "create", organizationId: "org", branchId: "branch", references: { branches: [], packages: [], services: [] }, setReferences: () => {}, onClose: () => {}, onSaved: () => {} })))
    const select = [...container.querySelectorAll("select")].find(item => [...item.options].some(option => option.value === "COUNTER_INVOICE"))
    assert.ok(select)
    await React.act(async () => { select.value = "COUNTER_INVOICE"; select.dispatchEvent(new browser.Event("change", { bubbles: true })); await pause() })
    assert.ok(!container.textContent.includes("الباقات المشمولة"))
    assert.ok(!container.textContent.includes("الخدمات المشمولة"))
    assert.ok(![...container.querySelectorAll("option")].some(option => option.value === "FIXED_FINAL_PRICE"))
  } finally { await React.act(async () => root.unmount()); container.remove() }
})
