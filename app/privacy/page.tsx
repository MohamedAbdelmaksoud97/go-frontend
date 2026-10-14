import type { Metadata } from "next";
import { PublicLegalLayout } from "@/components/public-legal-layout";
import policy from "@/content/go-fitness-legal.ar.json";

export const metadata: Metadata = {
  title: "سياسة الخصوصية",
  description: "سياسة الخصوصية لتطبيق وموقع GO Fitness وبيانات الحساب والعضوية وخدمات النادي.",
};

export default function PrivacyPage() {
  return (
    <PublicLegalLayout title="سياسة الخصوصية">
      <p className="text-muted-foreground">آخر تحديث: {policy.updatedAt}</p>
      {policy.sections.map(section => (
        <section key={section.title}>
          <h2 className="mb-2 text-xl font-bold">{section.title}</h2>
          <p>{section.body}</p>
        </section>
      ))}
      <section>
        <h2 className="mb-2 text-xl font-bold">بريد الدعم والخصوصية</h2>
        <a dir="ltr" href={`mailto:${policy.supportEmail}`} className="break-all font-semibold underline underline-offset-4">{policy.supportEmail}</a>
      </section>
    </PublicLegalLayout>
  );
}
