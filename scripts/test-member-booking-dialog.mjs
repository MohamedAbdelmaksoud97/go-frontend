import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import ts from "typescript"

const source = readFileSync(new URL("../components/member-marketplace.tsx", import.meta.url), "utf8")
const tree = ts.createSourceFile("member-marketplace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

function elements(root, tag) {
  const result = []
  function visit(node) {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : undefined
    if (opening?.tagName.getText(tree) === tag) result.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return result
}

test("member court and session booking content stays in the popup, not below the catalog", () => {
  const popup = elements(tree, "Dialog.Popup")[0]
  assert.ok(popup)
  assert.equal(elements(popup, "BookingAvailability").length, 1)
  assert.equal(elements(popup, "form").length, 1)
  assert.ok(popup.getText(tree).includes("onSubmit={bookCourt}"))
  assert.ok(popup.getText(tree).includes("onClick={() => void book(slot)}"))
  for (const catalog of elements(tree, "CardContent")) {
    assert.equal(elements(catalog, "BookingAvailability").length, 0)
    assert.equal(elements(catalog, "form").length, 0)
  }
})

test("booking popup uses the modal library, RTL, accessible title and a close control", () => {
  const portal = elements(tree, "Dialog.Portal")[0]
  const popup = elements(portal, "Dialog.Popup")[0]
  assert.ok(popup.openingElement.attributes.getText(tree).includes('dir="rtl"'))
  assert.equal(elements(popup, "Dialog.Title").length, 1)
  assert.equal(elements(popup, "Dialog.Description").length, 1)
  assert.equal(elements(popup, "Dialog.Close").length, 1)
  assert.ok(popup.getText(tree).includes("overflow-y-auto"))
  assert.ok(popup.getText(tree).includes("max-h-[94dvh]"))
})
