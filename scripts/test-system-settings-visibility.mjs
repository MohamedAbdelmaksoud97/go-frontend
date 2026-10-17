import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { runInNewContext } from "node:vm"
import * as React from "react"
import * as jsxRuntime from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
import { Window } from "happy-dom"
import ts from "typescript"
import * as permissions from "../lib/permissions.ts"
import { permissionPresentation } from "../lib/permission-display.ts"

const org="org",branch="branch-a"
let current,path="/restaurant"
function context(codes,scopeType="SELECTED_BRANCHES",selectedBranch=branch){
 const grants=codes.map(permission=>({permission,organizationId:org,scopeType,branchIds:[branch]}))
 return {organizationId:org,branchId:selectedBranch,grants,self:{members:[]},branches:[{id:branch,name:"Main"}],account:{displayName:"Chef"},loading:false,canAccess:required=>permissions.canAccessPermissions(grants,required,org,selectedBranch)}
}
function component(file,extra=""){
 const testModule={exports:{}}
 const source=readFileSync(new URL("../components/"+file,import.meta.url),"utf8")
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
 runInNewContext(code+extra,{module:testModule,exports:testModule.exports,require:name=>{
  if(name==="react")return React
  if(name==="react/jsx-runtime")return jsxRuntime
  if(name==="next/link")return {default:({children,...props})=>React.createElement("a",props,children)}
  if(name==="next/image")return {default:()=>null}
  if(name==="next/navigation")return {usePathname:()=>path,useRouter:()=>({replace(){}})}
  if(name==="lucide-react")return new Proxy({},{get:()=>()=>null})
  if(name==="@/components/app-context")return {useAppContext:()=>current}
  if(name==="@/lib/permissions")return permissions
  if(name==="@/lib/utils")return {cn:(...values)=>values.filter(Boolean).join(" ")}
  if(name==="@/lib/system-guide-content")return {guideGroups:[]}
  if(name==="@/components/ui/button")return {Button:({children,...props})=>React.createElement("button",props,children)}
  if(name==="@/components/ui/card")return {Card:({children})=>children,CardContent:({children})=>children}
  if(name==="@/components/brand-logo")return {BrandLogo:()=>null}
  if(name==="@/components/global-search")return {GlobalSearch:()=>null}
  if(name==="@/components/toast-provider")return {useToast:()=>({})}
  if(name==="@/lib/api-client"||name==="@/lib/access-event")return {}
  throw Error("Unexpected dependency: "+name)
 }})
 return testModule.exports
}
const {AppShell}=component("app-shell.tsx")
const {ActionLinks}=component("system-user-guide.tsx","\nexports.ActionLinks=ActionLinks")
function render(Component,props){const window=new Window();window.document.body.innerHTML=renderToStaticMarkup(React.createElement(Component,props));return window.document.body}

test("chef and cashier permissions keep their work screens while settings stays hidden",()=>{
 current=context(["restaurant.menu.manage","restaurant.orders.prepare","sales.checkout","finance.cash-points.manage","retail.pricing.manage"])
 path="/restaurant"
 const body=render(AppShell,{children:React.createElement("p",null,"kitchen")})
 assert.equal(body.querySelector('a[href="/system-settings/branches"]'),null)
 assert.ok(body.querySelector('a[href="/restaurant"]'))
 assert.ok(body.querySelector('a[href="/cashier"]'))
 assert.ok(body.textContent.includes("kitchen"))
 assert.equal(current.canAccess(["commercial.read"]),true)
})

test("granting and removing the visibility permission toggles the real sidebar",()=>{
 const codes=["restaurant.menu.manage","ui.system-settings.show"]
 current=context(codes);path="/restaurant"
 assert.ok(render(AppShell,{}).querySelector('a[href="/system-settings/branches"]'))
 current=context(codes.filter(code=>code!=="ui.system-settings.show"))
 assert.equal(render(AppShell,{}).querySelector('a[href="/system-settings/branches"]'),null)
})

test("direct settings pages and legacy aliases never render without visibility",()=>{
 current=context(["restaurant.menu.manage","branch.manage","iam.roles.manage","commercial.read"])
 for(path of ["/system-settings","/system-settings/prices","/system-settings/backups","/master-data","/settings"]){
  assert.equal(current.canAccess(permissions.permissionsForRoute(path)),false,path)
  assert.ok(!render(AppShell,{children:React.createElement("p",null,"settings-content")}).textContent.includes("settings-content"),path)
 }
 assert.equal(permissions.firstAllowedDestination(current.canAccess),"/self-service")
})

test("visibility is branch scoped and never supplies settings read or write permissions",()=>{
 current=context(["ui.system-settings.show"])
 assert.equal(current.canAccess(permissions.permissionsForRoute("/system-settings/prices")),true)
 for(const required of ["commercial.read","pricing.manage","restaurant.catalog.manage","iam.roles.manage"]){assert.equal(current.canAccess([required]),false,required)}
 current=context(["ui.system-settings.show"],"SELECTED_BRANCHES","branch-b")
 assert.equal(current.canAccess(permissions.permissionsForRoute("/system-settings/prices")),false)
 current=context(["ui.system-settings.show"],"ORGANIZATION","branch-b")
 assert.equal(current.canAccess(permissions.permissionsForRoute("/system-settings/prices")),true)
})

test("guide links to system settings follow the same visibility switch",()=>{
 const links=[{href:"/system-settings/prices",label:"settings",description:"prices"},{href:"/restaurant",label:"restaurant",description:"work"}]
 current=context(["restaurant.menu.manage"])
 assert.equal(render(ActionLinks,{links}).querySelector('a[href="/system-settings/prices"]'),null)
 assert.ok(render(ActionLinks,{links}).querySelector('a[href="/restaurant"]'))
 current=context(["ui.system-settings.show"])
 assert.ok(render(ActionLinks,{links}).querySelector('a[href="/system-settings/prices"]'))
})

test("permission picker presents the requested Arabic label",()=>{
 const presentation=permissionPresentation("ui.system-settings.show")
 assert.equal(presentation.label,"إظهار إعداد النظام")
 assert.equal(presentation.group,"واجهة النظام")
})
