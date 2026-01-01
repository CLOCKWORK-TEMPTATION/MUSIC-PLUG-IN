


1) الهدف (MVP)
- تطبيق ويب يتيح لمستخدم منصة THE COPY:
  - استعراض توصيات موسيقية شخصية (قائمة Tracks).
  - زر تشغيل/إيقاف (تشغيل معاينة إن وجدت، وإلا رابط خارجي).
  - أزرار: أعجبني / لم يعجبني / تخطي / إضافة إلى قائمة تشغيل.
  - اختيار سياق سريع: (عمل/رياضة/استرخاء/حفلة) + اختيار مزاج يدوي (هادئ/سعيد/حزين/حماسي).
  - تحديث توصيات لحظي عند التخطي المتكرر (بدون تحديث صفحة).
- لا تستضف ملفات موسيقى. استخدم روابط/معاينات فقط.

2) هوية المستخدم والدمج مع THE COPY (قرار ملزم)
- لا توجد صفحات /login أو /signup.
- الـAPI تعتمد على هوية قادمة من منصة THE COPY بإحدى طريقتين (نفّذ كلاهما):
  A) Authorization: Bearer <THE_COPY_JWT>
     - تحقق توقيع JWT عبر JWKS URL (مفاتيح عامة) + تحقق issuer/audience/exp.
  B) Header موثوق خلف بوابة المنصة (gateway): X-TheCopy-UserId
     - يُقبل فقط إذا كان الطلب قادمًا من شبكة داخلية/بوابة موثوقة (مثلاً خلف reverse proxy داخلي).
- في بيئة التطوير المحلية:
  - اسمح بـ DEV_USER_ID (env) لتجاوز التحقق لتسهيل التشغيل.
- في كل حالة:
  - استخرج external_user_id (string/uuid) واعتبره مفتاح المستخدم الوحيد في هذا الموديول.

3) القيود الأساسية
- الخصوصية:
  - لا تجمع موقع/كاميرا/ميكروفون افتراضيًا.
  - اجعل أي إذن حساس Opt-in. في الـMVP استخدم إدخال سياق يدوي.
- الأداء:
  - زمن استجابة API للتوصيات <= 300ms في الحالة الدافئة (مع كاش).
- قابلية التشغيل:
  - Docker Compose للتشغيل المحلي.
  - CI بسيط (lint/test/build).

4) المعمارية والتقنيات (قرار ملزم)
- Monorepo:
  /apps/web         => Next.js + TypeScript (واجهة)
  /apps/api         => NestJS (أو Fastify) + TypeScript (REST + WebSocket)
  /apps/ml          => Python FastAPI (اختياري لكن مُفضل للتوصية/التدريب)
  /packages/shared  => Types مشتركة + Zod schemas + utils
- التخزين:
  - PostgreSQL (أساسي) + pgvector (embeddings + ANN)
  - Redis (cache + rate limiting)
- التحديث اللحظي:
  - WebSocket عبر Socket.IO (أو native ws) بين web و api
- التوثيق:
  - OpenAPI (Swagger) للـAPI
  - README شامل

5) نماذج البيانات (Postgres) — نفّذها عبر migrations
ملاحظة: لا يوجد جدول users محلي. كل شيء keyed بـ external_user_id.

- tracks:
  id (uuid, pk), title, artist, album, genre, duration_sec,
  external_url, preview_url (nullable),
  audio_features jsonb (nullable),
  embedding vector(256) (nullable),
  created_at

- interactions:
  id (uuid, pk), external_user_id text not null,
  track_id (fk -> tracks.id),
  event_type enum('PLAY','SKIP','LIKE','DISLIKE','ADD_TO_PLAYLIST'),
  event_value int (nullable),  -- مثلاً مدة الاستماع بالثواني
  context jsonb (nullable),     -- {mood, activity, time_bucket}
  created_at

- user_profiles:
  external_user_id text (pk),
  preferred_genres text[], disliked_genres text[],
  last_active_at,
  profile_embedding vector(256) (nullable)

- playlists:
  id (uuid, pk), external_user_id text not null,
  name, created_at

- playlist_tracks:
  playlist_id (fk), track_id (fk), added_at, pk مركب

فهارس إلزامية:
- interactions(external_user_id, created_at desc)
- playlists(external_user_id, created_at desc)
- tracks(artist), tracks(genre)
- pgvector ANN index (HNSW) على tracks.embedding
- (اختياري) pgvector index على user_profiles.profile_embedding

6) عقود الأحداث (Event Contracts)
عرّف JSON schema لكل حدث يُرسل من الواجهة للـAPI:
- InteractionEvent:
  {
    "trackId": "...",
    "eventType": "PLAY|SKIP|LIKE|DISLIKE|ADD_TO_PLAYLIST",
    "eventValue": 0,
    "context": {
      "mood": "CALM|HAPPY|SAD|ENERGETIC",
      "activity": "WORK|EXERCISE|RELAX|PARTY",
      "timeBucket": "MORNING|AFTERNOON|EVENING|NIGHT"
    },
    "clientTs": "ISO-8601"
  }
ملاحظة: external_user_id لا يأتي من body. يأتي فقط من THE COPY token/header بعد التحقق.

سجّل كل حدث في interactions.
عند SKIP متكرر (>=2 خلال 60 ثانية) فعّل إعادة توليد توصيات فورية وادفعها عبر WebSocket.

7) منطق التوصية (نسخة MVP عملية)
- الهدف: إرجاع Top-K tracks (K=20).
- Candidate Generation:
  - إن كان لدى المستخدم تاريخ:
    - احسب user_profile_embedding كمتوسط embeddings لأحدث 50 Track تم LIKE/PLAY لها مع وزن أقل للـSKIP.
    - استخرج مرشحين عبر pgvector similarity على tracks.embedding.
  - إن كان مستخدم جديد (cold start):
    - استخدم تفضيلات مخزنة في user_profiles (preferred_genres) إن كانت موجودة.
    - إن لم توجد: اعرض onboarding داخل نفس صفحة /home كـModal لا يتطلب تسجيل:
      - اختيار 3 genres مفضلة (وتُحفظ في user_profiles).
    - رجّح popular داخل genre (يمكن حساب popular من interactions على مستوى كل المستخدمين).
- Ranking:
  - طبّق قواعد سياق:
    - إن activity=EXERCISE ارفع الطاقة/السرعة إذا كانت audio_features موجودة.
    - إن mood=CALM ارفع الهدوء (energy أقل) إن وجدت features.
  - استبعد:
    - آخر 20 track تم SKIP لها في آخر 24 ساعة لنفس المستخدم.
- Diversity:
  - لا تسمح بأكثر من 3 Tracks متتالية لنفس الفنان في القائمة النهائية.

8) استخراج الميزات الصوتية (اختياري في MVP لكن جهّز المسار)
- أنشئ Job داخل /apps/ml:
  - إن كان لديك ملف/رابط صوتي (في التطوير فقط): استخرج features وخزّنها في tracks.audio_features.
- إن لم تتوفر معاينات/ملفات: اترك audio_features null ولا تكسر النظام.

9) واجهة المستخدم (Next.js)
- صفحات:
  - /home: قائمة توصيات + مشغل بسيط + أزرار تفاعل + اختيار سياق/مزاج
  - /settings: تفضيلات genres + مزاج/نشاط افتراضي
  - /playlists: إدارة قوائم التشغيل
- لا توجد صفحات تسجيل/دخول.
- Real-time:
  - عند التفاعل (SKIP/LIKE/DISLIKE) أرسل InteractionEvent.
  - استقبل حدث "recommendations:update" عبر WebSocket لتحديث القائمة فورًا.
- دمج الهوية:
  - الواجهة تحصل على JWT/Session من THE COPY (مثلاً عبر cookie مشتركة أو injected token).
  - ترسل Authorization Bearer في كل طلب للـAPI.

10) الـAPI endpoints (REST) — بدون auth endpoints
- GET  /health
- GET  /me  (يرجع external_user_id + ملخص profile من user_profiles)
- GET  /recommendations?context=...
- POST /interactions
- GET/POST/PUT/DELETE /playlists
- POST /playlists/:id/tracks
وثّق كل endpoint بـOpenAPI + تحقق Zod.

11) الأمن والجودة
- JWT verification:
  - JWKS cache + تدوير مفاتيح + تحقق issuer/audience/exp.
  - رفض أي userId قادم من body.
- Rate limiting (Redis)
- Validation لكل المدخلات
- Logging منظم + correlationId
- Tests:
  - Unit: recommender core + ranking rules
  - Integration: /recommendations + /interactions + JWT verification (مع mock JWKS)
- Docker Compose:
  - postgres + redis + api + web (+ ml اختياري)
- Seed data:
  - أنشئ 500 track وهمي بخصائص متنوعة + embeddings عشوائية قابلة للبحث (للتشغيل المحلي)

12) المخرجات المطلوبة
- Repo كامل جاهز التشغيل:
  - npm scripts (dev/build/test)
  - docker-compose.yaml
  - migrations
  - README: خطوات التشغيل + قرارات التصميم + كيفية ربط THE COPY (JWT/JWKS أو Header Gateway) + حدود الـMVP + ما يُنفّذ لاحقًا (Neo4j/Kafka/Feature Store/Transformers).
- لا تترك TODOs حرجة. كل شيء يعمل end-to-end محليًا.
