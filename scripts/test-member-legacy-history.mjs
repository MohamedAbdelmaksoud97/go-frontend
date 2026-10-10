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
const source = readFileSync(new URL("../components/member-legacy-subscription-history.tsx", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
const exports = {}
runInNewContext(compiled, { exports, Intl, Date, Number, String, Math, require: name => name === "react" ? React : name === "react/jsx-runtime" ? runtime : name.includes("badge") ? { Badge: props => React.createElement("span", props, props.children) } : { Button: props => React.createElement("button", props, props.children) } })

test("history remains reference-only, preserves missing amounts and paginates every record", async () => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const records = Array.from({ length: 13 }, (_, index) => ({ id: String(index), serviceName: `History ${index}`, sourceDate: "2026-10-10", paidAmountMinor: null, listedAmountMinor: "10000", visitsDisplay: "3 / 30" }))
  await React.act(async () => root.render(React.createElement(exports.MemberLegacySubscriptionHistory, { records })))
  assert.equal(container.querySelectorAll("article").length, 12)
  assert.match(container.textContent, /للاستدلال فقط/)
  assert.match(container.textContent, /لا تمنح دخولًا/)
  assert.ok([...container.querySelectorAll("dd")].some(element => element.textContent === "—"))
  assert.deepEqual([...container.querySelectorAll("button")].map(element => element.textContent), ["السابق", "التالي"])
  await React.act(async () => [...container.querySelectorAll("button")][1].click())
  assert.equal(container.querySelectorAll("article").length, 1)
  assert.match(container.textContent, /History 12/)
  await React.act(async () => root.unmount())
})
