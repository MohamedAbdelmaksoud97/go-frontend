import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { createElement } from "react"
import * as React from "react"
import * as jsxRuntime from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"
import { actionLabel, actionDescription, aggregateLabel, aggregateTypes, readableDetails, relatedRecordLabel, relatedRecordHint } from "../lib/audit-display.ts"

const promotion = {
  id: "1", action: "promotion.created", aggregateType: "promotion", actorType: "user", correlationId: "trace-a",
  occurredAt: "2026-10-08T01:22:00Z", aggregateDisplayName: "عرض الصيف", aggregateReference: "SUMMER",
  summary: { code: "SUMMER", benefitType: "FIXED_DISCOUNT", benefitValue: 10000 },
}

test("a historical promotion displays its actual operation, offer and discount", () => {
  assert.equal(actionLabel(promotion.action, promotion.aggregateType), "إنشاء عرض ترويجي")
  assert.equal(relatedRecordLabel(promotion), "عرض الصيف")
  assert.match(relatedRecordHint(promotion), /SUMMER/)
  assert.match(actionDescription(promotion), /عرض الصيف.*قيمة العرض/)
  const details = readableDetails(promotion.summary)
  assert.deepEqual(details.map(item => item.label), ["الرمز", "نوع العرض", "قيمة العرض"])
  assert.equal(details[1].value, "خصم بمبلغ ثابت")
  assert.match(details[2].value, /١٠٠.*ر\.س\./)
})

test("percentage discounts use basis points and fixed final prices use currency", () => {
  const percentage = readableDetails({ benefitType: "PERCENTAGE", benefitValue: 2550 })
  assert.equal(percentage.find(item => item.key === "benefitValue").value, "25.5%")
  const fixed = readableDetails({ benefitType: "FIXED_FINAL_PRICE", benefitValue: 15000 })
  assert.match(fixed.find(item => item.key === "benefitValue").value, /١٥٠.*ر\.س\./)
})

test("structured prices and before/after states are readable", () => {
  const details = readableDetails({
    amount: { minorUnits: "25000", currency: "SAR" },
    before: { status: "ACTIVE", memberId: "private-id" }, after: { status: "INACTIVE", password: "private-password" },
  })
  assert.match(details.find(item => item.key === "amount").value, /٢٥٠.*ر\.س\./)
  assert.equal(details.find(item => item.key === "before.status").label, "الحالة قبل التعديل")
  assert.equal(details.find(item => item.key === "before.status").value, "نشط")
  assert.equal(details.find(item => item.key === "after.status").value, "غير نشط")
  assert.ok(!JSON.stringify(details).includes("private-"))
})

test("safe snapshot names survive renaming or deletion of the related record", () => {
  assert.equal(relatedRecordLabel({ ...promotion, summary: { name: "اسم العرض وقت الإنشاء" } }), "اسم العرض وقت الإنشاء")
  assert.equal(relatedRecordLabel({ ...promotion, aggregateDisplayName: undefined }), "SUMMER")
})

test("new unknown events preserve their codes instead of inventing a generic description", () => {
  assert.equal(actionLabel("promotion.future-event", "promotion"), "إجراء غير مصنّف (promotion.future-event)")
  assert.equal(aggregateLabel("future-record"), "نوع سجل غير مصنّف (future-record)")
})

test("compound action names use the actual aggregate type", () => {
  assert.equal(actionLabel("restaurant.price-created", "meal-price"), "إنشاء سعر وجبة")
  assert.equal(actionLabel("workforce.employee-updated", "employee"), "تعديل بيانات موظف")
  assert.equal(actionLabel("price-version.archived", "price-version"), "أرشفة سعر خدمة أو باقة")
  assert.equal(actionLabel("branch-service-availability.created", "branch-service-availability"), "إنشاء إتاحة خدمة في فرع")
})

test("redacted values, technical IDs and unapproved fields stay out of the human summary", () => {
  const details = readableDetails({ name: "[REDACTED]", email: "private@example.com", password: "secret", token: "token", nationalId: "national-id", memberId: "member-id", code: "SUMMER", benefitType: "PERCENTAGE", benefitValue: 1000 })
  assert.deepEqual(details.map(item => item.key), ["code", "benefitType", "benefitValue"])
})

test("previously missing audit sections can be filtered", () => {
  for (const type of ["promotion", "price-version", "commercial-policy-version", "activity", "branch-service-availability", "meal-price", "feedback-case"]) {
    assert.ok(aggregateTypes.some(([value]) => value === type), type)
  }
})

test("the actual audit card renders the operation, related offer and useful details", () => {
  const html = renderAuditCard(promotion)
  for (const text of ["إنشاء عرض ترويجي", "عرض الصيف", "SUMMER", "خصم بمبلغ ثابت", "قيمة العرض", "promotion.created"]) assert.ok(html.includes(text), text)
  assert.ok(!html.includes("سجل بالنظام"))
  assert.ok(!html.includes("إنشاء سجل جديد"))
})

test("audit cards escape record names instead of interpreting them as markup", () => {
  const html = renderAuditCard({ ...promotion, summary: { name: '<img src=x onerror="alert(1)">' } })
  assert.ok(html.includes("&lt;img"))
  assert.ok(!html.includes("<img"))
})

function renderAuditCard(record) {
  const testModule = { exports: {} }
  const source = readFileSync(new URL("../components/system-audit-log.tsx", import.meta.url), "utf8")
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const display = { actionLabel, actionDescription, aggregateLabel, aggregateTypes, readableDetails, relatedRecordLabel, relatedRecordHint, auditDateTime: value => value }
  runInNewContext(`${code}\nexports.testCard = AuditRecordCard`, {
    module: testModule, exports: testModule.exports,
    require: name => {
      if (name === "react") return React
      if (name === "react/jsx-runtime") return jsxRuntime
      if (name === "@/lib/audit-display") return display
      if (name === "lucide-react") return new Proxy({}, { get: () => () => null })
      if (name.startsWith("@/components/ui/")) return new Proxy({}, { get: () => ({ children, className }) => createElement("div", { className }, children) })
      if (["@/components/app-context", "@/lib/api-client", "@/lib/human-errors"].includes(name)) return {}
      throw new Error(`Unexpected component dependency: ${name}`)
    },
  })
  return renderToStaticMarkup(createElement(testModule.exports.testCard, { record }))
}
