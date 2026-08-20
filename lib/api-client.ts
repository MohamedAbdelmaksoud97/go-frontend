export type ApiSuccess<T>={data:T;meta?:{nextCursor?:string}&Record<string,unknown>}
export type ApiProblem={type:string;title:string;status:number;detail:string;code:string;correlationId?:string;errors?:Array<{path?:(string|number)[];message:string;code?:string}>}

let accessToken:string|undefined
let refreshToken:string|undefined

export class ApiError extends Error { constructor(public problem:ApiProblem){super(problem.detail||problem.title);this.name="ApiError"} }
export async function setSession(tokens:{accessToken:string;refreshToken?:string;expiresIn?:number}){accessToken=tokens.accessToken;refreshToken=tokens.refreshToken;await fetch("/api/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(tokens)})}
export async function clearSession(){accessToken=undefined;refreshToken=undefined;await fetch("/api/session",{method:"DELETE"})}
export function hasRuntimeApi(){return Boolean(process.env.NEXT_PUBLIC_API_BASE_URL)}
export function createIdempotencyKey(){return crypto.randomUUID()}

export async function apiRequest<T>(path:string,init:RequestInit&{idempotencyKey?:string;fullPath?:boolean;skipRefresh?:boolean}={}):Promise<ApiSuccess<T>>{
 const correlationId=crypto.randomUUID()
 const headers=new Headers(init.headers)
 headers.set("Accept","application/json")
 headers.set("X-Correlation-Id",correlationId)
 if(init.body&&!headers.has("Content-Type"))headers.set("Content-Type","application/json")
 if(accessToken)headers.set("Authorization",`Bearer ${accessToken}`)
 if(init.idempotencyKey)headers.set("Idempotency-Key",init.idempotencyKey)
 const normalized=init.fullPath?path:`/api/v1${path}`
 let response=await fetch(`/api/backend${normalized}`,{...init,headers,cache:"no-store"})
 if(response.status===401&&!init.skipRefresh){const refreshed=await fetch("/api/session/refresh",{method:"POST"});if(refreshed.ok)response=await fetch(`/api/backend${normalized}`,{...init,headers,cache:"no-store"})}
 if(response.status===204)return {data:undefined as T}
 const payload=await response.json().catch(()=>null)
 if(!response.ok){throw new ApiError(payload??{type:"about:blank",title:"تعذر إكمال الطلب",status:response.status,detail:"حدث خطأ غير متوقع. حاول مرة أخرى.",code:"unexpected_error",correlationId})}
 return payload as ApiSuccess<T>
}

export async function executeOperation<T=unknown>(path:string,method:string,query:Record<string,string>,body:unknown,idempotencyKey?:string){
 const url=new URL(path,"http://internal")
 Object.entries(query).forEach(([key,value])=>{if(value!=="")url.searchParams.set(key,value)})
 return apiRequest<T>(`${url.pathname}${url.search}`,{method:method.toUpperCase(),body:method==="get"?undefined:JSON.stringify(body??{}),idempotencyKey,fullPath:true})
}

export async function requestOtp(phone:string,deviceId?:string){return apiRequest<{requestId?:string;retryAfter?:number}>("/auth/otp/requests",{method:"POST",headers:deviceId?{"X-Device-Id":deviceId}:{},body:JSON.stringify({phone})})}
export async function verifyOtp(phone:string,code:string){const response=await apiRequest<{accessToken:string;refreshToken:string;expiresIn:number;tokenType:string;requiresMfa:boolean}>("/auth/otp/verifications",{method:"POST",body:JSON.stringify({phone,code})});await setSession(response.data);return response}
export async function signInWithPassword(audience:"staff"|"member"|"member-test",credentials:{identifier:string;password:string}|{email:string;password:string}|{phone:string;password:string}){const correlationId=crypto.randomUUID();const response=await fetch(`/api/login/${audience}`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json","X-Correlation-Id":correlationId},body:JSON.stringify(credentials),cache:"no-store"});const payload=await response.json().catch(()=>null);if(!response.ok)throw new ApiError(payload??{type:"about:blank",title:"تعذر تسجيل الدخول",status:response.status,detail:"تحقق من بيانات الدخول وحاول مرة أخرى.",code:"login_failed",correlationId});return payload as ApiSuccess<{authenticated:true;requiresMfa:boolean}>}
export async function currentUser(){return apiRequest<{authUserId:string;userAccountId:string;assuranceLevel:"aal1"|"aal2";grants:Array<{organizationId:string;permission:string;scopeType:"ORGANIZATION"|"SELECTED_BRANCHES";branchIds:string[]}>}>("/me")}
export const sessionTokens={getAccessToken:()=>accessToken,getRefreshToken:()=>refreshToken}
