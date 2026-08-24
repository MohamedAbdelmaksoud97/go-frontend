import { FinanceWorkspace } from "@/components/finance-workspace"
export default async function FinancePage({searchParams}:{searchParams:Promise<{search?:string}>}){const query=await searchParams;return <FinanceWorkspace initialSearch={query.search??""}/>}
