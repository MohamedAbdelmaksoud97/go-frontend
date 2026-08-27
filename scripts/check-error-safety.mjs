import { readFileSync, readdirSync } from "node:fs"
import { extname, join, relative } from "node:path"
import process from "node:process"

const root = process.cwd()
const files = ["app", "components", "lib"].flatMap(directory => sourceFiles(join(root, directory)))
const violations = []

for (const file of files) {
  const source = readFileSync(file, "utf8")
  const displayPath = relative(root, file)

  if ((displayPath.startsWith("app") || displayPath.startsWith("components")) && /\b(?:reason|error|err|exception)\.message\b/u.test(source)) {
    violations.push(`${displayPath}: يعرض Error.message مباشرة في واجهة المستخدم`)
  }
  if (displayPath !== join("lib", "api-client.ts") && /\bproblem\.detail\b/u.test(source)) {
    violations.push(`${displayPath}: يعتمد على problem.detail غير الموثوق بدل humanError`)
  }
  if (displayPath.startsWith(join("app", "api")) && /NextResponse\.json\(\s*\{\s*error\s*:/u.test(source)) {
    violations.push(`${displayPath}: يعيد شكلاً غير موحد لخطأ API`)
  }
}

if (violations.length) {
  console.error("فشل فحص سلامة رسائل الأخطاء:\n" + violations.map(item => `- ${item}`).join("\n"))
  process.exit(1)
}

console.log(`Error-message safety verified across ${files.length} frontend files.`)

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : []
  })
}
