import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ResourcePage } from "@/components/resource-page"
import { sections } from "@/lib/sections"

export function generateStaticParams() { return Object.keys(sections).map(section=>({section})) }
export async function generateMetadata({params}:{params:Promise<{section:string}>}):Promise<Metadata>{ const {section}=await params; return {title:sections[section]?.title??"غير موجود"} }
export default async function SectionPage({params}:{params:Promise<{section:string}>}) { const {section}=await params; const config=sections[section]; if(!config) notFound(); return <ResourcePage config={config}/> }
