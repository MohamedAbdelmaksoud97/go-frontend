export type Grant={organizationId:string;permission:string;scopeType:"ORGANIZATION"|"SELECTED_BRANCHES";branchIds:string[]}
export function can(grants:Grant[],permission:string,organizationId:string,branchId?:string){return grants.some(grant=>grant.organizationId===organizationId&&grant.permission===permission&&(grant.scopeType==="ORGANIZATION"||Boolean(branchId&&grant.branchIds.includes(branchId))))}

export const routePermissions:Record<string,string[]>={
 "/":["reporting.read"],"/members":["members.read"],"/subscriptions":["subscriptions.read"],"/attendance":["attendance.read","attendance.check-in"],"/bookings":["bookings.read"],"/finance":["finance.invoices.read","finance.payments.read"],"/crm":["crm.leads.read"],"/restaurant":["restaurant.orders.read"],"/staff":["workforce.read","coaching.read"],"/reports":["reporting.read"],"/settings":["organization.read","iam.roles.read"],
}
