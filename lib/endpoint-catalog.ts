import rawEndpoints from "@/lib/generated/endpoints.json"

export type EndpointOperation={path:string;method:"get"|"post"|"patch"|"put"|"delete";operationId:string;secured:boolean;idempotent:boolean;description:string}
export type EndpointModule={slug:string;label:string;description:string;match:(operation:EndpointOperation)=>boolean}

export const endpointModules:EndpointModule[]=[
 {slug:"platform",label:"المنصة والمصادقة",description:"الصحة، الجلسة، OTP، MFA والحساب الشخصي",match:o=>/^\/(health|hooks)|\/auth\/|\/me$|\/self\/account$|\/openapi/.test(o.path)},
 {slug:"organization",label:"المنظمة والصلاحيات",description:"الفروع، الحسابات، الأدوار والمنح",match:o=>/permissions|roles|role-assignments|user-accounts|\/branches(?:\/|$)|\/organizations\/\{organizationId\}$/.test(o.path)},
 {slug:"members",label:"الأعضاء والملفات",description:"الأعضاء، أولياء الأمور، الملفات والباركود",match:o=>/members|guardian|files|access-credentials/.test(o.path)&&!o.path.includes("/self/")},
 {slug:"workforce",label:"الموظفون والمدربون",description:"الموظفون، المناوبات، الحضور والتدريب والقياسات",match:o=>/employees|employee-|positions|trainers|coaching|measurement|commission|training-plan/.test(o.path)&&!o.path.includes("/self/")},
 {slug:"catalog",label:"الكتالوج والتجارة",description:"الأنشطة والخدمات والباقات والأسعار والعروض",match:o=>/activities|service-categories|services|commercial-policies|packages|prices|promotions|quotes/.test(o.path)&&!o.path.includes("/self/")},
 {slug:"subscriptions",label:"الاشتراكات",description:"إنشاء الاشتراك وكل انتقالات دورة حياته",match:o=>/subscriptions/.test(o.path)&&!o.path.includes("/self/")},
 {slug:"finance",label:"المبيعات والمالية",description:"الطلبات والفواتير والمدفوعات والنقدية والمصروفات",match:o=>/orders|invoices|payments|refunds|cash-|expenses|other-income/.test(o.path)&&!o.path.includes("restaurant")&&!o.path.includes("/self/")},
 {slug:"operations",label:"الحضور والحجوزات",description:"الدخول، المرافق، الموارد، الحجوزات والخزائن",match:o=>/attendance-attempts|facilities|bookable-resources|reservations|lockers|locker-assignments/.test(o.path)&&!o.path.includes("/self/")},
 {slug:"restaurant",label:"المطعم",description:"الوجبات والأسعار وقائمة اليوم وطابور المطبخ",match:o=>/restaurant|daily-menus/.test(o.path)&&!o.path.includes("/self/")},
 {slug:"engagement",label:"CRM والتواصل",description:"العملاء المحتملون والمتابعات والإشعارات والحملات والطلبات",match:o=>/\/crm\/|notification|whatsapp|online-requests|feedback-cases/.test(o.path)&&!o.path.includes("/self/")&&!o.path.includes("/public/")},
 {slug:"reporting",label:"التقارير والتدقيق",description:"لوحات المؤشرات والتقارير وسجل التدقيق",match:o=>/reports|reporting|dashboard\/summary|audit-records/.test(o.path)},
 {slug:"self",label:"الخدمة الذاتية",description:"العضو وولي الأمر والموظف والمدرب",match:o=>o.path.includes("/self/")||o.path==="/api/v1/self"},
 {slug:"public",label:"الواجهات العامة",description:"طلبات الانضمام العامة دون مصادقة موظف",match:o=>o.path.includes("/public/")},
]

export const endpoints=rawEndpoints as EndpointOperation[]
export function moduleEndpoints(slug:string){const selectedModule=endpointModules.find(item=>item.slug===slug);return selectedModule?endpoints.filter(selectedModule.match):[]}
export function endpointModule(operation:EndpointOperation){return endpointModules.find(item=>item.match(operation))??endpointModules[0]}

export const bodyPresets:Record<string,Record<string,unknown>>={
 requestPhoneOtp:{phone:"+9665XXXXXXXX"},verifyPhoneOtp:{phone:"+9665XXXXXXXX",code:"000000"},verifyMfaChallenge:{factorId:"",challengeId:"",code:"000000"},
 updateOwnAccountProfile:{displayName:"",preferredLocale:"ar",preferredTimezone:"Asia/Riyadh",smsNotificationsEnabled:true,whatsappNotificationsEnabled:true,expectedVersion:1},
 registerMember:{branchId:"",fullNameAr:"",gender:"MALE",birthDate:"2000-01-01",nationality:"SA",registeredOn:"2026-08-12",contacts:[]},
 createCommercialQuote:{branchId:"",targetType:"PACKAGE",targetId:"",quantity:1,memberSegment:"STANDARD"},
 checkoutOrder:{sellingBranchId:"",buyerType:"MEMBER",buyerMemberId:"",lines:[]},recordPayment:{collectionBranchId:"",method:"CARD",amountMinor:"0",allocations:[]},
 recordManualAttendance:{branchId:"",credentialValue:"",occurredAt:new Date().toISOString()},createManualReservation:{branchId:"",memberId:"",resourceId:"",type:"SESSION",seats:1},
 createCrmLead:{branchId:"",fullName:"",origin:"WALK_IN",sourceId:"",phoneE164:"+9665XXXXXXXX"},createPublicOnlineRequest:{type:"MEMBERSHIP_INTEREST",fullName:"",phoneE164:"+9665XXXXXXXX"},
}

export function presetFor(operation:EndpointOperation){
 if(bodyPresets[operation.operationId])return bodyPresets[operation.operationId]
 if(operation.method==="get")return undefined
 if(/cancellations|revocations|voids/.test(operation.path))return {reason:"",expectedVersion:1}
 if(/transitions/.test(operation.path))return {status:"COMPLETED",expectedVersion:1,reason:""}
 if(operation.method==="patch"||operation.method==="put")return {expectedVersion:1}
 return {}
}

