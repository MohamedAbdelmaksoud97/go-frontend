import { physicalGateDirection } from "@/lib/gate-direction"

export type GateAccessEvent={
 id:string;deviceId:string;deviceName?:string;branchId?:string;deviceOccurredAt:string;doorNumber:number;direction:"IN"|"OUT"|"UNKNOWN";eventType:number;credentialPin?:string;
 deviceDecision:"ALLOWED"|"DENIED"|"UNKNOWN";processingStatus:"ATTENDANCE_RECORDED"|"DEVICE_DENIED"|"UNMAPPED_CREDENTIAL"|"IGNORED"|"FAILED";processingCode?:string;
 memberId?:string;memberName?:string;memberNumber?:string;employeeId?:string;employeeName?:string;employeeNumber?:string
}

const reasons:Record<string,string>={
 MEMBER_BLOCKED:"العضو محظور",MEMBER_INACTIVE:"حالة العضو غير نشطة",NOT_ACTIVE:"لا يوجد اشتراك نشط",SUBSCRIPTION_FROZEN:"الاشتراك مجمّد",OUTSIDE_ACCESS_PERIOD:"خارج فترة صلاحية الاشتراك",
 BRANCH_NOT_ALLOWED:"الاشتراك لا يسمح بهذا الفرع",VISITS_EXHAUSTED:"تم استنفاد الزيارات",SERVICE_NOT_INCLUDED:"الخدمة غير مشمولة",SERVICE_VISITS_EXHAUSTED:"تم استنفاد زيارات الخدمة",
 FULFILLMENT_NOT_ACCESS:"الاشتراك لا يمنح دخول المرفق",BRANCH_INACTIVE:"الفرع غير نشط",CONCURRENT_ACCESS_CONFLICT:"تعارض مع محاولة دخول أخرى",
 EMPLOYEE_INACTIVE:"الموظف غير نشط",EMPLOYEE_BRANCH_NOT_ALLOWED:"الموظف غير معيّن في هذا الفرع",EMPLOYEE_ATTENDANCE_SEQUENCE:"ترتيب حضور الموظف يحتاج مراجعة",UNKNOWN:"سبب غير محدد"
}

export function accessSubject(event:GateAccessEvent){return event.memberName??event.employeeName??(event.credentialPin?`PIN ${event.credentialPin}`:"غير معروف")}
export function accessSubjectNumber(event:GateAccessEvent){return event.memberNumber??event.employeeNumber}
export function accessReader(event:GateAccessEvent){const direction=physicalGateDirection(event.doorNumber,event.direction);return direction==="IN"?"قارئ الدخول":direction==="OUT"?"قارئ الخروج":"قارئ غير محدد"}
export function accessDeviceReason(event:GateAccessEvent){return event.eventType===29?"صلاحية اللوحة منتهية":event.eventType===34?"بصمة غير مسجلة":`رفض اللوحة (${event.eventType})`}
export function accessSystemReason(event:GateAccessEvent){const code=event.processingCode??"";if(code==="SYSTEM_ACCEPTED")return"دخول مسجل";if(code==="EMPLOYEE_CLOCK_IN_RECORDED")return"حضور موظف — دخول";if(code==="EMPLOYEE_CLOCK_OUT_RECORDED")return"حضور موظف — خروج";if(code.startsWith("SYSTEM_REJECTED_"))return reasons[code.slice(16)]??"رفضه GO";if(event.processingStatus==="UNMAPPED_CREDENTIAL")return"PIN غير مربوط";if(event.processingStatus==="DEVICE_DENIED")return accessDeviceReason(event);if(event.processingStatus==="FAILED")return"فشل المعالجة";return physicalGateDirection(event.doorNumber,event.direction)==="OUT"?"حدث خروج":"تم تجاهله"}
export function accessSeverity(event:GateAccessEvent):"success"|"danger"|"warning"|"outline"{
 if(event.deviceDecision==="DENIED"||event.processingStatus==="FAILED"||event.processingCode?.startsWith("SYSTEM_REJECTED_"))return"danger"
 if(event.processingCode==="SYSTEM_ACCEPTED"||event.processingCode?.startsWith("EMPLOYEE_CLOCK_"))return"success"
 if(event.processingStatus==="UNMAPPED_CREDENTIAL")return"warning"
 return"outline"
}
export function gateOpenedButSystemRejected(event:GateAccessEvent){return event.deviceDecision==="ALLOWED"&&Boolean(event.processingCode?.startsWith("SYSTEM_REJECTED_"))}
