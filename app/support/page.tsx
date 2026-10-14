import Link from "next/link";
import type { Metadata } from "next";
import { PublicLegalLayout } from "@/components/public-legal-layout";
import policy from "@/content/go-fitness-legal.ar.json";

export const metadata: Metadata = {
  title: "الدعم والمساعدة",
  description: "تواصل مع فريق GO Fitness للمساعدة في التطبيق والحساب والعضوية وطلبات الخصوصية.",
};

export default function SupportPage() {
  return (
    <PublicLegalLayout title="الدعم والمساعدة">
      <section>
        <h2 className="mb-2 text-xl font-bold">تواصل مع فريق GO Fitness</h2>
        <p>للمساعدة في الحساب والعضوية أو للإبلاغ عن مشكلة في التطبيق، راسل فريق النادي على البريد التالي. يمكنك استخدام البريد دون تسجيل الدخول.</p>
        <a dir="ltr" href={`mailto:${policy.supportEmail}`} className="mt-4 inline-block break-all rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">{policy.supportEmail}</a>
      </section>
      <section>
        <h2 className="mb-2 text-xl font-bold">ما الذي تذكره في طلب الدعم؟</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>وصف المشكلة والخطوات التي سبقتها.</li>
          <li>وقت حدوثها وإصدار التطبيق ونوع الجهاز.</li>
          <li>رقم العضوية أو رقم الطلب أو الفاتورة عند الحاجة.</li>
        </ul>
        <p className="mt-3">لا ترسل كلمة المرور أو رموز التحقق أو بيانات البطاقة البنكية. إذا أرفقت صورة، أخفِ البيانات الشخصية غير اللازمة للمساعدة.</p>
      </section>
      <section>
        <h2 className="mb-2 text-xl font-bold">الشكاوى والاقتراحات</h2>
        <p>يمكن لأعضاء النادي وولي الأمر المرتبط بعضو متابعة محادثة مع فريق النادي من قسم الشكاوى والاقتراحات داخل التطبيق، أو من بوابة العضو على الموقع.</p>
        <Link href="/self-service/feedback" className="mt-3 inline-block font-bold underline underline-offset-4">فتح بوابة العضو للتواصل مع النادي</Link>
      </section>
      <section>
        <h2 className="mb-2 text-xl font-bold">استفسارات الخصوصية</h2>
        <p>للطلبات المتعلقة بالوصول إلى بياناتك أو تصحيحها أو حذفها، راسل بريد الدعم الموضح أعلاه. قد نطلب تحققًا مناسبًا من الهوية لحماية بياناتك.</p>
        <Link href="/privacy" className="mt-3 inline-block font-bold underline underline-offset-4">قراءة سياسة الخصوصية</Link>
      </section>
    </PublicLegalLayout>
  );
}
