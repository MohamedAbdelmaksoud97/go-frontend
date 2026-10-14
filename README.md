# GO Fitness Frontend

واجهة GO Fitness العربية RTL مبنية بـ Next.js، وتتصل بخادم Node فقط عبر BFF داخلي.

## التشغيل المحلي

```bash
npm install
copy .env.example .env.local
npm run dev
```

ثم افتح `http://127.0.0.1:3000`.

## الربط مع Backend

ضع القيم التالية في `.env.local` داخل مشروع الواجهة:

```text
API_BASE_URL=http://127.0.0.1:3001
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001
NEXT_PUBLIC_ORGANIZATION_ID=019c4f00-0000-7000-8000-000000000001
```

لا تضع مفاتيح Supabase أو `DATABASE_URL` في مشروع الواجهة. دخول الموظف يتم بالبريد وكلمة المرور، ودخول العضو أو ولي الأمر يتم بالهاتف وكلمة المرور. كل عمليات الدخول وتجديد الجلسة تمر عبر Next.js BFF ثم Node Backend؛ تحفظ الجلسة في Cookies من نوع HttpOnly ولا تصل الرموز إلى JavaScript في المتصفح.

## التحقق

```bash
npm test
npm run build
```

يتحقق `npm test` من تغطية جميع عمليات OpenAPI المسجلة، ويشغل ESLint.

## الخصوصية والدعم

- `/privacy`: سياسة خصوصية GO Fitness، متاحة بدون تسجيل دخول.
- `/support`: معلومات الدعم والبريد `Go.fitness.zulfi@gmail.com`، متاحة بدون تسجيل دخول.
- نص الخصوصية في `content/go-fitness-legal.ar.json` مطابق للنسخة المضمّنة في
  `gomobileapp/assets/go-fitness-legal.ar.json`. حدّث النسختين معًا عند تغيير السياسة.
- بعد `npm run build`، يشغّل `node scripts/test-public-legal-http.mjs` اختبار HTTP
  لظهور الصفحتين بدون جلسة، واستمرار حماية صفحة الحساب.
