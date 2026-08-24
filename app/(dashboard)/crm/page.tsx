import { CrmWorkspace } from "@/components/crm-workspace"
export default async function CrmPage({searchParams}:{searchParams:Promise<{search?:string}>}){const query=await searchParams;return <CrmWorkspace initialSearch={query.search??""}/>}
