import { apiRequest } from "@/lib/api-client"

export type KitchenOrder = Record<string, unknown> & {
  id: string; branchId: string; status: string; version: number; createdAt?: string
  sourceType?: string; salesOrderId?: string; subscriptionId?: string
  memberName?: string; memberNumber?: string; grossMinor?: string; currency?: string
  lines?: { id?: string; quote?: { targetName?: string; targetCode?: string; quantity?: number | string } }[]
}

const kitchenStatuses = ["CONFIRMED", "PREPARING", "READY"] as const

export async function loadKitchenOrders(input: { organizationId: string; branchId?: string; signal?: AbortSignal }): Promise<KitchenOrder[]> {
  const groups = await Promise.all(kitchenStatuses.map(async status => {
    const orders: KitchenOrder[] = []
    const cursors = new Set<string>()
    let cursor: string | undefined
    do {
      const query = new URLSearchParams({ limit: "100", status })
      if (input.branchId) query.set("branchId", input.branchId)
      if (cursor) query.set("cursor", cursor)
      const response = await apiRequest<KitchenOrder[] | { items: KitchenOrder[] }>(`/organizations/${input.organizationId}/restaurant-orders?${query}`, { signal: input.signal })
      const items = Array.isArray(response.data) ? response.data : response.data.items
      orders.push(...items)
      cursor = response.meta?.nextCursor
      if (cursor && cursors.has(cursor)) throw new Error("تعذر إكمال تحميل صفحات طلبات المطبخ. أعد التحديث.")
      if (cursor) cursors.add(cursor)
    } while (cursor)
    return orders
  }))
  // A request can move between status queues while those queues are loading.
  const unique = new Map<string, KitchenOrder>()
  for (const order of groups.flat()) {
    if (!kitchenStatuses.some(status => status === order.status)) continue
    if (input.branchId && order.branchId !== input.branchId) continue
    if (!unique.has(order.id) || unique.get(order.id)!.version < order.version) unique.set(order.id, order)
  }
  return [...unique.values()].sort((left, right) => (left.createdAt ?? left.id).localeCompare(right.createdAt ?? right.id) || left.id.localeCompare(right.id))
}
