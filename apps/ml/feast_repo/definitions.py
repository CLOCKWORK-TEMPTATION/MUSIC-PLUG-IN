"""Feast definitions (Skeleton)

ملاحظة مهمة:
- هذا الهيكل مقصود كبداية عملية. في الإنتاج ستحتاج إلى:
  1) بناء جداول/Views مُجمّعة من Postgres (مثلاً user_stats_daily)
  2) تعريف Feature Views على تلك الجداول
  3) Materialize إلى Redis online store

حالياً نستخدم FileSource (Parquet) لتسهيل التشغيل دون فرض تغييرات قاعدة بيانات إضافية.
"""

from datetime import timedelta

from feast import Entity, FeatureView, Field, FileSource
from feast.types import Float32, Int64

# Entity
user = Entity(name="user", join_keys=["external_user_id"])

# Offline source example
user_stats_source = FileSource(
    name="user_stats_parquet",
    path="data/user_stats.parquet",
    timestamp_field="event_timestamp",
)

user_stats = FeatureView(
    name="user_stats",
    entities=[user],
    ttl=timedelta(days=365),
    schema=[
        Field(name="play_7d", dtype=Int64),
        Field(name="like_7d", dtype=Int64),
        Field(name="skip_7d", dtype=Int64),
        Field(name="like_rate_7d", dtype=Float32),
    ],
    source=user_stats_source,
    online=True,
)
