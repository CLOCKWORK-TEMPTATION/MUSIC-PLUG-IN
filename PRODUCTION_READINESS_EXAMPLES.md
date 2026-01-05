# أمثلة استخدام تقرير جاهزية الإنتاج

## مثال 1: توليد التقرير الأساسي

```bash
# توليد التقرير
npm run production-report

# سيتم حفظ التقرير في:
# production-readiness-report.json
```

## مثال 2: قراءة التقرير باستخدام jq

```bash
# عرض الملخص
cat production-readiness-report.json | jq '.summary'

# عرض النتيجة الإجمالية
cat production-readiness-report.json | jq '.overallScore'

# عرض الحالة الإجمالية
cat production-readiness-report.json | jq '.overallStatus'

# عرض المشاكل الحرجة
cat production-readiness-report.json | jq '.criticalIssues'

# عرض الخلاصة
cat production-readiness-report.json | jq -r '.conclusion'
```

## مثال 3: استعراض مجال معين

```bash
# مجال الأمان (id: 3)
cat production-readiness-report.json | jq '.domains[] | select(.id == 3)'

# جميع المجالات غير الجاهزة
cat production-readiness-report.json | jq '.domains[] | select(.status == "not-ready")'

# المجالات الجاهزة
cat production-readiness-report.json | jq '.domains[] | select(.status == "ready")'
```

## مثال 4: استخراج التوصيات حسب الأولوية

```bash
# التوصيات الفورية (P0)
cat production-readiness-report.json | jq '.recommendations.immediate[]'

# التوصيات قصيرة المدى (P1)
cat production-readiness-report.json | jq '.recommendations.shortTerm[]'

# التوصيات متوسطة المدى (P2)
cat production-readiness-report.json | jq '.recommendations.mediumTerm[]'

# عد التوصيات حسب الأولوية
cat production-readiness-report.json | jq '{
  immediate: .recommendations.immediate | length,
  shortTerm: .recommendations.shortTerm | length,
  mediumTerm: .recommendations.mediumTerm | length,
  longTerm: .recommendations.longTerm | length
}'
```

## مثال 5: إنشاء تقرير مخصص

```bash
# إنشاء ملخص نصي مبسط
cat production-readiness-report.json | jq -r '
  "المستودع: " + .metadata.repository,
  "التاريخ: " + .metadata.reportDate,
  "النتيجة: " + (.overallScore | tostring) + "%",
  "الحالة: " + .overallStatus,
  "",
  "المجالات:",
  (.domains[] | "  • " + .title + ": " + .score + " (" + .status + ")"),
  "",
  "المشاكل الحرجة: " + (.criticalIssues | length | tostring)
'
```

## مثال 6: استخدام في CI/CD

```bash
#!/bin/bash
# مثال: فحص الجاهزية في CI/CD

# توليد التقرير
npm run production-report

# قراءة الحالة
STATUS=$(cat production-readiness-report.json | jq -r '.overallStatus')
SCORE=$(cat production-readiness-report.json | jq -r '.overallScore')

# فحص الحد الأدنى للنقاط
if [ "$SCORE" -lt 70 ]; then
  echo "❌ فشل: النقاط أقل من 70% ($SCORE%)"
  exit 1
fi

# فحص الحالة
if [ "$STATUS" == "not-ready" ]; then
  echo "❌ فشل: التطبيق غير جاهز للإنتاج"
  exit 1
fi

echo "✅ نجح: التطبيق جاهز للإنتاج ($SCORE%)"
```

## مثال 7: تصدير إلى HTML (باستخدام jq وHTML)

```bash
cat production-readiness-report.json | jq -r '
"<!DOCTYPE html>
<html dir=\"rtl\" lang=\"ar\">
<head>
  <meta charset=\"UTF-8\">
  <title>تقرير جاهزية الإنتاج</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    h1 { color: #333; }
    .domain { border: 1px solid #ddd; padding: 10px; margin: 10px 0; }
    .ready { background: #d4edda; }
    .conditional { background: #fff3cd; }
    .not-ready { background: #f8d7da; }
  </style>
</head>
<body>
  <h1>تقرير جاهزية الإنتاج</h1>
  <p><strong>المستودع:</strong> " + .metadata.repository + "</p>
  <p><strong>التاريخ:</strong> " + .metadata.reportDate + "</p>
  <p><strong>النتيجة الإجمالية:</strong> " + (.overallScore | tostring) + "%</p>
  <p><strong>الحالة:</strong> " + .overallStatus + "</p>
  
  <h2>المجالات</h2>
  " + (.domains | map("
  <div class=\"domain " + .status + "\">
    <h3>" + .title + " (" + .score + ")</h3>
    <p>" + .description + "</p>
  </div>") | join("\n  ")) + "
  
  <h2>الخلاصة</h2>
  <p>" + .conclusion + "</p>
</body>
</html>"
' > production-readiness-report.html

echo "تم إنشاء التقرير في: production-readiness-report.html"
```

## مثال 8: المقارنة بين تقريرين

```bash
# حفظ التقرير الأول
npm run production-report
mv production-readiness-report.json report-before.json

# إجراء تغييرات...
# git commit ...

# توليد تقرير جديد
npm run production-report
mv production-readiness-report.json report-after.json

# مقارنة النقاط
echo "قبل: $(cat report-before.json | jq -r '.overallScore')%"
echo "بعد: $(cat report-after.json | jq -r '.overallScore')%"

# مقارنة المشاكل الحرجة
echo "مشاكل حرجة قبل: $(cat report-before.json | jq '.criticalIssues | length')"
echo "مشاكل حرجة بعد: $(cat report-after.json | jq '.criticalIssues | length')"
```

## مثال 9: استخدام برمجي في Node.js

```javascript
const fs = require('fs');

// قراءة التقرير
const report = JSON.parse(
  fs.readFileSync('production-readiness-report.json', 'utf8')
);

// طباعة الملخص
console.log(`المستودع: ${report.metadata.repository}`);
console.log(`النتيجة: ${report.overallScore}%`);
console.log(`الحالة: ${report.overallStatus}`);

// الحصول على المجالات غير الجاهزة
const notReadyDomains = report.domains.filter(d => d.status === 'not-ready');
console.log(`\nمجالات غير جاهزة: ${notReadyDomains.length}`);
notReadyDomains.forEach(d => {
  console.log(`  • ${d.title}: ${d.score}`);
});

// الحصول على التوصيات الفورية
console.log(`\nتوصيات فورية (${report.recommendations.immediate.length}):`);
report.recommendations.immediate.forEach((rec, i) => {
  console.log(`  ${i + 1}. ${rec}`);
});
```

## مثال 10: إرسال التقرير عبر البريد

```bash
#!/bin/bash
# إرسال ملخص التقرير عبر البريد

npm run production-report

SUMMARY=$(cat production-readiness-report.json | jq -r '
  "المستودع: " + .metadata.repository + "\n" +
  "التاريخ: " + .metadata.reportDate + "\n" +
  "النتيجة: " + (.overallScore | tostring) + "%\n" +
  "الحالة: " + .overallStatus + "\n\n" +
  "مشاكل حرجة: " + (.criticalIssues | length | tostring) + "\n" +
  "توصيات فورية: " + (.recommendations.immediate | length | tostring)
')

# إرسال عبر البريد (يتطلب mailx أو sendmail)
echo "$SUMMARY" | mail -s "تقرير جاهزية الإنتاج" team@example.com
```

---

**ملاحظة**: بعض الأمثلة تتطلب تثبيت أدوات إضافية مثل `jq` لمعالجة JSON.
