"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import type { Grant } from "@/lib/permissions"
import { can } from "@/lib/permissions"

type Branch={id:string;nameAr?:string;name?:string;status?:string}
type AppContextValue={grants:Grant[];organizationId:string;branchId:string;branches:Branch[];loading:boolean;error?:string;setOrganizationId:(id:string)=>void;setBranchId:(id:string)=>void;reload:()=>Promise<void>;canAccess:(permissions:string[])=>boolean}
const AppContext=createContext<AppContextValue|undefined>(undefined)

function stored(key:string){if(typeof window==="undefined")return "";return localStorage.getItem(key)??""}
export function AppProvider({children}:{children:React.ReactNode}){
 const [grants,setGrants]=useState<Grant[]>([]);const [organizationId,setOrganizationState]=useState("");const [branchId,setBranchState]=useState("");const [branches,setBranches]=useState<Branch[]>([]);const [loading,setLoading]=useState(hasRuntimeApi());const [error,setError]=useState<string>()
 const setOrganizationId=useCallback((id:string)=>{setOrganizationState(id);localStorage.setItem("go-organization",id)},[])
 const setBranchId=useCallback((id:string)=>{setBranchState(id);localStorage.setItem("go-branch",id)},[])
 const reload=useCallback(async()=>{if(!hasRuntimeApi()){setLoading(false);return}setLoading(true);setError(undefined);try{const me=await apiRequest<{grants:Grant[]}>("/me");const nextGrants=me.data.grants??[];setGrants(nextGrants);const organizations=[...new Set(nextGrants.map(grant=>grant.organizationId))];const savedOrg=stored("go-organization");const nextOrg=organizations.includes(savedOrg)?savedOrg:organizations[0]??"";setOrganizationId(nextOrg);if(nextOrg){const response=await apiRequest<Branch[]|{items:Branch[]}>(`/organizations/${nextOrg}/branches`);const list=Array.isArray(response.data)?response.data:response.data.items??[];setBranches(list);const allowed=new Set(nextGrants.filter(g=>g.organizationId===nextOrg).flatMap(g=>g.scopeType==="ORGANIZATION"?list.map(b=>b.id):g.branchIds));const savedBranch=stored("go-branch");setBranchId(allowed.has(savedBranch)?savedBranch:[...allowed][0]??"")}}catch(err){setError(err instanceof Error?err.message:"تعذر تحميل سياق الصلاحيات")}finally{setLoading(false)}},[setBranchId,setOrganizationId])
 useEffect(()=>{const frame=requestAnimationFrame(()=>void reload());return()=>cancelAnimationFrame(frame)},[reload])
 const value=useMemo<AppContextValue>(()=>({grants,organizationId,branchId,branches,loading,error,setOrganizationId,setBranchId,reload,canAccess:permissions=>permissions.length===0||!hasRuntimeApi()||loading||permissions.some(permission=>can(grants,permission,organizationId,branchId))}),[grants,organizationId,branchId,branches,loading,error,setOrganizationId,setBranchId,reload])
 return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
export function useAppContext(){const value=useContext(AppContext);if(!value)throw new Error("useAppContext must be used inside AppProvider");return value}
