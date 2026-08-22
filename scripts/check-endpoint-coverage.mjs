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
if(duplicates.length||uncovered.length||missingIdempotency.length||missingRequiredOperations.length){
 console.error({duplicates,uncovered,missingIdempotency,missingRequiredOperations})
 process.exit(1)
}
console.log(`Endpoint coverage OK: ${operations.length}/${operations.length} operations mapped.`)
