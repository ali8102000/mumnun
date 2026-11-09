# خطوات تهيئة ممنون قبل بناء Android

هذه الخطوات تخص تطبيق Expo الموجود داخل `expo-app/`، وليس المجلد الجزئي `mobile/`.

## 1) تدوير مفتاح خرائط Google المكشوف سابقاً
1. افتح Google Cloud Console.
2. افتح APIs & Services ثم Credentials.
3. احذف/عطّل المفتاح القديم الذي سبق نشره داخل المستودع.
4. أنشئ مفتاحاً جديداً.
5. قيّده باسم حزمة Android: `com.mamnoon.app` وبصمة SHA-1 لشهادة توقيع EAS.
6. فعّل فقط واجهات الخرائط المطلوبة فعلياً.
7. لا تحفظ المفتاح في ملفات Git.

## 2) متغيرات Expo/EAS
أضف المتغيرات التالية في EAS Environment الخاص بالتطبيق:
- `EXPO_PUBLIC_SUPABASE_URL`: عنوان مشروع Supabase المعتمد.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: مفتاح Supabase publishable/anon الخاص بالعميل فقط.
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`: مفتاح Google Maps الجديد والمقيّد.
- `EAS_PROJECT_ID`: معرّف مشروع Expo/EAS الذي تنشئه أو تربطه بحسابك.

لا تضف `SUPABASE_SERVICE_ROLE_KEY` إلى أي متغير يبدأ بـ `EXPO_PUBLIC_` ولا إلى تطبيق الهاتف.

أضف `GOOGLE_MAPS_API_KEY` كـ Secret داخل Supabase Edge Functions حتى تتمكن `create-taxi-request` من حساب المسافة والأجرة على الخادم. قيّد المفتاح بخدمة Routes API فقط، ولا تضعه في تطبيق Expo أو ملفات Git.

## 3) أسرار الخرائط على الخادم
- في استضافة الويب، أضف `GOOGLE_MAPS_API_KEY` و`LOVABLE_API_KEY` كمتغيرات خادم سرية؛ تستخدمها خدمة حساب المسار الموثوق.
- في Supabase Edge Functions، أضف مفتاح Google مخصصاً ومقيّداً بـ Routes API فقط:
  ```bash
supabase secrets set GOOGLE_MAPS_API_KEY=YOUR_SERVER_RESTRICTED_KEY
supabase functions deploy create-taxi-request
```
- لا تستخدم مفتاح Android/Browser العام بدلاً من مفتاح الخادم.

## 4) إعداد CORS لخدمة المصادقة
في إعدادات Edge Function المسماة auth-proxy، عيّن المتغير ALLOWED_ORIGIN إلى أصل الويب الرسمي الكامل فقط، مثل https://your-domain.example بعد استبداله بالنطاق الحقيقي. لم يعد الكود يسمح بـ CORS wildcard افتراضياً. إذا بقي المتغير فارغاً، فلن تتمكن متصفحات الويب من قراءة ردود الخدمة؛ تطبيقات الهاتف الأصلية لا تعتمد على CORS.

## 5) تطبيق migrations
المجلد `supabase/migrations/` يحتوي migrations الجديدة:
- `20261109000100_lock_down_system_write_policies.sql`
- `20261109000101_restrict_self_service_role_changes.sql`
- `20261109000102_progressive_taxi_dispatch.sql`
- `20261109000103_secure_active_request_locations.sql`
- `20261109000104_secure_chat_and_ratings.sql`
- `20261109000105_grant_provider_role_safely.sql`
- `20261109000106_require_provider_verification.sql`
- `20261109000107_provider_presence_for_dispatch.sql`
- `20261109000108_nearby_service_dispatch_and_acceptance.sql`
- `20261109000109_lock_down_request_mutations.sql`
- `20261109000110_safe_taxi_dispatch_retries.sql`
- `20261109000111_protect_provider_profile_integrity.sql`
- `20261109000112_index_customer_request_history.sql`
- `20261109000113_atomic_taxi_request_rate_limit.sql`

راجعها أولاً على بيئة تطوير منفصلة، ثم اربط Supabase CLI بالمشروع الصحيح وتحقق أن Project Ref هو `zvfdymcalzqhvwnipuup` قبل تشغيل `supabase db push`.
لا تطبقها على الإنتاج قبل اختبار تسجيل الدخول والأدوار والطلبات والمحافظات المالية على بيئة staging.

## 6) توثيق السائقين والفنيين
بعد تطبيق migration 00106، ينشأ كل سائق أو فني بحالة بانتظار التوثيق وغير متاح. على المشرف مراجعة مستندات الهوية وبيانات المركبة/الاختصاص خارج التطبيق وفق إجراءات الشركة، ثم استخدام لوحة الإدارة > السائقون والفنيون > تفعيل/تعليق/رفض. التفعيل يثبت حالة التوثيق لكنه يبقي الحساب غير متاح إلى أن يفعّل المزود حالة التوفر بنفسه. لا تسمح باستقبال الطلبات قبل التحقق من المستندات فعلياً.

## 7) البناء
من مجلد `expo-app/`:
```bash
bun install --frozen-lockfile
bunx expo config --type public
bunx tsc --noEmit
eas build --platform android --profile production

ملف `expo-app/eas.json` مضبوط لإنتاج Android App Bundle في ملف production، وAPK للاختبار في preview. يجب ربط المشروع وتوفير متغيرات البيئة وبيانات التوقيع قبل البناء.
```

لا تعتبر نجاح بناء AAB دليلاً على نجاح GPS أو الخرائط أو الإشعارات أو دورة الرحلة. اختبر ذلك على أجهزة Android فعلية وحسابات راكب وسائق وفني منفصلة.

## 8) ما يزال مطلوباً قبل الإطلاق
- اختبار اختيار نقطة الانطلاق والوجهة وGPS على أجهزة فعلية داخل العراق، مع اختبار رفض الصلاحيات وضعف الشبكة وفقدان GPS.
- حساب المسافة ووقت الطريق والأجرة من مصدر موثوق وعلى الخادم.
- استكمال التتبع في الخلفية عند الحاجة، وتنفيذ خدمة Push فعلية وتسجيل رموز الأجهزة وإرسال التنبيهات؛ وجود expo-notifications في الإعدادات وحده لا يثبت ذلك.
- اختبار سير التحقق الإداري فعلياً مع حفظ مستندات الإثبات وسجل المراجعة؛ حالياً قاعدة البيانات تمنع غير الموثق من التوفر لكن تخزين المستندات لم يكتمل.
- اختبار RLS ودورة الطلب المتزامنة والماليات والاسترداد.
- نجاح CI وEAS build واختبارات الأجهزة الحقيقية.
