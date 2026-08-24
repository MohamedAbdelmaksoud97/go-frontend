import fs from "node:fs"

const operations=JSON.parse(fs.readFileSync(new URL("../lib/generated/endpoints.json",import.meta.url),"utf8"))
const keys=operations.map(operation=>`${operation.method.toUpperCase()} ${operation.path}`)
const duplicates=keys.filter((key,index)=>keys.indexOf(key)!==index)
const uncovered=operations.filter(operation=>!operation.operationId||!operation.method||!operation.path)
const requiredIdempotencyOperations=new Set([
 "checkoutOrder",
 "checkoutSelfMemberOrder",
 "createCrmLead",
 "createCrmLeadFollowUp",
 "createManualReservation",
 "createOnlineRequest",
 "recordEmployeeAttendance",
 "recordExpense",
 "recordManualAttendance",
 "recordOtherIncome",
 "recordPayment",
 "recordSelfEmployeeAttendance",
 "redeemMealPlan",
 "refundPayment",
])
const missingIdempotency=operations.filter(operation=>requiredIdempotencyOperations.has(operation.operationId)&&!operation.idempotent)
const missingRequiredOperations=[...requiredIdempotencyOperations].filter(operationId=>!operations.some(operation=>operation.operationId===operationId))
const masterDataSource=fs.readFileSync(new URL("../components/master-data-page.tsx",import.meta.url),"utf8")
const permissionsSource=fs.readFileSync(new URL("../lib/permissions.ts",import.meta.url),"utf8")
const backendPermissionSource=fs.readFileSync(new URL("../../gosystem/src/modules/identity-access/domain/permission-codes.ts",import.meta.url),"utf8")
const canonicalBlock=backendPermissionSource.match(/export const PERMISSION_CODES\s*=\s*\[([\s\S]*?)\]\s*as const/)?.[1]??""
const canonicalPermissions=[...canonicalBlock.matchAll(/"([a-z0-9.-]+)"/g)].map(match=>match[1])
const frontendFiles=[]
function collectFrontendSources(directory){
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  if(entry.name==="node_modules"||entry.name===".next")continue
  const target=new URL(`${entry.name}${entry.isDirectory()?"/":""}`,directory)
  if(entry.isDirectory())collectFrontendSources(target)
  else if(/\.(?:ts|tsx|mjs)$/.test(entry.name))frontendFiles.push(fs.readFileSync(target,"utf8"))
 }
}
collectFrontendSources(new URL("../",import.meta.url))
const frontendSource=frontendFiles.join("\n")
const missingFrontendPermissions=canonicalPermissions.filter(permission=>!frontendSource.includes(`"${permission}"`)&&!frontendSource.includes(`'${permission}'`))
function implicationMap(source,exportName){
 const block=source.match(new RegExp(`(?:export const ${exportName}[^=]*=\\s*\\{)([\\s\\S]*?)(?:\\n\\};|\\n})`))?.[1]??""
 return Object.fromEntries([...block.matchAll(/"([a-z0-9.-]+)"\s*:\s*\[([^\]]*)\]/g)].map(match=>[match[1],[...match[2].matchAll(/"([a-z0-9.-]+)"/g)].map(value=>value[1]).sort()]))
}
const backendImplications=implicationMap(backendPermissionSource,"PERMISSION_IMPLICATIONS")
const frontendImplications=implicationMap(permissionsSource,"permissionImplications")
const implicationMismatch=JSON.stringify(backendImplications)!==JSON.stringify(frontendImplications)
const masterDataPermissions=[...masterDataSource.matchAll(/(?:permission|managePermission):\s*"([^"]+)"/g)].map(match=>match[1])
const settingsPermissionsBlock=permissionsSource.match(/export const systemSettingsPermissions=\[([\s\S]*?)\]\s+as const/)?.[1]??""
const settingsRoutePermissions=[...settingsPermissionsBlock.matchAll(/"([^"]+)"/g)].map(match=>match[1])
const missingSettingsRoutePermissions=[...new Set(masterDataPermissions)].filter(permission=>!settingsRoutePermissions.includes(permission))
const permissionDrivenSections=["positions","roles"].filter(id=>{
 const section=masterDataSource.match(new RegExp(`id:\\s*"${id}"([\\s\\S]*?)(?=\\n\\s*\\{\\n\\s*id:|\\n\\])`))?.[1]??""
 return !/source:\s*"permissions"/.test(section)
})
const branchReadMismatch=!/id:\s*"branches"[\s\S]{0,220}?permission:\s*"branch\.read"/.test(masterDataSource)
if(duplicates.length||uncovered.length||missingIdempotency.length||missingRequiredOperations.length||missingSettingsRoutePermissions.length||permissionDrivenSections.length||branchReadMismatch||missingFrontendPermissions.length||implicationMismatch){
 console.error({duplicates,uncovered,missingIdempotency,missingRequiredOperations,missingSettingsRoutePermissions,permissionDrivenSections,branchReadMismatch,missingFrontendPermissions,implicationMismatch})
 process.exit(1)
}
console.log(`Endpoint and permission coverage OK: ${operations.length}/${operations.length} operations mapped; ${canonicalPermissions.length}/${canonicalPermissions.length} permissions represented in the UI; ${new Set(masterDataPermissions).size} settings permissions route-accessible; authorization implications synchronized.`)
