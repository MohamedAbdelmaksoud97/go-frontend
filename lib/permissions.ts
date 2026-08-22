export type Grant={organizationId:string;permission:string;scopeType:"ORGANIZATION"|"SELECTED_BRANCHES";branchIds:string[]}
export function can(grants:Grant[],permission:string,organizationId:string,branchId?:string){return grants.some(grant=>grant.organizationId===organizationId&&grant.permission===permission&&(grant.scopeType==="ORGANIZATION"||Boolean(branchId&&grant.branchIds.includes(branchId))))}

export const operationPermissions:Record<string,string>={
 listMembers:"members.read",registerMember:"members.manage",listSubscriptions:"subscriptions.read",createSubscription:"sales.checkout",listAttendanceAttempts:"attendance.read",recordManualAttendance:"attendance.check-in",listReservations:"bookings.read",createManualReservation:"bookings.create",listInvoices:"finance.invoices.read",recordPayment:"finance.payments.record",listCrmLeads:"crm.leads.read",createCrmLead:"crm.leads.manage",listRestaurantOrders:"restaurant.orders.read",checkoutOrder:"sales.checkout",listEmployees:"workforce.read",createEmployee:"workforce.manage",getBranchDailyReport:"reporting.read",requestReportingRebuild:"reporting.rebuild",
 listEmployeeShiftRoster:"workforce.shifts.read",scheduleEmployeeShift:"workforce.shifts.manage",listEmployeeAttendance:"workforce.shifts.read",listOnlineRequests:"online-requests.read",listFeedbackCases:"feedback.read",listLockers:"lockers.read",listOtherIncome:"finance.other-income.read",listTrainerCommissions:"coaching.commissions.read",
 recordOtherIncome:"finance.other-income.manage",
}

export const routePermissions:Record<string,string[]>={
 "/":["reporting.read"],
 "/members":["members.read"],
 "/subscriptions":["subscriptions.read"],
 "/attendance":["attendance.read","attendance.check-in"],
 "/bookings":["bookings.read","bookings.create"],
 "/barcodes":["access-credentials.read","access-credentials.manage"],
 "/files":["files.read","files.manage"],
 "/cashier":["sales.checkout","finance.payments.record","finance.cash-shifts.manage"],
 "/finance":["finance.invoices.read","finance.payments.read","finance.other-income.read","coaching.commissions.read","finance.cash-shifts.audit.read"],
 "/finance/shifts":["finance.cash-shifts.audit.read"],
 "/crm":["crm.leads.read","crm.follow-ups.read","online-requests.read"],
 "/communications":["notifications.read","notifications.send"],
 "/operations":["workforce.shifts.read","workforce.attendance.record","online-requests.read","lockers.read"],
 "/feedback":["feedback.read","feedback.reply"],
 "/restaurant":["restaurant.orders.read","restaurant.menu.read","restaurant.catalog.read"],
 "/staff":["workforce.read"],
 "/trainer":["coaching.read","coaching.training-plans.read","measurements.read","coaching.assignments.manage"],
 "/reports":["reporting.read"],
 "/master-data":["organization.manage","catalog.manage","commercial.manage","iam.roles.manage","workforce.manage","bookings.facilities.manage","restaurant.catalog.manage","retail.catalog.read","retail.inventory.read","finance.expenses.read"],
 "/system-settings":["organization.manage","catalog.manage","commercial.manage","iam.roles.manage","workforce.manage","bookings.facilities.manage","restaurant.catalog.manage","retail.catalog.read","retail.inventory.read","finance.expenses.read"],
 "/settings":["organization.read","iam.roles.read"],
 "/self-service":[],
 "/account":[],
 "/notifications":[],
 "/select-context":[],
}

export function permissionsForRoute(pathname:string){
 const exact=routePermissions[pathname]
 if(exact!==undefined)return exact
 const root=`/${pathname.split("/").filter(Boolean)[0]??""}`
 return routePermissions[root]
}

export function firstAllowedDestination(canAccess:(permissions:string[])=>boolean){
 if(canAccess(["reporting.read"]))return "/"
 if(canAccess(["restaurant.orders.prepare"]))return "/restaurant"
 if(canAccess(["sales.checkout"]))return "/cashier"
 if(canAccess(["members.read"]))return "/members"
 if(canAccess(["workforce.shifts.read"]))return "/operations"
 if(canAccess(["feedback.read","feedback.reply"]))return "/feedback"
 if(canAccess(["crm.leads.read","crm.follow-ups.read"]))return "/crm"
 if(canAccess(["notifications.read","notifications.send"]))return "/communications"
 if(canAccess(["finance.cash-shifts.audit.read"]))return "/finance/shifts"
 if(canAccess(["finance.other-income.read","coaching.commissions.read"]))return "/finance"
 if(canAccess(["coaching.read","measurements.read","coaching.assignments.manage"]))return "/trainer"
 if(canAccess(["workforce.read"]))return "/staff"
 if(canAccess(routePermissions["/system-settings"]??[]))return "/system-settings/branches"
 return "/self-service"
}
