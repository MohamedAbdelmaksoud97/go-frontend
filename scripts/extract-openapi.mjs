import fs from "node:fs"
import vm from "node:vm"

const sourcePath=process.argv[2]
const outputPath=process.argv[3]
if(!sourcePath)throw new Error("Usage: node scripts/extract-openapi.mjs <openapi.ts>")
const source=fs.readFileSync(sourcePath,"utf8").replace("export const openApiDocument =","globalThis.openApiDocument =")
const context={}
vm.runInNewContext(source,context)
const operations=[]
for(const [path,item] of Object.entries(context.openApiDocument.paths)){
 for(const [method,operation] of Object.entries(item)){
  operations.push({path,method,operationId:operation.operationId,secured:Boolean(operation.security),idempotent:Boolean(operation.parameters?.some(parameter=>parameter.name==="Idempotency-Key")),description:Object.values(operation.responses??{})[0]?.description??""})
 }
}
const json=`${JSON.stringify(operations,null,2)}\n`
if(outputPath)fs.writeFileSync(outputPath,json)
else process.stdout.write(json)
