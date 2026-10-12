import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { test } from "node:test"
import { Window } from "happy-dom"
import ts from "typescript"

const browser = new Window({ url: "http://localhost/" })
for (const name of ["window", "document", "navigator", "HTMLElement", "Node", "Event", "MouseEvent", "File", "MutationObserver"]) Object.defineProperty(globalThis, name, { value: name === "window" ? browser : browser[name], configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = await import("react")
const runtime = await import("react/jsx-runtime")
const { createRoot } = await import("react-dom/client")
const pause = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms))
const context = { organizationId: "org", branchId: "main", branches: [{ id: "main", name: "الرئيسي" }], canAccess: () => true }
const subscriptions = [
  { id: "sub-unlimited", subscriptionNumber: "SUB1", memberId: "member-1", commercialSnapshot: { packageName: "عضوية شهر" }, status: "ACTIVE", fulfillmentKind: "FACILITY_ACCESS", allowedBranchIds: ["main"], visitsUsed: 5 },
  { id: "sub-limited", subscriptionNumber: "SUB2", memberId: "member-1", commercialSnapshot: { packageName: "ثلاث زيارات" }, status: "ACTIVE", fulfillmentKind: "FACILITY_ACCESS", allowedBranchIds: ["main"], visitAllowance: 3, visitsUsed: 1 },
]
const native = tag => function Control({ children, variant, size, ...props }) { void variant; void size; return React.createElement(tag, props, children) }

async function mount({ pages = [subscriptions], failSubscriptions = false, slowSubscriptions = false, lockedMember = true, rejectionReason } = {}) {
  const calls = []
  let release
  const api = {
    hasRuntimeApi: () => true, createIdempotencyKey: () => "test-key",
    apiRequest: async path => {
      calls.push({ path })
      if (path.includes("/members?")) return { data: [1, 2].map(id => ({ id: `member-${id}`, name: `عضو ${id}`, status: "ACTIVE" })) }
      if (slowSubscriptions) await new Promise(resolve => { release = resolve })
      if (failSubscriptions) throw Error("تعذر تحميل اشتراكات العضو")
      const query = new URL(path, "http://localhost").searchParams
      if (query.get("memberId") === "member-2") return { data: [{ ...subscriptions[0], id: "sub-member-2", memberId: "member-2" }] }
      const index = query.has("cursor") ? 1 : 0
      return { data: pages[index], meta: index === 0 && pages.length > 1 ? { nextCursor: "page-2" } : {} }
    },
    executeOperation: async (path, method, query, body) => {
      calls.push({ path, method, body: JSON.parse(JSON.stringify(body)) })
      return { data: { ...(rejectionReason ? { decision: "REJECTED", rejectionReason } : { decision: "ACCEPTED", subscriptionId: body.subscriptionId }), attemptedAt: new Date().toISOString() } }
    },
  }
  const cache = new Map()
  function require(name) {
    if (name === "react") return React
    if (name === "react/jsx-runtime") return runtime
    if (name === "next/navigation") return { useRouter: () => ({ push() {} }) }
    if (name === "lucide-react") return new Proxy({}, { get: () => () => null })
    if (name === "@/lib/api-client") return api
    if (name === "@/lib/human-errors") return { humanError: error => error.message }
    if (name === "@/lib/owner-file-upload") return {}
    if (name === "@/components/app-context") return { useAppContext: () => context }
    if (name === "@/components/toast-provider") return { useToast: () => ({ success() {}, error() {} }) }
    if (name === "@/components/status-badge") return { StatusBadge: () => null }
    if (name === "@/components/date-time-input") return { DateTimeInput: native("input") }
    if (name.startsWith("@/components/ui/")) return new Proxy({}, { get: (_, key) => native(key === "Button" ? "button" : key === "Input" ? "input" : "div") })
    if (cache.has(name)) return cache.get(name)
    if (name.endsWith(".json")) return JSON.parse(readFileSync(new URL(`../${name.slice(2)}`, import.meta.url), "utf8"))
    const source = readFileSync(new URL(`../${name.slice(2)}${name.includes("components/") ? ".tsx" : ".ts"}`, import.meta.url), "utf8")
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    const compiledModule = { exports: {} }
    runInNewContext(code, { module: compiledModule, exports: compiledModule.exports, require, window: browser, document, File: browser.File, URL, URLSearchParams, Date, Intl, Number, String, Boolean, Math, Map, Set, encodeURIComponent, setTimeout, clearTimeout })
    cache.set(name, compiledModule.exports)
    return compiledModule.exports
  }
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await React.act(async () => { root.render(React.createElement(require("@/components/action-dialog").ActionDialog, {
    operationId: "recordManualAttendance", organizationId: context.organizationId, branchId: context.branchId, onClose() {},
    initialValues: { memberId: "member-1" }, ...(lockedMember ? { lockedReferenceLabels: { memberId: "عضو 1" } } : {}),
  })); await pause() })
  if (!lockedMember) await React.act(async () => { await pause(320) })
  const choose = async id => { await React.act(async () => { container.querySelector(`input[type="radio"][value="${id}"]`).click(); await pause() }) }
  const submit = () => container.querySelector('button[type="submit"]')
  const submitForm = async () => { await React.act(async () => { container.querySelector("form").dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); await pause() }) }
  return { container, calls, choose, submit, submitForm, release: async () => { await React.act(async () => { release?.(); await pause() }) }, close: async () => { await React.act(async () => root.unmount()); container.remove() } }
}

test("requires explicit selection and submits the second subscription instead of the first", async () => {
  const view = await mount()
  assert.equal(view.container.querySelectorAll('input[type="radio"]:checked').length, 0)
  assert.equal(view.submit().disabled, true)
  await view.submitForm()
  assert.equal(view.calls.some(call => call.body), false)
  await view.choose("sub-limited")
  assert.equal(view.submit().disabled, false)
  await view.submitForm()
  assert.deepEqual(view.calls.find(call => call.body).body, { branchId: "main", memberId: "member-1", subscriptionId: "sub-limited" })
  assert.match(view.container.textContent, /تم الاعتماد على ثلاث زيارات/)
  await view.close()
})

test("loads later subscription pages and displays periodic limits", async () => {
  const view = await mount({ pages: [[subscriptions[0]], [{ ...subscriptions[1], visitAllowance: null, visitLimitPeriod: "WEEK", visitsPerPeriod: 3 }]] })
  assert.equal(view.container.querySelectorAll('input[type="radio"]').length, 2)
  assert.ok(view.calls.some(call => call.path.includes("cursor=page-2")))
  assert.match(view.container.textContent, /3 زيارات أسبوعيًا/)
  await view.choose("sub-limited")
  await view.submitForm()
  assert.equal(view.calls.find(call => call.body).body.subscriptionId, "sub-limited")
  await view.close()
})

test("blocks submission during subscription loading or failure", async () => {
  const pending = await mount({ slowSubscriptions: true })
  assert.equal(pending.submit().disabled, true)
  await pending.submitForm()
  assert.equal(pending.calls.some(call => call.body), false)
  await pending.release()
  assert.equal(pending.container.querySelectorAll('input[type="radio"]').length, 2)
  await pending.close()
  const failed = await mount({ failSubscriptions: true })
  assert.equal(failed.submit().disabled, true)
  await failed.submitForm()
  assert.equal(failed.calls.some(call => call.body), false)
  assert.match(failed.container.textContent, /تعذر تحميل اشتراكات العضو/)
  await failed.close()
})

test("changing the member clears the previous subscription selection", async () => {
  const view = await mount({ lockedMember: false })
  await view.choose("sub-limited")
  await React.act(async () => { const select = view.container.querySelector("select"); select.value = "member-2"; select.dispatchEvent(new browser.Event("change", { bubbles: true })); await pause() })
  assert.equal(view.container.querySelectorAll('input[type="radio"]:checked').length, 0)
  assert.equal(view.submit().disabled, true)
  await view.choose("sub-member-2")
  await view.submitForm()
  assert.deepEqual(view.calls.find(call => call.body).body, { branchId: "main", memberId: "member-2", subscriptionId: "sub-member-2" })
  await view.close()
})

test("a rejected frozen selection remains visible instead of implying another subscription was used", async () => {
  const view = await mount({ pages: [[subscriptions[0], { ...subscriptions[1], status: "FROZEN" }]], rejectionReason: "SUBSCRIPTION_FROZEN" })
  await view.choose("sub-limited")
  await view.submitForm()
  assert.equal(view.calls.find(call => call.body).body.subscriptionId, "sub-limited")
  assert.match(view.container.textContent, /تم رفض الدخول/)
  assert.match(view.container.textContent, /الاشتراك المختار مجمّد/)
  assert.match(view.container.textContent, /الاشتراك المختار: ثلاث زيارات/)
  assert.doesNotMatch(view.container.textContent, /تم الاعتماد على/)
  await view.close()
})
