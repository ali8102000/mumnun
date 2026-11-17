# البحث الدلالي العربي ومساعد ممنون

## ما الذي يفهرسه النظام؟
يفهرس فقط كتالوج `public.services` (أسماء الخدمات وأسماؤها الإنجليزية ورموزها ومرادفات عراقية منتقاة). لا تُضمّن بيانات الزبائن أو أرقام الهواتف أو المواقع أو الطلبات أو المحادثات.

## بنية قاعدة البيانات
- `extensions.vector(384)` عبر pgvector.
- `public.service_embeddings` جدول خاص، RLS مفعّل ولا يملك `anon` أو `authenticated` صلاحية قراءة مباشرة.
- `public.match_service_embeddings` RPC محصور بدور `service_role`.
- تُطبّق Migration بعد مراجعة CI فقط، ولا تنفذ تلقائياً من واجهة التطبيق.

## إعداد مزوّد التضمين
نموذج Supabase المدمج `gte-small` إنكليزي فقط؛ لا تستخدمه للبحث العربي.
يلزم مزوّد تضمين متعدد اللغات متوافق مع OpenAI Embeddings API، ويُفضّل `intfloat/multilingual-e5-small` مع 384 بُعداً.

أضف أسرار Edge Function التالية في Supabase:
- `EMBEDDINGS_API_URL`: عنوان endpoint الكامل لإنشاء embeddings.
- `EMBEDDINGS_API_KEY`: مفتاح المزوّد.
- `EMBEDDINGS_MODEL`: اسم النموذج الذي يقبله endpoint، مثلاً `intfloat/multilingual-e5-small`.

يجب أن يعيد endpoint استجابة متوافقة مع OpenAI:
`{ "data": [{ "embedding": [384 numbers] }] }`
ويجب أن يحافظ على بادئات E5 التي يضيفها الكود: `query:` و`passage:`.

## إعداد مساعد المحادثة
لصياغة إجابات بلغة طبيعية من نتائج البحث فقط، أضف:
- `AI_CHAT_API_URL`: عنوان Chat Completions متوافق مع OpenAI.
- `AI_CHAT_API_KEY`: مفتاح المزوّد.
- `AI_CHAT_MODEL`: اسم نموذج المحادثة.

إذا لم تتوفر أسرار المحادثة، يعرض endpoint ردّاً احتياطياً مع مصادر الخدمات المسترجعة ولا يخترع أسعاراً أو توفراً.

## Edge Functions
- `semantic-search`: يتطلب JWT صالحاً، ويُنشئ embeddings الناقصة لخدمات الكتالوج عند أول بحث، ثم ينفذ بحث pgvector.
- `mamnoon-assistant`: يتطلب JWT صالحاً، يستدعي البحث الدلالي، ثم يمرر أسماء الخدمات المسترجعة فقط إلى نموذج المحادثة.

## خطوات الإطلاق
1. نجاح CI للويب وExpo وفحص Deno.
2. ضبط أسرار المزوّدين من لوحة Supabase، دون وضعها في GitHub أو التطبيق.
3. مراجعة Migration ثم تطبيقها على مشروع Supabase الصحيح `enteiolvirenbhkyskgb`.
4. نشر الدالتين مع JWT verification.
5. اختبار عبارات عراقية مثل «الكهرباء تفصل بالبيت» و«المي يتسرب من الحنفية»، والتحقق من ترتيب الخدمات.
6. مراقبة زمن الاستجابة وتكلفة مزود التضمين، ثم بناء Android وإطلاق الويب.
