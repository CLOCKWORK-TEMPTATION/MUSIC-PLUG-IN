# ML Pipeline - Advanced Music Recommendation System

هذا المجلد يحتوي على البنية التحتية للتعلم الآلي المتقدم للمشروع.

## 🏗️ المكونات الرئيسية

### 1. Sequential Transformer (SASRec)
**الملف:** `train_transformer.py`

نموذج Self-Attentive Sequential Recommendation الذي يتعلم من تتابع تفاعلات المستخدم.

**الاستخدام:**
```bash
# داخل container mlpipeline
docker exec -it music-rec-mlpipeline python train_transformer.py \
  --epochs 10 \
  --batch-size 128 \
  --max-seq-len 50 \
  --output /app/apps/ml/data/model.pt
```

**المخرجات:**
- `model.pt`: النموذج المدرب + vocabulary mapping

---

### 2. Interest Graph Generator (LLM-Powered)
**الملف:** `generate_interest_graph.py`

يستخدم LLM (Claude/GPT) لتحليل تاريخ المستخدم وبناء Interest Graph ديناميكي.

**الاستخدام:**
```bash
# لمستخدم واحد
docker exec -it music-rec-mlpipeline python generate_interest_graph.py \
  --user-id user123 \
  --provider anthropic

# لكل المستخدمين
docker exec -it music-rec-mlpipeline python generate_interest_graph.py \
  --all-users \
  --batch-size 100 \
  --provider openai
```

**المخرجات:**
- يحفظ Interest Graph في جدول `user_interest_graph`

---

### 3. Feature Store (Feast + Redis)
**المجلد:** `feature_store/`

نظام موحد للسمات يضمن الاتساق بين التدريب والإنتاج.

**البنية:**
```
feature_store/
├── feature_definitions.py     # Feature Views و Entities
├── feast_repo/
│   ├── feature_store.yaml    # Feast configuration
│   └── feature_views.py      # Import للـregistry
└── materialize_features.py   # نقل البيانات من DB إلى Redis
```

**الاستخدام:**
```bash
# تسجيل Feature Views
docker exec -it music-rec-mlpipeline bash -c "cd /ml_pipeline/feature_store/feast_repo && feast apply"

# Materialize features إلى Redis
docker exec -it music-rec-mlpipeline python feature_store/materialize_features.py --all
```

---

## 🚀 سير العمل الكامل

### المرحلة الأولى: تحضير البيانات
```bash
# 1. Materialize features
docker exec -it music-rec-mlpipeline python feature_store/materialize_features.py --all

# 2. Generate interest graphs
docker exec -it music-rec-mlpipeline python generate_interest_graph.py --all-users
```

### المرحلة الثانية: التدريب
```bash
# تدريب Sequential Transformer
docker exec -it music-rec-mlpipeline python train_transformer.py \
  --epochs 20 \
  --batch-size 256 \
  --embedding-dim 128 \
  --num-heads 4 \
  --num-layers 2
```

### المرحلة الثالثة: التشغيل
- النموذج المدرب يُحمّل تلقائياً في خدمة ML
- Feature Store يوفر السمات في الوقت الفعلي
- Interest Graph يُستخدم لتحسين التوصيات

---

## 📊 Feature Views المتاحة

| Feature View | Entity | الوصف |
|-------------|--------|-------|
| `user_listening_stats` | user | إحصائيات الاستماع (7 أيام) |
| `user_audio_preferences` | user | تفضيلات الصوت (30 يوم) |
| `track_audio_features` | track | خصائص الصوت للأغنية |
| `track_popularity` | track | مقاييس الشعبية (7 أيام) |
| `user_track_interactions` | user, track | تفاعلات user-track (30 يوم) |
| `context_aware_features` | on-demand | سمات السياق الديناميكية |

---

## 🔧 المتطلبات

**متغيرات البيئة المطلوبة:**
```env
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-...  # للـLLM
OPENAI_API_KEY=sk-...      # اختياري
FEAST_REDIS_HOST=redis
FEAST_REDIS_PORT=6379
```

---

## 📈 المراقبة والتقييم

### تفعيل TensorBoard
```bash
docker exec -it music-rec-mlpipeline tensorboard --logdir=/ml_pipeline/logs --bind_all
```

### مقاييس الأداء
- **Latency**: < 100ms لاستخراج السمات
- **Throughput**: > 1000 req/s للـFeature Store
- **Model Performance**: NDCG@10, Hit Rate@20

---

## 🔄 جدولة التحديثات

### يومياً (Cron)
```bash
# Materialize features
0 2 * * * docker exec music-rec-mlpipeline python feature_store/materialize_features.py --all
```

### أسبوعياً
```bash
# Re-train model
0 3 * * 0 docker exec music-rec-mlpipeline python train_transformer.py --epochs 10
```

### شهرياً
```bash
# Regenerate interest graphs
0 4 1 * * docker exec music-rec-mlpipeline python generate_interest_graph.py --all-users
```

---

## 🐛 استكشاف الأخطاء

### النموذج لا يتحمّل
- تحقق من وجود `/app/apps/ml/data/model.pt`
- تحقق من `SEQUENTIAL_MODEL_PATH` في docker-compose

### Feast لا يعمل
- تأكد من تشغيل Redis
- راجع `feast_repo/feature_store.yaml`
- نفذ `feast apply` داخل feast_repo

### LLM timeouts
- استخدم `--batch-size` أصغر
- أضف retry logic
- راقب API rate limits

---

## 📚 المراجع

- **SASRec Paper**: [Self-Attentive Sequential Recommendation](https://arxiv.org/abs/1808.09781)
- **Feast Docs**: https://docs.feast.dev/
- **PyTorch Lightning**: https://lightning.ai/docs/pytorch/

---

## 🎯 الخطوات التالية

1. ✅ تدريب النموذج على بيانات حقيقية
2. ✅ Materialize features بانتظام
3. ✅ مراقبة الأداء وتحسين hyperparameters
4. 🔄 إضافة A/B testing
5. 🔄 تطبيق Model versioning
6. 🔄 دمج MLflow لتتبع التجارب
