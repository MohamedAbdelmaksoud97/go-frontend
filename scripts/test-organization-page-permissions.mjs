import assert from "node:assert/strict"
import { test } from "node:test"
import { canAccessPermissions, firstAllowedDestination } from "../lib/permissions.ts"

const org="019c4f00-0000-7000-8000-000000000001", branch="019c4f00-0000-7000-8000-000000000002"
const grants=(scopeType,permissions)=>permissions.map(permission=>({organizationId:org,permission,scopeType,branchIds:[branch]}))

test("branch grants do not open organization master data or select it as a landing page",()=>{
 const scoped=grants("SELECTED_BRANCHES",["organization.read","branch.read"])
 const allowed=permissions=>canAccessPermissions(scoped,permissions,org,branch)
 assert.equal(allowed(["organization.read"]),false)
 assert.equal(allowed(["branch.read"]),false)
 assert.equal(firstAllowedDestination(allowed),"/self-service")
})

test("organization grants retain access to organization master data",()=>{
 const scoped=grants("ORGANIZATION",["branch.manage"])
 const allowed=permissions=>canAccessPermissions(scoped,permissions,org,branch)
 assert.equal(allowed(["organization.read"]),true)
 assert.equal(allowed(["branch.read"]),true)
 assert.equal(firstAllowedDestination(allowed),"/system-settings/branches")
})

test("branch operational permissions continue to work only in the granted branch",()=>{
 const scoped=grants("SELECTED_BRANCHES",["members.manage"])
 assert.equal(canAccessPermissions(scoped,["members.read"],org,branch),true)
 assert.equal(canAccessPermissions(scoped,["members.read"],org,"another-branch"),false)
 assert.equal(canAccessPermissions(scoped,[],org,branch),true)
})
