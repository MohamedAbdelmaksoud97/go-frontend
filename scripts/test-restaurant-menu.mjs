import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { runInNewContext } from "node:vm"
import * as React from "react"
import * as jsxRuntime from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
import { Window } from "happy-dom"
import ts from "typescript"
import { canAccessPermissions } from "../lib/permissions.ts"
import { readableDetails } from "../lib/audit-display.ts"

const testModule = { exports: {} }
const source = readFileSync(new URL("../components/restaurant-management-page.tsx", import.meta.url), "utf8")
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
runInNewContext(`${code}\nexports.MenuPanel = MenuPanel; exports.DailyMealAvailability = DailyMealAvailability; exports.menuWithCarryover = menuWithCarryover`, {
  module: testModule, exports: testModule.exports,
  require: name => {
    if (name === "react") return React
    if (name === "react/jsx-runtime") return jsxRuntime
    if (name === "@base-ui/react/dialog") return { Dialog: {} }
    if (name === "lucide-react") return new Proxy({}, { get: () => () => null })
    if (name.startsWith("@/components/ui/")) return new Proxy({}, { get: (_, key) => ({ children, ...props }) => React.createElement(key === "Input" ? "input" : key === "Button" ? "button" : "div", props, children) })
    if (name === "@/components/date-time-input") return { DateTimeInput: props => React.createElement("input", props) }
    if (["@/components/app-context", "@/components/toast-provider", "@/lib/api-client", "@/lib/human-errors"].includes(name)) return {}
    throw new Error(`Unexpected component dependency: ${name}`)
  },
})
const { MenuPanel, DailyMealAvailability, menuWithCarryover } = testModule.exports
const meal = { id: "meal-a", name: "وجبة دجاج" }
const item = { mealId: meal.id, enabled: true, availableQuantity: 50, preparedQuantity: 50, carriedOverQuantity: 20, reservedQuantity: 5, soldQuantity: 30, remainingQuantity: 35 }
const menu = { businessDate: "2026-10-17", status: "PUBLISHED", version: 2, items: [item] }
const props = { date: menu.businessDate, setDate() {}, meals: [meal], menu, menuItems: [item], add() {}, remove() {}, update() {}, publish() {}, hide() {}, saving: false, canManage: true, canCorrect: false, addProduction: async () => true }
function render(component, values) {
  const window = new Window()
  window.document.body.innerHTML = renderToStaticMarkup(React.createElement(component, values))
  return window.document.body
}

test("saved chef entries cannot be edited, hidden or deleted, while new production remains available", () => {
  const body = render(MenuPanel, props)
  assert.equal(body.querySelector('input[aria-label="المطبوخ اليوم من وجبة دجاج"]').disabled, true)
  assert.equal(body.querySelector('input[aria-label="السعر الخاص لـ وجبة دجاج"]').disabled, true)
  assert.equal(body.querySelector('input[type="checkbox"]').disabled, true)
  assert.equal(body.querySelector('button[aria-label="حذف وجبة دجاج من قائمة اليوم"]'), null)
  assert.equal(body.querySelector('input[aria-label="الكمية المطبوخة الجديدة من وجبة دجاج"]').disabled, false)
  assert.ok(!body.textContent.includes("إيقاف العرض للمشتركين"))
})

test("the correction permission unlocks editing and deleting existing daily entries", () => {
  const body = render(MenuPanel, { ...props, canCorrect: true })
  assert.equal(body.querySelector('input[aria-label="المطبوخ اليوم من وجبة دجاج"]').disabled, false)
  assert.ok(body.querySelector('button[aria-label="حذف وجبة دجاج من قائمة اليوم"]'))
  assert.ok(body.textContent.includes("إيقاف العرض للمشتركين"))
})

test("a newly added unsaved meal is editable before its first save", () => {
  const body = render(MenuPanel, { ...props, menu: undefined })
  assert.equal(body.querySelector('input[aria-label="المطبوخ اليوم من وجبة دجاج"]').disabled, false)
  assert.ok(body.querySelector('button[aria-label="حذف وجبة دجاج من قائمة اليوم"]'))
})

test("stock totals show carryover beside today's production, reservation, sales and remaining stock", () => {
  const body = render(DailyMealAvailability, { menu, meals: [meal] })
  const totals = body.querySelector('[aria-label="إجماليات رصيد وجبات اليوم"]')
  assert.equal(totals.children.length, 5)
  assert.match(totals.lastElementChild.textContent, /المرحّل من الأيام السابقة20/)
  assert.match(totals.textContent, /المطبوخ اليوم50/)
  assert.match(totals.textContent, /إجمالي المتبقي35/)
})

test("carried meals appear before creating today's menu and are not counted as new cooking", () => {
  const result = menuWithCarryover(undefined, [{ mealId: meal.id, carriedOverQuantity: 12 }], "2026-10-18")
  assert.equal(result.items[0].preparedQuantity, 0)
  assert.equal(result.items[0].remainingQuantity, 12)
  const saved = menuWithCarryover(menu, [{ mealId: meal.id, carriedOverQuantity: 20 }], menu.businessDate)
  assert.equal(saved.items.length, 1)
})

test("adding permission never implicitly grants correction rights, and correction remains branch scoped", () => {
  const grants = permission => [{ organizationId: "org", permission, scopeType: "SELECTED_BRANCHES", branchIds: ["a"] }]
  assert.equal(canAccessPermissions(grants("restaurant.menu.manage"), ["restaurant.menu.correct"], "org", "a"), false)
  assert.equal(canAccessPermissions(grants("restaurant.menu.correct"), ["restaurant.menu.manage"], "org", "a"), true)
  assert.equal(canAccessPermissions(grants("restaurant.menu.correct"), ["restaurant.menu.correct"], "org", "b"), false)
})

test("restaurant audit details expose exact quantities, visibility and special-price changes", () => {
  const details = readableDetails({ changes: [{ mealName: meal.name, beforeQuantity: 50, afterQuantity: 70, beforeEnabled: true, afterEnabled: false, beforeSpecialPriceMinor: "500", afterSpecialPriceMinor: "600" }] })
  assert.match(details[0].value, /وجبة دجاج: المطبوخ من 50 إلى 70/)
  assert.match(details[0].value, /الظهور من ظاهر إلى مخفي/)
  assert.match(details[0].value, /السعر الخاص/)
})
