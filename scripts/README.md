# Production Readiness Report Scripts

هذا المجلد يحتوي على أدوات توليد تقرير جاهزية الإنتاج.

## الملفات

### 1. production-readiness-analyzer.js
محلل المستودع - يقوم بفحص وجمع البيانات عن:
- الملفات الأساسية (package.json, Dockerfile, إلخ)
- بنية المشروع
- الاختبارات والCI/CD
- محتوى التوثيق

### 2. production-readiness-evaluator.js
مُقيّم الجاهزية - يقوم بتقييم المستودع عبر 10 مجالات:
1. الوظائف الأساسية
2. الأداء
3. الأمان
4. البنية التحتية
5. المراقبة والسجلات
6. النسخ الاحتياطي والاستعادة
7. التوثيق
8. الاختبار
9. التوافق
10. الامتثال

### 3. generate-production-report.js
السكريبت الرئيسي - ينسق عملية التحليل والتقييم ويولد التقرير النهائي.

## الاستخدام

من المجلد الرئيسي للمشروع:

```bash
npm run production-report
```

أو مباشرة:

```bash
node scripts/generate-production-report.js
```

## المخرجات

- `production-readiness-report.json` - التقرير الكامل بصيغة JSON (بالعربية)
- عرض ملخص في الطرفية

## التخصيص

لتعديل معايير التقييم، راجع ملف `production-readiness-evaluator.js` وعدّل الدوال المناسبة.

---

راجع [PRODUCTION_READINESS.md](../PRODUCTION_READINESS.md) للتوثيق الكامل.
