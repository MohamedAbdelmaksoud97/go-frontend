export type Grant={organizationId:string;permission:string;scopeType:"ORGANIZATION"|"SELECTED_BRANCHES";branchIds:string[]}
export const permissionImplications:Readonly<Record<string,readonly string[]>>={
 "branch.manage":["branch.read","organization.read"],
 "iam.roles.manage":["iam.roles.read"],"iam.assignments.manage":["iam.roles.read","iam.accounts.read"],
 "members.manage":["members.read"],"members.block":["members.read","subscriptions.read"],"members.sensitive.read":["members.contacts.read"],"members.sensitive.manage":["members.sensitive.read"],"members.accounts.manage":["members.read"],
 "workforce.manage":["workforce.read"],"workforce.assignments.manage":["workforce.read"],"workforce.accounts.manage":["workforce.read"],
 "files.manage":["files.read"],"catalog.manage":["catalog.read"],"catalog.availability.manage":["catalog.read"],
 "commercial.manage":["commercial.read"],"pricing.manage":["commercial.read"],"promotions.manage":["commercial.read"],"policies.manage":["commercial.read"],
 "subscriptions.freeze":["subscriptions.read"],"subscriptions.cancel":["subscriptions.read"],"subscriptions.renew":["subscriptions.read"],"subscriptions.adjustments.manage":["subscriptions.read"],
 "sales.checkout":["sales.read","members.read","commercial.read","restaurant.catalog.read","restaurant.menu.read","retail.catalog.read","retail.inventory.read"],"finance.payments.record":["finance.payments.read","finance.invoices.read"],"finance.refunds.issue":["finance.payments.read"],"finance.refunds.approve":["finance.payments.read"],
 "finance.expenses.manage":["finance.expenses.read"],"finance.expenses.approve":["finance.expenses.read"],"finance.expenses.pay":["finance.expenses.read"],
 "finance.cash-points.manage":["finance.cash-points.read"],"finance.cash-shifts.manage":["finance.cash-points.read"],
 "attendance.check-in":["attendance.read","members.read","subscriptions.read"],"bookings.create":["bookings.read","members.read","catalog.read"],"bookings.manage":["bookings.read","members.read","catalog.read"],"bookings.facilities.manage":["bookings.read"],
 "restaurant.catalog.manage":["restaurant.catalog.read"],"restaurant.pricing.manage":["restaurant.catalog.read"],"restaurant.menu.read":["restaurant.catalog.read"],"restaurant.menu.manage":["restaurant.menu.read","restaurant.catalog.read"],"restaurant.orders.prepare":["restaurant.orders.read"],"restaurant.orders.manage":["restaurant.orders.read"],"restaurant.meal-plans.redeem":["restaurant.menu.read","members.read","subscriptions.read"],
 "coaching.manage":["coaching.read","workforce.read"],"coaching.assignments.manage":["coaching.read","members.read"],"coaching.schedule.manage":["coaching.read"],"measurements.manage":["measurements.read","members.read"],"measurement-types.manage":["measurements.read"],
 "notifications.send":["notifications.read","members.read","crm.leads.read"],"notification-templates.manage":["notification-templates.read"],"reporting.rebuild":["reporting.read"],"access-credentials.manage":["access-credentials.read","members.read","workforce.read"],
 "online-requests.manage":["online-requests.read"],"workforce.shifts.manage":["workforce.shifts.read","workforce.read"],"workforce.attendance.record":["workforce.shifts.read","workforce.read"],"lockers.manage":["lockers.read","members.read"],"feedback.reply":["feedback.read"],
 "finance.other-income.manage":["finance.other-income.read"],"notifications.whatsapp.manage":["notifications.whatsapp.read"],"coaching.commissions.manage":["coaching.commissions.read","coaching.read","workforce.read"],"coaching.training-plans.manage":["coaching.training-plans.read","coaching.read","members.read"],
 "crm.leads.manage":["crm.leads.read"],"crm.follow-ups.manage":["crm.follow-ups.read","crm.leads.read"],"retail.catalog.manage":["retail.catalog.read"],"retail.pricing.manage":["retail.catalog.read"],"retail.inventory.manage":["retail.inventory.read","retail.catalog.read"],
}
export function permissionSatisfies(granted:string,required:string){if(granted===required)return true;const visited=new Set<string>();const pending=[...(permissionImplications[granted]??[])];while(pending.length){const candidate=pending.pop();if(!candidate||visited.has(candidate))continue;if(candidate===required)return true;visited.add(candidate);pending.push(...(permissionImplications[candidate]??[]))}return false}
export function can(grants:Grant[],permission:string,organizationId:string,branchId?:string){return grants.some(grant=>grant.organizationId===organizationId&&permissionSatisfies(grant.permission,permission)&&(grant.scopeType==="ORGANIZATION"||Boolean(branchId&&grant.branchIds.includes(branchId))))}

export const operationPermissions:Record<string,string>={
 listMembers:"members.read",registerMember:"members.manage",listSubscriptions:"subscriptions.read",createSubscription:"sales.checkout",listAttendanceAttempts:"attendance.read",recordManualAttendance:"attendance.check-in",listReservations:"bookings.read",createManualReservation:"bookings.create",listInvoices:"finance.invoices.read",recordPayment:"finance.payments.record",listCrmLeads:"crm.leads.read",createCrmLead:"crm.leads.manage",listRestaurantOrders:"restaurant.orders.read",checkoutOrder:"sales.checkout",listEmployees:"workforce.read",createEmployee:"workforce.manage",getBranchDailyReport:"reporting.read",requestReportingRebuild:"reporting.rebuild",
 listEmployeeShiftRoster:"workforce.shifts.read",scheduleEmployeeShift:"workforce.shifts.manage",listEmployeeAttendance:"workforce.shifts.read",listOnlineRequests:"online-requests.read",listFeedbackCases:"feedback.read",listLockers:"lockers.read",listOtherIncome:"finance.other-income.read",listTrainerCommissions:"coaching.commissions.read",
 recordOtherIncome:"finance.other-income.manage",
}

export const systemSettingsPermissions=[
 "organization.read","branch.read","catalog.read","commercial.read","iam.roles.read",
 "finance.cash-points.read","lockers.read","measurements.read","workforce.read","bookings.read",
 "notification-templates.read","retail.catalog.read","retail.inventory.read","finance.expenses.read","restaurant.catalog.read",
 "branch.manage","iam.accounts.read","iam.roles.manage","iam.assignments.manage",
 "workforce.manage","catalog.manage","commercial.manage","pricing.manage","promotions.manage","policies.manage",
 "bookings.facilities.manage","finance.cash-points.manage","lockers.manage","measurement-types.manage","restaurant.catalog.manage",
 "retail.catalog.manage","retail.pricing.manage","retail.inventory.manage","finance.expenses.manage","notification-templates.manage",
] as const

export const routePermissions:Record<string,string[]>={
 "/":["reporting.read"],
 "/members":["members.read"],
 "/subscriptions":["subscriptions.read","sales.checkout"],
 "/attendance":["attendance.read","attendance.check-in"],
 "/bookings":["bookings.read","bookings.create"],
 "/barcodes":["access-credentials.read","access-credentials.manage"],
 "/files":["files.read","files.manage"],
 "/cashier":["sales.checkout","finance.payments.record","finance.cash-shifts.manage"],
 "/finance":["finance.invoices.read","finance.payments.read","finance.other-income.read","coaching.commissions.read","finance.cash-shifts.audit.read"],
 "/finance/shifts":["finance.cash-shifts.audit.read"],
 "/crm":["crm.leads.read","crm.follow-ups.read","online-requests.read"],
 "/communications":["notifications.read","notifications.send","notifications.whatsapp.read","notifications.whatsapp.manage"],
 "/operations":["workforce.shifts.read","workforce.attendance.record","online-requests.read","lockers.read"],
 "/feedback":["feedback.read","feedback.reply"],
 "/restaurant":["restaurant.orders.read","restaurant.menu.read","restaurant.catalog.read","restaurant.meal-plans.redeem"],
 "/staff":["workforce.read"],
 "/employees":["workforce.read"],
 "/trainer":["coaching.read","coaching.training-plans.read","measurements.read","coaching.assignments.manage"],
 "/reports":["reporting.read"],
 "/audit":["iam.audit.read"],
 "/master-data":[...systemSettingsPermissions],
 "/system-settings":[...systemSettingsPermissions],
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
 if(canAccess(["iam.audit.read"]))return "/audit"
 if(canAccess(routePermissions["/system-settings"]??[]))return "/system-settings/branches"
 return "/self-service"
}
