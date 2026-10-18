import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { test } from "node:test"
import { Window } from "happy-dom"
import ts from "typescript"

const browser = new Window({ url: "http://localhost/" })
for (const name of ["window", "document", "navigator", "HTMLElement", "Node", "Event", "MutationObserver"]) Object.defineProperty(globalThis, name, { value: name === "window" ? browser : browser[name], configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = await import("react")
const runtime = await import("react/jsx-runtime")
const { createRoot } = await import("react-dom/client")
const pause = () => new Promise(resolve => setTimeout(resolve, 10))
const native = tag => function Control({ children, variant, size, fill, unoptimized, ...props }) {
  void variant; void size; void fill; void unoptimized
  return React.createElement(tag, props, children)
}
const photo = status => ({ id: "photo-1", ownerId: "employee-1", purpose: "PROFILE_PHOTO", originalFilename: "qa-photo.png", uploadStatus: "UPLOADED", scanStatus: status, createdAt: "2026-10-18T12:00:00Z" })

async function mount({ files = [photo("PENDING")], permissions = ["workforce.read", "workforce.manage", "files.read", "files.manage"] } = {}) {
  const state = { files, calls: [], timers: new Map(), messages: [], employeeId: "employee-1", delayedFiles: undefined }
  const context = { loading: false, organizationId: "org-1", branchId: "branch-1", branches: [{ id: "branch-1", name: "QA Branch" }], canAccess: requested => requested.some(permission => permissions.includes(permission)) }
  const stubs = {
    react: React,
    "react/jsx-runtime": runtime,
    "next/link": { default: native("a") },
    "next/image": { default: native("img") },
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "@/components/app-context": { useAppContext: () => context },
    "@/components/status-badge": { StatusBadge: () => null },
    "@/components/toast-provider": { useToast: () => Object.fromEntries(["success", "error", "warning", "info"].map(kind => [kind, message => state.messages.push({ kind, message })])) },
    "@/components/ui/button": { Button: native("button"), buttonVariants: () => "" },
    "@/components/ui/card": new Proxy({}, { get: () => native("div") }),
    "@/lib/human-errors": { humanError: error => error.message },
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
    "@/lib/owner-file-upload": { ownerFileValidationError: async () => "", uploadOwnerFile: async () => { state.files = [photo("PENDING")]; return { fileId: "photo-1", uploadStatus: "UPLOADED", scanStatus: "PENDING", version: 2 } } },
    "@/lib/api-client": { hasRuntimeApi: () => true, apiRequest: async path => {
      state.calls.push(path)
      if (path.includes("/files?")) return { data: state.delayedFiles ? await state.delayedFiles : state.files.map(file => ({ ...file })) }
      if (path.includes("/download-url")) return { data: { downloadUrl: "https://qa.invalid/photo.png" } }
      if (path.includes("/employees/")) return { data: { id: state.employeeId, name: state.employeeId, employeeNumber: "QA1", status: "ACTIVE", assignments: [] } }
      return { data: [] }
    } },
  }
  const code = ts.transpileModule(readFileSync(new URL("../components/employee-profile-page.tsx", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const compiledModule = { exports: {} }
  let timerId = 0
  runInNewContext(code, { module: compiledModule, exports: compiledModule.exports, require: name => { if (!(name in stubs)) throw Error(`Unexpected import ${name}`); return stubs[name] }, Intl, Date, Set, Map, encodeURIComponent,
    setTimeout: fn => { const id = ++timerId; state.timers.set(id, fn); return id }, clearTimeout: id => state.timers.delete(id),
  })
  const container = document.createElement("div"); document.body.append(container)
  const root = createRoot(container)
  const render = async () => React.act(async () => { root.render(React.createElement(compiledModule.exports.EmployeeProfilePage, { employeeId: state.employeeId })); await pause() })
  await render()
  return { state, container, render,
    tick: async () => { assert.ok(state.timers.size, "A pending uploaded photo must schedule a status refresh"); const [id, fn] = state.timers.entries().next().value; state.timers.delete(id); await React.act(async () => { await fn(); await pause() }) },
    close: async () => { await React.act(async () => root.unmount()); container.remove() },
  }
}

test("pending employee photo appears automatically after scanning without reloading the employee", async () => {
  const view = await mount()
  try {
    assert.equal(view.container.querySelector("img"), null)
    assert.equal(view.state.calls.filter(path => path.includes("download-url")).length, 0)
    view.state.files = [photo("SCANNING")]; await view.tick()
    assert.equal(view.container.querySelector("img"), null)
    view.state.files = [photo("CLEAN")]; await view.tick()
    assert.equal(view.container.querySelector("img")?.getAttribute("src"), "https://qa.invalid/photo.png")
    assert.equal(view.state.timers.size, 0)
    assert.equal(view.state.calls.filter(path => path.endsWith("/employees/employee-1")).length, 1)
  } finally { await view.close() }
})

test("upload announces pending validation and updates the avatar when ready", async () => {
  const view = await mount({ files: [] })
  try {
    const input = view.container.querySelector('input[data-kind="PROFILE"]')
    Object.defineProperty(input, "files", { value: [new browser.File(["qa"], "qa-photo.png", { type: "image/png" })] })
    await React.act(async () => { input.dispatchEvent(new browser.Event("change", { bubbles: true })); await pause() })
    assert.ok(view.state.messages.some(item => item.kind === "info" && item.message.includes("الفحص")))
    assert.equal(view.state.messages.filter(item => item.kind === "success").length, 0)
    view.state.files = [photo("CLEAN")]; await view.tick()
    assert.ok(view.container.querySelector("img"))
  } finally { await view.close() }
})

for (const status of ["REJECTED", "INFECTED", "FAILED"]) test(`terminal ${status} photo is not displayed or polled`, async () => {
  const view = await mount({ files: [photo(status)] })
  try {
    assert.equal(view.container.querySelector("img"), null)
    assert.equal(view.state.timers.size, 0)
    assert.equal(view.state.calls.filter(path => path.includes("download-url")).length, 0)
    assert.doesNotMatch(view.container.textContent, /قيد الفحص/)
    assert.match(view.container.textContent, status === "FAILED" ? /تعذر فحص/ : /مرفوض/)
  } finally { await view.close() }
})

test("leaving the employee profile cancels its status refresh", async () => {
  const view = await mount()
  assert.ok(view.state.timers.size)
  await view.close()
  assert.equal(view.state.timers.size, 0)
})

test("a late photo response from the previous employee cannot replace the current profile", async () => {
  const view = await mount()
  try {
    let resolve
    view.state.delayedFiles = new Promise(done => { resolve = done })
    assert.ok(view.state.timers.size)
    const [id, refresh] = view.state.timers.entries().next().value
    view.state.timers.delete(id)
    await React.act(async () => { refresh(); await pause() })
    view.state.delayedFiles = undefined; view.state.files = []; view.state.employeeId = "employee-2"
    await view.render()
    await React.act(async () => { resolve([photo("CLEAN")]); await pause() })
    assert.match(view.container.textContent, /employee-2/)
    assert.equal(view.container.querySelector("img"), null)
    assert.equal(view.state.timers.size, 0)
  } finally { await view.close() }
})

test("file read permission is required for querying and displaying employee photos", async () => {
  const view = await mount({ files: [photo("CLEAN")], permissions: ["workforce.read"] })
  try {
    assert.equal(view.state.calls.filter(path => path.includes("/files")).length, 0)
    assert.equal(view.state.timers.size, 0)
    assert.equal(view.container.querySelector("img"), null)
    assert.equal(view.container.querySelector('input[type="file"]'), null)
  } finally { await view.close() }
})

test("a stalled scanner stops automatic requests and offers manual refresh", async () => {
  const view = await mount()
  try {
    for (let attempt = 0; attempt < 60; attempt += 1) await view.tick()
    assert.equal(view.state.timers.size, 0)
    assert.match(view.container.textContent, /الفحص يستغرق وقتًا أطول من المعتاد/)
    assert.equal(view.container.querySelector("img"), null)
    assert.equal(view.state.calls.filter(path => path.endsWith("/employees/employee-1")).length, 1)
  } finally { await view.close() }
})
