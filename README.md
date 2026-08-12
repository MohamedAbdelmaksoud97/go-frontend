# GO Fitness Frontend

واجهة إدارة عربية RTL مبنية بـ Next.js 16 وReact 19 وTailwind CSS 4 ومكوّنات shadcn، ومهيأة للعمل مع عقد GO Fitness API v1.

## التشغيل

```bash
npm install
npm run dev
```

ثم افتح `http://localhost:3000`. تعمل الواجهة تلقائيًا بوضع العرض عند غياب عنوان الـAPI، ويمكن الدخول إليه مباشرة من صفحة `/login`.

## ربط الـBackend

انسخ `.env.example` إلى `.env.local` ثم حدّث القيم:

```text
API_BASE_URL=http://127.0.0.1:3001
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_ORGANIZATION_ID=YOUR_PUBLIC_JOIN_ORGANIZATION_ID
```

عند وجود المتغير تستخدم رحلة تسجيل الدخول مسارات OTP الفعلية. تُحفظ التوكنات في Cookies من نوع HttpOnly عبر BFF داخلي، ويضيف الخادم `Authorization` بينما يضيف العميل `X-Correlation-Id` و`Idempotency-Key` حيث يلزم.

## التغطية

- جميع عمليات OpenAPI الـ256 مفهرسة ويُتحقق من تغطيتها آليًا عبر `npm run check:coverage`.
- الواجهة التشغيلية تعرض رحلات عمل ونماذج عربية فقط؛ لا تعرض مسارات API أو أجسام JSON للمستخدم.
- صفحات المجالات اليومية تقرأ القوائم الحقيقية مباشرة عند ضبط بيئة الـAPI.
- مسار إرسال الرسائل الداخلي لا يُعرض في الواجهة لأسباب أمنية.

## الفحص

```bash
npm run lint
npm run build
```
