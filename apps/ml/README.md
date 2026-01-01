# ML Service (Sequential Transformers + Interest Graph + Feature Store)

هذه الخدمة هي خطوة "رفع المستوى" بعد نجاح الـMVP.

## ما الذي تم تنفيذه الآن (ضمن هذا التحديث)

### 1) Sequential Transformer Reranker (SASRec-like)
- تم إضافة خدمة FastAPI في `apps/ml` تحتوي على endpoint:
  - `POST /rerank` لإعادة ترتيب قائمة المرشحين.
- في وضع الـMVP الافتراضي تعمل **بـHeuristic Sequencing** (بدون Torch) لتجنب تنزيل حزمة Torch الثقيلة.
- يمكن تفعيل Torch وتدريب نموذج حقيقي لاحقًا.

### 2) Interest Graph (داخل الـAPI)
- تم إضافة `InterestGraphService` يقوم باستخراج:
  - `topArtists`, `topGenres`
  - `avoidArtists`, `avoidGenres` بناءً على SKIP/DISLIKE
- يتم تخزين الجراف في جدول جديد `user_interest_graph`.
- يتم تحديث الجراف بشكل Best-effort بعد تسجيل أي تفاعل.

### 3) تكامل الـAPI مع الـML Service
- تم إضافة `MlClientService` في الـAPI لاستدعاء `POST /rerank`.
- تم تعديل `RecommendationsService` ليطبق:
  1) استبعاد `dislikedGenres`
  2) فلترة بواسطة `avoidArtists/avoidGenres`
  3) إرسال المرشحين إلى الـML Reranker ثم إعادة ترتيبهم.

## التشغيل عبر Docker

```bash
# من جذر المشروع
cp .env.example .env

docker compose up --build
```

- `api` على: `http://localhost:3001`
- `web` على: `http://localhost:3000`
- `ml` على: `http://localhost:8000/health`

### تفعيل Torch (اختياري)
في `.env`:

```bash
ML_INSTALL_TORCH=1
```

ثم:

```bash
docker compose build ml
docker compose up -d ml
```

> ملاحظة: تدريب SASRec الحقيقي **مقصود أن يكون Job خارجي** (CI/Batch) وليس ضمن مسار الطلبات.

## Feature Store (Feast)
- تم تثبيت Feast ضمن `apps/ml/requirements.txt`.
- الهيكل الأساسي جاهز لإضافة تعريفات Features لاحقًا.

