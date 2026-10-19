import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { test } from "node:test"
import ts from "typescript"

const source = readFileSync(new URL("../lib/kitchen-orders.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const order = (id, status = "CONFIRMED", branchId = "a", version = 1) => ({ id, status, branchId, version })
function loader(request) {
  const testModule = { exports: {} }
  runInNewContext(compiled, { module: testModule, exports: testModule.exports, require: () => ({ apiRequest: request }), URLSearchParams })
  return testModule.exports.loadKitchenOrders
}

test("kitchen skips historical orders and follows every active status page, including more than 100 new orders", async () => {
  const records = [...Array.from({ length: 150 }, (_, i) => order(`old-${i}`, "COMPLETED")), ...Array.from({ length: 131 }, (_, i) => order(`new-${String(i).padStart(3, "0")}`)), order("preparing", "PREPARING"), order("ready", "READY")]
  const calls = []
  const load = loader(async path => {
    const url = new URL(path, "http://local"), query = url.searchParams
    calls.push(query)
    assert.equal(query.get("branchId"), "a")
    assert.ok(["CONFIRMED", "PREPARING", "READY"].includes(query.get("status")))
    const filtered = records.filter(row => row.status === query.get("status") && row.branchId === query.get("branchId"))
    const start = query.has("cursor") ? filtered.findIndex(row => row.id === query.get("cursor")) + 1 : 0
    const items = filtered.slice(start, start + 100)
    return { data: items, meta: start + 100 < filtered.length ? { nextCursor: items.at(-1).id } : {} }
  })
  const rows = await load({ organizationId: "org", branchId: "a" })
  assert.equal(rows.length, 133)
  assert.ok(rows.some(row => row.id === "new-130"))
  assert.ok(rows.every(row => row.status !== "COMPLETED"))
  assert.equal(calls.length, 4)
})

test("all-branch requests retain the organization and omit only the branch filter", async () => {
  const calls = []
  const rows = await loader(async path => {
    const url = new URL(path, "http://local"); calls.push(url)
    return { data: { items: url.searchParams.get("status") === "CONFIRMED" ? [order("a", "CONFIRMED", "a"), order("b", "CONFIRMED", "b")] : [] } }
  })({ organizationId: "org" })
  assert.equal(rows.length, 2)
  assert.ok(calls.every(url => url.pathname === "/organizations/org/restaurant-orders" && !url.searchParams.has("branchId")))
})

test("a transitioning order is shown once using the latest returned version", async () => {
  const rows = await loader(async path => ({ data: new URL(path, "http://local").searchParams.get("status") === "READY" ? [order("one", "READY", "a", 3)] : [order("one", "PREPARING", "a", 2)] }))({ organizationId: "org", branchId: "a" })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, "READY")
  assert.equal(rows[0].version, 3)
})

test("a failed later page rejects the refresh rather than presenting an incomplete queue", async () => {
  const load = loader(async path => {
    const query = new URL(path, "http://local").searchParams
    if (query.has("cursor")) throw new Error("backend unavailable")
    return { data: [order("first", query.get("status"))], meta: { nextCursor: "first" } }
  })
  await assert.rejects(load({ organizationId: "org" }), /backend unavailable/)
})

test("the request abort signal reaches every status/page and repeated cursors cannot loop forever", async () => {
  const controller = new AbortController()
  let requests = 0
  const load = loader(async (_, init) => {
    requests++; assert.equal(init.signal, controller.signal)
    return { data: [order("one")], meta: { nextCursor: "one" } }
  })
  await assert.rejects(load({ organizationId: "org", signal: controller.signal }), /صفحات/)
  assert.ok(requests <= 6)
})
