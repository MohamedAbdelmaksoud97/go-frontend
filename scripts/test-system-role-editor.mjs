import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {runInNewContext} from "node:vm"
import {test} from "node:test"
import {Window} from "happy-dom"
import ts from "typescript"
import {permissionImplications} from "../lib/permissions.ts"
import {permissionActions,permissionPresentation} from "../lib/permission-display.ts"
const window=new Window({url:"http://localhost/"})
for(const name of ["window","document","navigator","HTMLElement","HTMLInputElement","Node","Event","MutationObserver"])Object.defineProperty(globalThis,name,{value:name==="window"?window:window[name],configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const React=await import("react"),runtime=await import("react/jsx-runtime"),{createRoot}=await import("react-dom/client")
const native=tag=>function Control({children,variant,size,...props}){void variant;void size;return React.createElement(tag,props,children)}
const pause=()=>new Promise(resolve=>setTimeout(resolve,15))
const permission="reporting.restaurant-revenue.read"
async function mount({systemKey="TEST_CHEF",fail=false}={}){
 const calls=[],item={id:"chef-role",name:"Test Chef",description:"Seeded restaurant role",systemKey,status:"ACTIVE",version:3,permissions:["restaurant.orders.prepare"]},saved={count:0}
 const compiled={exports:{}}
 const code=ts.transpileModule(readFileSync(new URL("../components/master-data-page.tsx",import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
 runInNewContext(code+"\nexports.Form=MasterForm;exports.configs=configs",{module:compiled,exports:compiled.exports,require:name=>{
  if(name==="react")return React
  if(name==="react/jsx-runtime")return runtime
  if(name==="lucide-react")return new Proxy({},{get:()=>()=>null})
  if(name==="@/lib/api-client")return {hasRuntimeApi:()=>false,apiRequest:async(path,options)=>{calls.push({path,method:options.method,body:JSON.parse(options.body)});if(fail)throw Error("permission_delegation_denied");return {data:{}}}}
  if(name==="@/lib/human-errors")return {humanError:error=>error.message}
  if(name==="@/lib/permissions")return {permissionImplications}
  if(name==="@/lib/permission-display")return {permissionActions,permissionPresentation}
  if(name.startsWith("@/components/ui/"))return new Proxy({},{get:(_,key)=>native(key==="Button"?"button":key==="Input"?"input":"div")})
  return {}
 },Date,Intl,Map,Set,URL,Number,String})
 const config=compiled.exports.configs.find(config=>config.id==="roles")
 const container=document.createElement("div");document.body.append(container);const root=createRoot(container)
 await React.act(async()=>{root.render(React.createElement(compiled.exports.Form,{config,mode:"edit",item,organizationId:"org",branchId:"branch",references:{permissions:[{code:permission},{code:"restaurant.orders.prepare"}]},setReferences(){},onClose(){},onSaved(){saved.count++}}));await pause()})
 return {container,calls,saved,item,
  add:async()=>React.act(async()=>{const label=[...container.querySelectorAll("label")].find(label=>label.textContent.includes(permission));label.querySelector('input[type="checkbox"]').click();await pause()}),
  submit:async()=>React.act(async()=>{container.querySelector("form").dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true}));await pause()}),
  close:async()=>{await React.act(async()=>root.unmount());container.remove()},
 }
}
for(const systemKey of ["TEST_CHEF","TEST_TRAINER","BRANCH_MANAGER"])test(`${systemKey} saves permissions through the dedicated endpoint without renaming the seeded role`,async()=>{
 const view=await mount({systemKey});try{
  assert.equal(view.container.querySelector('input[type="text"]'),null)
  assert.equal(view.container.querySelector('textarea'),null)
  assert.match(view.container.textContent,/اسم المجموعة وبياناتها الأساسية محفوظة/)
  await view.add();await view.submit()
  assert.deepEqual(view.calls,[{path:"/organizations/org/roles/chef-role/permissions",method:"PUT",body:{permissions:["restaurant.orders.prepare",permission]}}])
  assert.equal(view.saved.count,1)
 }finally{await view.close()}
})
test("custom role keeps versioned metadata editing",async()=>{
 const view=await mount({systemKey:null});try{await view.add();await view.submit();assert.equal(view.calls[0]?.method,"PATCH");assert.equal(view.calls[0]?.path,"/organizations/org/roles/chef-role");assert.equal(view.calls[0]?.body.name,"Test Chef");assert.equal(view.calls[0]?.body.expectedVersion,3)}finally{await view.close()}
})
test("even an accidentally opened System Administrator editor cannot send a mutation",async()=>{
 const view=await mount({systemKey:"SYSTEM_ADMIN"});try{await view.submit();assert.equal(view.calls.length,0);assert.match(view.container.querySelector('[role="alert"]').textContent,/مسؤول النظام محمية/)}finally{await view.close()}
})
test("a denied permission update keeps the dialog open with its error",async()=>{
 const view=await mount({fail:true});try{await view.add();await view.submit();assert.equal(view.saved.count,0);assert.equal(view.calls[0]?.method,"PUT");assert.match(view.container.querySelector('[role="alert"]').textContent,/permission_delegation_denied/)}finally{await view.close()}
})
