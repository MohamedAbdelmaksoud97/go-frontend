import { toPublicApiProblem, type ApiProblem } from "@/lib/api-problem"

export type ApiSuccess<T>={data:T;meta?:{nextCursor?:string}&Record<string,unknown>}
export type { ApiProblem } from "@/lib/api-problem"

type SessionRefreshResult={ok:boolean;invalid:boolean;status:number}
let sessionRefreshRequest:Promise<SessionRefreshResult>|undefined

function refreshBrowserSession(){
 if(sessionRefreshRequest)return sessionRefreshRequest
 const perform=async():Promise<SessionRefreshResult>=>{
  try{const response=await fetch("/api/session/refresh",{method:"POST",cache:"no-store",credentials:"same-origin"});return {ok:response.ok,invalid:response.status===401,status:response.status}}
  catch{return {ok:false,invalid:false,status:503}}
 }
 // Web Locks serializes refresh-token rotation across same-origin tabs. The
 // module-level promise above also deduplicates every parallel request in a tab.
 const request:Promise<SessionRefreshResult>=typeof navigator!=="undefined"&&navigator.locks
  ? navigator.locks.request("go-fitness-session-refresh",{mode:"exclusive"},perform).then(result=>result)
  : perform()
 sessionRefreshRequest=request
 void request.finally(()=>{if(sessionRefreshRequest===request)sessionRefreshRequest=undefined})
 return request
}

export class ApiError extends Error { constructor(public problem:ApiProblem){super(problem.detail||problem.title);this.name="ApiError"} }
export async function setSession(tokens:{accessToken:string;refreshToken?:string;expiresIn?:number}){const response=await fetch("/api/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(tokens),credentials:"same-origin",cache:"no-store"});if(!response.ok)throw new ApiError({type:"about:blank",title:"تعذر حفظ الجلسة",status:response.status,detail:"تم التحقق من بيانات الدخول لكن تعذر حفظ الجلسة الآمنة.",code:"session_persistence_failed"})}
export async function clearSession(){await fetch("/api/session",{method:"DELETE",credentials:"same-origin",cache:"no-store"})}
export function hasRuntimeApi(){return Boolean(process.env.NEXT_PUBLIC_API_BASE_URL)}
export function createIdempotencyKey(){return crypto.randomUUID()}

export async function apiRequest<T>(path:string,init:RequestInit&{idempotencyKey?:string;fullPath?:boolean;skipRefresh?:boolean}={}):Promise<ApiSuccess<T>>{
 const correlationId=crypto.randomUUID()
 const headers=new Headers(init.headers)
 const method=(init.method??"GET").toUpperCase()
 headers.set("Accept","application/json")
 headers.set("X-Correlation-Id",correlationId)
 if(init.body&&!headers.has("Content-Type"))headers.set("Content-Type","application/json")
 if(init.idempotencyKey)headers.set("Idempotency-Key",init.idempotencyKey)
 else if(method==="POST"&&!headers.has("Idempotency-Key"))headers.set("Idempotency-Key",createIdempotencyKey())
 const normalized=init.fullPath?path:`/api/v1${path}`
 let response=await fetch(`/api/backend${normalized}`,{...init,headers,cache:"no-store"})
 if(response.status===401&&!init.skipRefresh){const refreshed=await refreshBrowserSession();if(refreshed.ok)response=await fetch(`/api/backend${normalized}`,{...init,headers,cache:"no-store"});else if(!refreshed.invalid)throw new ApiError({type:"about:blank",title:"تعذر تجديد الجلسة مؤقتًا",status:refreshed.status,detail:"تعذر الاتصال بخدمة الجلسات الآن. جلستك ما زالت محفوظة؛ حاول مجددًا بعد قليل.",code:"session_refresh_temporarily_unavailable"})}
 if(response.status===204)return {data:undefined as T}
 const payload=await response.json().catch(()=>null)
 if(!response.ok){throw new ApiError(toPublicApiProblem(payload,response.status,response.headers.get("x-correlation-id")??correlationId))}
 return payload as ApiSuccess<T>
}

export async function executeOperation<T=unknown>(path:string,method:string,query:Record<string,string>,body:unknown,idempotencyKey?:string){
 const url=new URL(path,"http://internal")
 Object.entries(query).forEach(([key,value])=>{if(value!=="")url.searchParams.set(key,value)})
 return apiRequest<T>(`${url.pathname}${url.search}`,{method:method.toUpperCase(),body:method==="get"?undefined:JSON.stringify(body??{}),idempotencyKey,fullPath:true})
}

export async function requestOtp(phone:string,deviceId?:string){return apiRequest<{requestId?:string;retryAfter?:number}>("/auth/otp/requests",{method:"POST",headers:deviceId?{"X-Device-Id":deviceId}:{},body:JSON.stringify({phone})})}
export async function verifyOtp(phone:string,code:string){const response=await apiRequest<{accessToken:string;refreshToken:string;expiresIn:number;tokenType:string;requiresMfa:boolean}>("/auth/otp/verifications",{method:"POST",body:JSON.stringify({phone,code})});await setSession(response.data);return response}
export async function signInWithPassword(audience:"staff"|"member"|"member-test",credentials:{identifier:string;password:string}|{email:string;password:string}|{phone:string;password:string}){const correlationId=crypto.randomUUID();const response=await fetch(`/api/login/${audience}`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json","X-Correlation-Id":correlationId},body:JSON.stringify(credentials),cache:"no-store"});const payload=await response.json().catch(()=>null);if(!response.ok)throw new ApiError(toPublicApiProblem(payload,response.status,response.headers.get("x-correlation-id")??correlationId));return payload as ApiSuccess<{authenticated:true;requiresMfa:boolean}>}
export async function currentUser(){return apiRequest<{authUserId:string;userAccountId:string;assuranceLevel:"aal1"|"aal2";grants:Array<{organizationId:string;permission:string;scopeType:"ORGANIZATION"|"SELECTED_BRANCHES";branchIds:string[]}>}>("/me")}
