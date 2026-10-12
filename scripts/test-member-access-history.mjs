import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { test } from "node:test"
import { Window } from "happy-dom"
import ts from "typescript"

const browser = new Window({ url: "http://localhost/" })
for (const name of ["window", "document", "navigator", "HTMLElement", "Node", "Event", "MouseEvent", "MutationObserver"]) Object.defineProperty(globalThis, name, { value: name === "window" ? browser : browser[name], configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = await import("react")
const runtime = await import("react/jsx-runtime")
const { createRoot } = await import("react-dom/client")
const pause = () => new Promise(resolve => setTimeout(resolve, 20))
const branchId = "branch-main"
const memberId = "member-1"
const attempts = Array.from({ length: 5 }, (_, index) => ({ id: `attempt-${index}`, memberId, branchId, attemptedAt: `2026-10-11T15:${22 + index}:00Z`, accessMethod: "MANUAL", decision: index ? "ACCEPTED" : "REJECTED", ...(index ? { subscriptionId: "subscription-1" } : { rejectionReason: "NOT_ACTIVE" }) }))
const gate = { id: "gate-1", branchId, deviceId: "device-1", deviceOccurredAt: "2026-10-11T15:25:00Z", accessMethod: "FINGERPRINT", doorNumber: 2, direction: "IN", eventType: 0, credentialPin: "123", deviceDecision: "ALLOWED", processingStatus: "ATTENDANCE_RECORDED", processingCode: "SYSTEM_ACCEPTED", attendanceAttemptId: "attempt-3" }

const native = tag => function Control({ children, variant, size, ...props }) {
  void variant; void size
  return React.createElement(tag, props, children)
}

function modules(overrides = {}) {
  const cache = new Map()
  function require(name) {
    if (overrides[name]) return overrides[name]
    if (name === "react") return React
    if (name === "react/jsx-runtime") return runtime
    if (name === "next/link") return { default: native("a") }
    if (name === "lucide-react") return new Proxy({}, { get: () => () => null })
    if (name === "@/lib/utils") return { cn: (...values) => values.filter(Boolean).join(" ") }
    if (name === "@/lib/human-errors") return { humanError: error => error.message }
    if (name === "@/components/toast-provider") return { useToast: () => ({ success() {}, error() {} }) }
    if (name === "@/components/status-badge") return { StatusBadge: () => null }
    if (name === "@/lib/subscription-term") return { remainingSubscriptionDaysLabel: () => "" }
    if (name === "@/lib/owner-file-upload" || name === "@/components/invoice-details-page") return {}
    if (name === "@/components/member-legacy-subscription-history") return { MemberLegacySubscriptionHistory: () => null }
    if (name === "@/components/date-time-input") return { DateTimeInput: native("input") }
    if (name.startsWith("@/components/ui/")) return new Proxy({}, { get: (_, key) => native(key === "Button" ? "button" : key === "Input" ? "input" : "div") })
    if (cache.has(name)) return cache.get(name)
    const path = name.slice(2) + (name.includes("components/") ? ".tsx" : ".ts")
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const compiledModule = { exports: {} }
    runInNewContext(code, { module: compiledModule, exports: compiledModule.exports, require, Intl, Date, Number, String, Math, Map, Set, encodeURIComponent, setTimeout, clearTimeout })
    cache.set(name, compiledModule.exports)
    return compiledModule.exports
  }
  return require
}

async function mount({ permissions = ["attendance.read", "attendance.devices.read", "subscriptions.read"], pages = [attempts], events = [], failAttendance = false, failDevice = false } = {}) {
  const grants = new Set(["members.read", ...permissions])
  const context = { loading: false, organizationId: "organization-1", branchId, branches: [{ id: branchId, name: "Main" }], canAccess: requested => requested.some(permission => grants.has(permission)) }
  const calls = []
  const require = modules({
    "@/components/app-context": { useAppContext: () => context },
    "@/lib/api-client": { hasRuntimeApi: () => true, apiRequest: async path => {
      calls.push(path)
      if (path.endsWith(`/members/${memberId}`)) return { data: { id: memberId, name: "حمد خالد الحلوه", memberNumber: "GO008959", status: "ACTIVE", registrationBranchId: branchId } }
      if (path.includes("/attendance-attempts?")) {
        if (failAttendance) throw Error("تعذر تحميل الحضور")
        const index = path.includes("cursor=") ? 1 : 0
        return { data: pages[index], meta: index === 0 && pages.length > 1 ? { nextCursor: "next-page" } : {} }
      }
      if (path.includes("/access-device-events?")) {
        if (failDevice) throw Error("تعذر تحميل البصمة")
        return { data: events }
      }
      if (path.includes("/subscriptions?")) return { data: [{ id: "subscription-1", subscriptionNumber: "SUB002165", status: "ACTIVE" }] }
      return { data: [] }
    } },
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  await React.act(async () => { root.render(React.createElement(require("@/components/member-profile-page").MemberProfilePage, { memberId })); await pause() })
  const tab = [...container.querySelectorAll("nav button")].find(button => button.textContent === "سجل الدخول والبصمة")
  if (tab) await React.act(async () => { tab.click(); await pause() })
  return { container, tab, calls, close: async () => { await React.act(async () => root.unmount()); container.remove() } }
}

test("member profile displays all manual attempts and their subscription or rejection", async () => {
  const view = await mount()
  assert.equal(view.container.querySelectorAll("tbody tr").length, 5)
  assert.equal((view.container.textContent.match(/SUB002165/g) ?? []).length, 4)
  assert.match(view.container.textContent, /مرفوض — لا يوجد اشتراك نشط/)
  assert.match(view.container.textContent, /تسجيل يدوي/)
  assert.ok(view.calls.some(path => path.includes(`/attendance-attempts?memberId=${memberId}`)))
  await view.close()
})

test("linked gate events appear once while exits and device denials remain visible", async () => {
  const view = await mount({ events: [gate, { ...gate, id: "exit", attendanceAttemptId: undefined, doorNumber: 1, direction: "OUT", processingStatus: "IGNORED", processingCode: "EXIT_EVENT" }, { ...gate, id: "denied", attendanceAttemptId: undefined, deviceDecision: "DENIED", processingStatus: "DEVICE_DENIED", eventType: 34 }] })
  assert.equal(view.container.querySelectorAll("tbody tr").length, 7)
  assert.match(view.container.textContent, /قارئ الخروج/)
  assert.match(view.container.textContent, /بصمة غير مسجلة/)
  assert.equal((view.container.textContent.match(/SUB002165/g) ?? []).length, 4)
  await view.close()
})

test("attendance-only and device-only users read only their authorized source", async () => {
  for (const permission of ["attendance.read", "attendance.devices.read"]) {
    const view = await mount({ permissions: [permission], events: [gate] })
    assert.ok(view.tab)
    assert.equal(view.calls.some(path => path.includes("/attendance-attempts?")), permission === "attendance.read")
    assert.equal(view.calls.some(path => path.includes("/access-device-events?")), permission === "attendance.devices.read")
    await view.close()
  }
  const view = await mount({ permissions: [] })
  assert.equal(view.tab, undefined)
  assert.equal(view.calls.some(path => /attendance-attempts|access-device-events/.test(path)), false)
  await view.close()
})

test("later attendance pages are shown and a failing source does not hide the other", async () => {
  const view = await mount({ pages: [attempts.slice(0, 2), attempts.slice(2)], failDevice: true })
  assert.equal(view.container.querySelectorAll("tbody tr").length, 5)
  assert.match(view.container.querySelector('[role="alert"]').textContent, /تعذر تحميل البصمة/)
  assert.ok(view.calls.some(path => path.includes("cursor=next-page")))
  await view.close()
  const devices = await mount({ failAttendance: true, events: [gate] })
  assert.equal(devices.container.querySelectorAll("tbody tr").length, 1)
  assert.match(devices.container.querySelector('[role="alert"]').textContent, /تعذر تحميل الحضور/)
  await devices.close()
})
