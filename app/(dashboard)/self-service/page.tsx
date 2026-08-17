"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Dumbbell, Loader2, UserRound } from "lucide-react"
import { useAppContext } from "@/components/app-context"
import { EmployeeSelfPanel } from "@/components/employee-self-panel"
import { MemberDailyMenu } from "@/components/member-daily-menu"
import { MemberMarketplace } from "@/components/member-marketplace"
import { MemberSelfOverview } from "@/components/member-self-overview"
import { apiRequest } from "@/lib/api-client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type MemberLink={organizationId:string;memberId:string;registrationBranchId:string;memberName:string;memberNumber:string;relationship?:string;canView?:boolean;canBook?:boolean;canManageMembership?:boolean}
type EmployeeLink={organizationId:string;employeeId:string;employeeNumber:string;name:string;status?:string;trainerProfileId?:string}
type SelfContext={members?:MemberLink[];employees?:EmployeeLink[]}

export default function SelfServicePage(){const context=useAppContext();const[data,setData]=useState<SelfContext>({});const[loading,setLoading]=useState(true);const[error,setError]=useState("")
 useEffect(()=>{let cancelled=false;const frame=requestAnimationFrame(()=>apiRequest<SelfContext>("/self").then(response=>{if(!cancelled)setData(response.data)}).catch(()=>{if(!cancelled)setError("تعذر تحميل بيانات الخدمة الذاتية.")}).finally(()=>{if(!cancelled)setLoading(false)}));return()=>{cancelled=true;cancelAnimationFrame(frame)}},[])
 const members=data.members??[],employees=data.employees??[]
 return <div className="fade-up"><Badge variant="outline"><UserRound/>مساحتي</Badge><h1 className="mt-4 text-3xl font-black">مرحبًا، {context.account?.displayName?.trim()||members[0]?.memberName||employees[0]?.name||"مستخدم GO"}</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">هذه المساحة مبنية على الروابط الحقيقية لحسابك: عضويتك، دوامك، أو مهامك كمدرب.</p>{error&&<p className="mt-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-600">{error}</p>}{loading?<div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin text-primary"/></div>:<>
  {members.map(member=><div key={member.memberId}><MemberSelfOverview member={member}/><MemberMarketplace member={member}/>{member.canBook&&<MemberDailyMenu organizationId={member.organizationId} memberId={member.memberId} branchId={member.registrationBranchId}/>}</div>)}
  {employees.map(employee=><EmployeeSelfPanel key={employee.employeeId} employee={employee} branchId={context.branchId}/>) }
  {employees.some(employee=>employee.trainerProfileId)||context.canAccess(["coaching.read"])?<Card className="mt-5"><CardContent className="flex flex-wrap items-center gap-4 p-5"><span className="grid size-11 place-items-center rounded-xl bg-violet-500/10 text-violet-600"><Dumbbell/></span><div><h2 className="font-black">مساحة المدرب</h2><p className="mt-1 text-xs text-muted-foreground">متدربوك وجدولك وخطط التدريب والقياسات والعمولات.</p></div><Link href="/trainer" className="mr-auto"><Button>فتح مساحة المدرب</Button></Link></CardContent></Card>:null}
  {!members.length&&!employees.length&&!error?<Card className="mt-5"><CardContent className="p-12 text-center text-sm text-muted-foreground">هذا الحساب غير مرتبط بعضو أو موظف نشط. راجع مسؤول النظام لإكمال الربط.</CardContent></Card>:null}
 </>}</div>}
