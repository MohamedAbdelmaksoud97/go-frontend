"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { apiRequest, hasRuntimeApi } from "@/lib/api-client"
import type { Grant } from "@/lib/permissions"
import { can } from "@/lib/permissions"

type Branch={id:string;nameAr?:string;name?:string;status?:string}
type AccountSummary={displayName?:string|null}
export type SelfMemberLink={organizationId:string;memberId:string;registrationBranchId:string;memberName:string;memberNumber:string;relationship?:string;canView?:boolean;canBook?:boolean;canManageMembership?:boolean}
export type SelfEmployeeLink={organizationId:string;employeeId:string;employeeNumber:string;name:string;status?:string;trainerProfileId?:string}
type SelfContext={members?:SelfMemberLink[];employees?:SelfEmployeeLink[]}
type AppContextValue={userAccountId:string;grants:Grant[];organizationId:string;branchId:string;branches:Branch[];account?:AccountSummary;self:SelfContext;loading:boolean;error?:string;setOrganizationId:(id:string)=>void;setBranchId:(id:string)=>void;reload:()=>Promise<void>;canAccess:(permissions:string[])=>boolean;canAccessOrganization:(permissions:string[])=>boolean}
const AppContext=createContext<AppContextValue|undefined>(undefined)

function stored(key:string){if(typeof window==="undefined")return "";return localStorage.getItem(key)??""}
export function AppProvider({children}:{children:React.ReactNode}){
 const [userAccountId,setUserAccountId]=useState("");const [grants,setGrants]=useState<Grant[]>([]);const [organizationId,setOrganizationState]=useState("");const [branchId,setBranchState]=useState("");const [branches,setBranches]=useState<Branch[]>([]);const [self,setSelf]=useState<SelfContext>({});const [loading,setLoading]=useState(hasRuntimeApi());const [error,setError]=useState<string>()
 const [account,setAccount]=useState<AccountSummary>()
 const setOrganizationId=useCallback((id:string)=>{setOrganizationState(id);localStorage.setItem("go-organization",id)},[])
 const setBranchId=useCallback((id:string)=>{setBranchState(id);localStorage.setItem("go-branch",id)},[])
 const reload=useCallback(async()=>{if(!hasRuntimeApi()){setLoading(false);return}setLoading(true);setError(undefined);try{const[me,selfResponse]=await Promise.all([apiRequest<{userAccountId:string;grants:Grant[]}>("/me"),apiRequest<SelfContext>("/self")]);setUserAccountId(me.data.userAccountId??"");setSelf(selfResponse.data??{});const nextGrants=me.data.grants??[];setGrants(nextGrants);const organizations=[...new Set(nextGrants.map(grant=>grant.organizationId))];const savedOrg=stored("go-organization");const nextOrg=organizations.includes(savedOrg)?savedOrg:organizations[0]??"";setOrganizationId(nextOrg);if(!nextOrg){setBranches([]);setBranchId("");return}const response=await apiRequest<Branch[]|{items:Branch[]}>(`/organizations/${nextOrg}/available-branches`);const list=Array.isArray(response.data)?response.data:response.data.items??[];setBranches(list);const allowed=new Set(list.map(branch=>branch.id));const savedBranch=stored("go-branch");setBranchId(allowed.has(savedBranch)?savedBranch:list[0]?.id??"")}catch(err){setUserAccountId("");setSelf({});setBranches([]);setBranchId("");setError(err instanceof Error?err.message:"تعذر تحميل سياق الحساب والصلاحيات")}finally{setLoading(false)}},[setBranchId,setOrganizationId])
 useEffect(()=>{const frame=requestAnimationFrame(()=>void reload());return()=>cancelAnimationFrame(frame)},[reload])
 useEffect(()=>{if(!hasRuntimeApi())return;let cancelled=false;void apiRequest<AccountSummary>("/self/account").then(profile=>{if(!cancelled)setAccount(profile.data)}).catch(()=>undefined);return()=>{cancelled=true}},[])
 const value=useMemo<AppContextValue>(()=>({userAccountId,grants,organizationId,branchId,branches,account,self,loading,error,setOrganizationId,setBranchId,reload,canAccess:permissions=>permissions.length===0||(!loading&&permissions.some(permission=>can(grants,permission,organizationId,branchId))),canAccessOrganization:permissions=>permissions.length===0||(!loading&&permissions.some(permission=>can(grants,permission,organizationId)))}),[userAccountId,grants,organizationId,branchId,branches,account,self,loading,error,setOrganizationId,setBranchId,reload])
 return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
export function useAppContext(){const value=useContext(AppContext);if(!value)throw new Error("useAppContext must be used inside AppProvider");return value}
