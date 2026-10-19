import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { can, canViewReport, firstAllowedDestination, permissionsForRoute, reportPermissions, reportsRoutePermissions } from "../lib/permissions.ts"
import { permissionPresentation } from "../lib/permission-display.ts"
const org="org",a="a",b="b"
const grant=(permission,branch=a)=>({permission,organizationId:org,scopeType:"SELECTED_BRANCHES",branchIds:[branch]})
for(const [type,permission]of Object.entries(reportPermissions))test(`${type} is independently selectable and does not grant other reports or operations`,()=>{
 const grants=[grant(permission)]
 assert.equal(reportsRoutePermissions.length,17)
 assert.equal(reportsRoutePermissions.filter(code=>can(grants,code,org,a)).length,1)
 assert.equal(canViewReport(grants,permission,org,a),true)
 assert.equal(canViewReport(grants,permission,org,b),false)
 assert.equal(canViewReport(grants,permission,org),true)
 assert.equal(canViewReport(grants,permission,"foreign"),false)
 for(const code of ["reporting.read","members.read","finance.invoices.read","restaurant.orders.read","attendance.devices.read"])assert.equal(can(grants,code,org,a),false)
 assert.ok(permissionsForRoute("/reports").some(code=>can(grants,code,org,a)))
 assert.equal(firstAllowedDestination(required=>required.some(code=>can(grants,code,org,a))),"/reports")
 assert.match(permissionPresentation(permission).label,/تقرير/)
})
test("legacy dashboard and maintenance grants do not open report routes",()=>{
 for(const permission of ["reporting.read","reporting.rebuild","restaurant.orders.prepare"]){const grants=[grant(permission)];assert.equal(permissionsForRoute("/reports").some(code=>can(grants,code,org,a)),false)}
})
test("member drill-down needs its own report permission",()=>{
 const grants=[grant(reportPermissions.packages)]
 assert.equal(permissionsForRoute("/reports/package/target").some(code=>can(grants,code,org,a)),false)
 grants.push(grant(reportPermissions.members))
 assert.equal(permissionsForRoute("/reports/promotion/target").some(code=>can(grants,code,org,a)),true)
})
test("frontend report codes match the backend registry and mappings exactly",()=>{
 const source=readFileSync(new URL("../../gosystem/src/modules/reporting/application/report-permissions.ts",import.meta.url),"utf8")
 const codes=[...new Set([...source.matchAll(/"(reporting\.[a-z.-]+\.read)"/g)].map(match=>match[1]))].sort()
 assert.deepEqual([...reportsRoutePermissions].sort(),codes)
 assert.equal(new Set(reportsRoutePermissions.map(code=>permissionPresentation(code).label)).size,17)
})
