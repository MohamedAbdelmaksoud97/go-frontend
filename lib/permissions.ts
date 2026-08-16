export type Grant={organizationId:string;permission:string;scopeType:"ORGANIZATION"|"SELECTED_BRANCHES";branchIds:string[]}
export function can(grants:Grant[],permission:string,organizationId:string,branchId?:string){return grants.some(grant=>grant.organizationId===organizationId&&grant.permission===permission&&(grant.scopeType==="ORGANIZATION"||Boolean(branchId&&grant.branchIds.includes(branchId))))}

export const operationPermissions:Record<string,string>={
 listMembers:"members.read",registerMember:"members.manage",listSubscriptions:"subscriptions.read",createSubscription:"subscriptions.manage",listAttendanceAttempts:"attendance.read",recordManualAttendance:"attendance.check-in",listReservations:"bookings.read",createManualReservation:"bookings.create",listInvoices:"finance.invoices.read",recordPayment:"finance.payments.record",listCrmLeads:"crm.leads.read",createCrmLead:"crm.leads.manage",listRestaurantOrders:"restaurant.orders.read",checkoutOrder:"sales.checkout",listEmployees:"workforce.read",createEmployee:"workforce.manage",getBranchDailyReport:"reporting.read",requestReportingRebuild:"reporting.rebuild",
}

export const routePermissions:Record<string,string[]>={
 "/":["reporting.read"],"/members":["members.read"],"/subscriptions":["subscriptions.read"],"/attendance":["attendance.read","attendance.check-in"],"/bookings":["bookings.read"],"/cashier":["sales.checkout","finance.payments.record","finance.cash-shifts.manage"],"/finance":["finance.invoices.read","finance.payments.read"],"/crm":["crm.leads.read"],"/restaurant":["restaurant.orders.read"],"/staff":["workforce.read","coaching.read"],"/reports":["reporting.read"],"/settings":["organization.read","iam.roles.read"],
}
