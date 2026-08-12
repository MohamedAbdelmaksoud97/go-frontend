import fs from "node:fs"

const operations=JSON.parse(fs.readFileSync(new URL("../lib/generated/endpoints.json",import.meta.url),"utf8"))
const keys=operations.map(operation=>`${operation.method.toUpperCase()} ${operation.path}`)
const duplicates=keys.filter((key,index)=>keys.indexOf(key)!==index)
const uncovered=operations.filter(operation=>!operation.operationId||!operation.method||!operation.path)
if(duplicates.length||uncovered.length){
 console.error({duplicates,uncovered})
 process.exit(1)
}
console.log(`Endpoint coverage OK: ${operations.length}/${operations.length} operations mapped.`)
