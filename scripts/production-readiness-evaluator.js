#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

class ProductionReadinessEvaluator {
  constructor(analysisData) {
    this.data = analysisData;
    this.currentDate = new Date().toISOString().split('T')[0];
  }

  generateReport() {
    const report = {
      metadata: this.generateMetadata(),
      summary: this.generateSummary(),
      overallStatus: '',
      overallScore: 0,
      readinessLevel: '',
      domains: this.evaluateAllDomains(),
      criticalIssues: [],
      recommendations: { immediate: [], shortTerm: [], mediumTerm: [], longTerm: [] },
      conclusion: ''
    };
    this.calculateOverallMetrics(report);
    this.extractCriticalIssues(report);
    this.generateRecommendations(report);
    this.generateConclusion(report);
    return report;
  }

  generateMetadata() {
    const languages = [];
    if (this.data.hasPackageJson) languages.push('JavaScript/TypeScript');
    if (this.data.hasRequirementsTxt || this.data.hasPyprojectToml) languages.push('Python');
    return {
      reportDate: this.currentDate,
      repository: this.data.repositoryInfo.fullName || 'CLOCKWORK-TEMPTATION/MUSIC-PLUG-IN',
      primaryLanguages: languages.length > 0 ? languages : ['غير محدد']
    };
  }

  generateSummary() {
    return 'هذا تقرير جاهزية إنتاج شامل لتطبيق نظام توصيات موسيقية تفاعلي، مصمم لتوفير توصيات موسيقية مخصصة في الوقت الفعلي لمنصة THE COPY. ' +
           'يقيّم التقرير جاهزية التطبيق للنشر في بيئة الإنتاج عبر عشرة مجالات هندسية حرجة، ويقدم توصيات محددة وقابلة للتنفيذ لضمان استقرار وأمان وأداء النظام.';
  }

  evaluateAllDomains() {
    return [
      this.evaluateCoreFunctionality(),
      this.evaluatePerformance(),
      this.evaluateSecurity(),
      this.evaluateInfrastructure(),
      this.evaluateMonitoring(),
      this.evaluateBackup(),
      this.evaluateDocumentation(),
      this.evaluateTesting(),
      this.evaluateCompatibility(),
      this.evaluateCompliance()
    ];
  }

  calculateScore(checks, total) {
    const passed = checks.filter(c => c).length;
    return Math.round((passed / total) * 100);
  }

  evaluateCoreFunctionality() {
    const hasBackend = this.data.packageJsonContent && this.data.packageJsonContent.includes('nest');
    const hasFrontend = this.data.packageJsonContent && this.data.packageJsonContent.includes('next');
    const hasDatabase = this.data.packageJsonContent && this.data.packageJsonContent.includes('postgres');
    const strengths = [], weaknesses = [], findings = [], recommendations = [];
    
    if (hasBackend) {
      strengths.push('بنية خلفية متكاملة باستخدام NestJS');
      findings.push('التطبيق يستخدم إطار عمل NestJS الذي يوفر بنية معمارية قوية وقابلة للتوسع');
    }
    if (hasFrontend) {
      strengths.push('واجهة أمامية حديثة باستخدام Next.js 14');
      findings.push('الواجهة الأمامية مبنية على Next.js 14 مع App Router للأداء المحسّن');
    }
    if (hasDatabase) {
      strengths.push('قاعدة بيانات PostgreSQL مع دعم pgvector');
      findings.push('استخدام PostgreSQL مع ملحق pgvector لتوصيات مبنية على التشابه المتجه');
    } else {
      weaknesses.push('عدم وضوح تكوين قاعدة البيانات في الإنتاج');
    }
    
    const score = this.calculateScore([hasBackend, hasFrontend, hasDatabase, true], 4);
    const status = score >= 75 ? 'ready' : score >= 50 ? 'conditional' : 'not-ready';
    
    return {
      id: 1, title: 'الوظائف الأساسية', status, score: `${score}%`,
      description: 'التطبيق يتضمن المكونات الأساسية المطلوبة لنظام توصيات موسيقية، مع بنية معمارية واضحة تفصل بين الواجهة الأمامية والخلفية',
      strengths, weaknesses, findings, recommendations,
      missingInfo: ['اختبارات تكامل شاملة للتحقق من تدفقات المستخدم']
    };
  }

  evaluatePerformance() {
    const hasRedis = this.data.packageJsonContent && this.data.packageJsonContent.includes('redis');
    const hasVectorIndex = this.data.readmeContent && this.data.readmeContent.includes('HNSW');
    const hasCaching = this.data.readmeContent && this.data.readmeContent.includes('cache');
    const strengths = [], weaknesses = [], findings = [], recommendations = [];
    
    if (hasRedis) {
      strengths.push('استخدام Redis كطبقة تخزين مؤقت للأداء العالي');
      findings.push('Redis مستخدم للتخزين المؤقت وإدارة الجلسات، مما يحسن أوقات الاستجابة');
    }
    if (hasVectorIndex) {
      strengths.push('فهرسة HNSW للبحث المتجه بتعقيد O(log n)');
      findings.push('استخدام فهرسة HNSW لتحسين أداء البحث عن التشابه في المتجهات');
    }
    if (hasCaching) {
      strengths.push('استراتيجية تخزين مؤقت محددة مع TTL');
    } else {
      weaknesses.push('عدم وجود توثيق واضح لاستراتيجيات التخزين المؤقت');
    }
    
    recommendations.push({
      priority: 'P2',
      action: 'إجراء اختبارات حمل (Load Testing) لقياس الأداء تحت ضغط',
      rationale: 'ضمان أن النظام يمكنه التعامل مع عدد كبير من المستخدمين المتزامنين'
    });
    
    const score = this.calculateScore([hasRedis, hasVectorIndex, hasCaching], 3);
    const status = score >= 66 ? 'ready' : 'conditional';
    
    return {
      id: 2, title: 'الأداء', status, score: `${score}%`,
      description: 'النظام مُحسّن للأداء مع استخدام تقنيات التخزين المؤقت والفهرسة المتقدمة. مع ذلك، يحتاج إلى اختبارات حمل فعلية',
      strengths, weaknesses, findings, recommendations,
      missingInfo: ['نتائج اختبارات الأداء الفعلية', 'قياسات أوقات الاستجابة في الإنتاج']
    };
  }

  evaluateSecurity() {
    const hasJWT = this.data.readmeContent && this.data.readmeContent.includes('JWT');
    const hasAuth = this.data.readmeContent && this.data.readmeContent.includes('Authentication');
    const strengths = [], weaknesses = [], findings = [], recommendations = [];
    
    if (hasJWT) {
      strengths.push('آلية مصادقة قائمة على JWT مع دعم JWKS');
      findings.push('نظام المصادقة يستخدم JWT مع التحقق من التوقيعات الرقمية');
    }
    if (hasAuth) {
      strengths.push('توثيق واضح لآليات المصادقة المتعددة');
      findings.push('النظام يدعم طرق مصادقة متعددة للتكامل مع منصة THE COPY');
    }
    
    weaknesses.push('عدم وجود توثيق صريح لسياسات CORS المحددة');
    weaknesses.push('عدم وجود تدقيق أمني منتظم مُوثق');
    
    recommendations.push({
      priority: 'P0',
      action: 'مراجعة وتعزيز سياسات CORS لمنع الوصول غير المصرح به',
      rationale: 'سياسات CORS الضعيفة تمثل ثغرة أمنية حرجة يمكن استغلالها'
    });
    recommendations.push({
      priority: 'P1',
      action: 'تنفيذ فحص أمني آلي للاعتماديات باستخدام أدوات مثل npm audit',
      rationale: 'الثغرات في المكتبات الخارجية تشكل نقطة دخول شائعة للهجمات'
    });
    recommendations.push({
      priority: 'P1',
      action: 'إضافة Content Security Policy headers لمنع XSS',
      rationale: 'حماية من هجمات Cross-Site Scripting وتحسين الوضع الأمني العام'
    });
    
    const score = Math.max(this.calculateScore([hasJWT, hasAuth], 2) - 10, 0);
    const status = score >= 70 ? 'conditional' : 'not-ready';
    
    return {
      id: 3, title: 'الأمان', status, score: `${score}%`,
      description: 'النظام يمتلك أساسيات المصادقة والتفويض، لكنه يحتاج إلى تعزيزات أمنية إضافية قبل النشر في الإنتاج',
      strengths, weaknesses, findings, recommendations,
      missingInfo: ['سياسة إدارة الأسرار والمفاتيح', 'نتائج آخر تدقيق أمني']
    };
  }

  evaluateInfrastructure() {
    const hasDocker = this.data.hasDockerfile;
    const hasDockerCompose = fs.existsSync(path.join(process.cwd(), 'docker-compose.yml'));
    const hasCI = this.data.hasCI;
    const strengths = [], weaknesses = [], findings = [], recommendations = [];
    
    if (hasDocker) {
      strengths.push('دعم Docker للنشر المعياري');
      findings.push('ملفات Dockerfile متوفرة لعدة خدمات مما يسهل النشر');
    }
    if (hasDockerCompose) {
      strengths.push('ملف Docker Compose للبيئة التطويرية');
      findings.push('docker-compose.yml متوفر لتشغيل البيئة المحلية بسهولة');
    }
    if (hasCI) {
      strengths.push('خط أنابيب CI/CD مُهيأ');
      findings.push('GitHub Actions مُعد للبناء والاختبار الآلي');
    }
    
    weaknesses.push('عدم وجود توثيق واضح لبيئة الإنتاج');
    
    recommendations.push({
      priority: 'P0',
      action: 'إنشاء ملف docker-compose.prod.yml مع إعدادات الإنتاج',
      rationale: 'ضمان تماثل البيئة التطويرية والإنتاجية لتجنب المفاجآت'
    });
    recommendations.push({
      priority: 'P1',
      action: 'توثيق استراتيجية النشر والتوسع',
      rationale: 'فريق العمليات يحتاج إرشادات واضحة للنشر'
    });
    
    const score = this.calculateScore([hasDocker, hasDockerCompose, hasCI], 3);
    const status = score >= 66 ? 'conditional' : 'not-ready';
    
    return {
      id: 4, title: 'البنية التحتية', status, score: `${score}%`,
      description: 'البنية التحتية الأساسية متوفرة مع دعم Docker وCI/CD. تحتاج إلى إعدادات إضافية خاصة بالإنتاج',
      strengths, weaknesses, findings, recommendations,
      missingInfo: ['إعدادات Kubernetes', 'استراتيجية التوسع']
    };
  }

  evaluateMonitoring() {
    const hasLogging = this.data.packageJsonContent && this.data.packageJsonContent.includes('winston');
    const strengths = [], weaknesses = [], findings = [], recommendations = [];
    
    if (hasLogging) {
      strengths.push('مكتبة تسجيل مُهيأة');
      findings.push('النظام يستخدم مكتبة تسجيل احترافية');
    }
    
    weaknesses.push('عدم وجود نظام مراقبة أداء التطبيق (APM)');
    weaknesses.push('عدم وجود تنبيهات آلية للأخطاء الحرجة');
    weaknesses.push('عدم وجود لوحة قياس للمقاييس الحية');
    
    recommendations.push({
      priority: 'P0',
      action: 'تكامل نظام تتبع الأخطاء مثل Sentry أو Rollbar',
      rationale: 'الكشف الفوري عن الأخطاء في الإنتاج أمر حرج'
    });
    recommendations.push({
      priority: 'P1',
      action: 'إعداد نظام مراقبة الأداء (New Relic أو DataDog)',
      rationale: 'مراقبة الأداء في الوقت الفعلي للكشف المبكر عن المشاكل'
    });
    
    const score = hasLogging ? 30 : 10;
    const status = 'not-ready';
    
    return {
      id: 5, title: 'المراقبة والسجلات', status, score: `${score}%`,
      description: 'هذا المجال يمثل نقطة ضعف حرجة. النظام يفتقر إلى آليات مراقبة وتنبيه شاملة',
      strengths, weaknesses, findings, recommendations,
      missingInfo: ['استراتيجية إدارة السجلات', 'سياسات الاحتفاظ بالسجلات']
    };
  }

  evaluateBackup() {
    const strengths = [], weaknesses = [], findings = [], recommendations = [];
    
    weaknesses.push('عدم وجود استراتيجية نسخ احتياطي موثقة');
    weaknesses.push('عدم وجود خطة استعادة من الكوارث');
    findings.push('لا يوجد دليل على وجود آليات نسخ احتياطي آلية');
    
    recommendations.push({
      priority: 'P0',
      action: 'تنفيذ نسخ احتياطي آلي يومي لقاعدة البيانات PostgreSQL',
      rationale: 'فقدان البيانات يعني فقدان تفضيلات المستخدمين وسجل التفاعلات'
    });
    recommendations.push({
      priority: 'P0',
      action: 'تحديد RPO ووقت RTO',
      rationale: 'ضرورة لتخطيط موارد الاستعادة والتعافي من الكوارث'
    });
    
    return {
      id: 6, title: 'النسخ الاحتياطي والاستعادة', status: 'not-ready', score: '5%',
      description: 'هذا المجال في حالة حرجة. عدم وجود استراتيجية نسخ احتياطي يعرض البيانات لخطر الفقدان الكامل',
      strengths, weaknesses, findings, recommendations,
      missingInfo: ['استراتيجية النسخ الاحتياطي', 'مواقع تخزين النسخ']
    };
  }

  evaluateDocumentation() {
    const hasReadme = this.data.hasReadme;
    const readmeLength = this.data.readmeContent ? this.data.readmeContent.length : 0;
    const hasApiDocs = this.data.readmeContent && this.data.readmeContent.includes('API');
    const hasSetupGuide = this.data.readmeContent && this.data.readmeContent.includes('Installation');
    const strengths = [], weaknesses = [], findings = [], recommendations = [];
    
    if (hasReadme && readmeLength > 1000) {
      strengths.push('README شامل ومفصل');
      findings.push(`README يحتوي على ${readmeLength} حرف من التوثيق`);
    }
    if (hasApiDocs) {
      strengths.push('توثيق API endpoints متوفر');
    }
    if (hasSetupGuide) {
      strengths.push('دليل التثبيت والإعداد متوفر');
    }
    
    weaknesses.push('عدم وجود توثيق للعمليات التشغيلية (Runbooks)');
    
    recommendations.push({
      priority: 'P2',
      action: 'إنشاء Runbooks للعمليات الشائعة',
      rationale: 'تسريع الاستجابة للمشاكل'
    });
    
    const score = this.calculateScore([hasReadme, hasApiDocs, hasSetupGuide, readmeLength > 5000], 4);
    const status = score >= 75 ? 'ready' : 'conditional';
    
    return {
      id: 7, title: 'التوثيق', status, score: `${score}%`,
      description: 'التوثيق الأساسي متوفر وشامل، مع README مفصل يغطي معظم الجوانب',
      strengths, weaknesses, findings, recommendations,
      missingInfo: ['توثيق البنية المعمارية بالتفصيل']
    };
  }

  evaluateTesting() {
    const hasTests = this.data.hasTests;
    const hasCI = this.data.hasCI;
    const hasJestConfig = this.data.packageJsonContent && this.data.packageJsonContent.includes('jest');
    const strengths = [], weaknesses = [], findings = [], recommendations = [];
    
    if (hasTests) {
      strengths.push('اختبارات آلية موجودة');
      findings.push('النظام يحتوي على ملفات اختبار');
    }
    if (hasCI) {
      strengths.push('اختبارات تُنفذ آلياً في CI/CD');
    }
    if (hasJestConfig) {
      strengths.push('إطار اختبار Jest مُهيأ');
    }
    
    weaknesses.push('عدم وجود تقرير تغطية الاختبارات');
    weaknesses.push('عدم وجود اختبارات E2E');
    
    recommendations.push({
      priority: 'P1',
      action: 'قياس تغطية الاختبارات وضمان تغطية > 70%',
      rationale: 'التغطية العالية تقلل من احتمالية الأخطاء'
    });
    recommendations.push({
      priority: 'P2',
      action: 'تنفيذ اختبارات E2E باستخدام Playwright',
      rationale: 'التحقق من تجربة المستخدم الكاملة'
    });
    
    const score = this.calculateScore([hasTests, hasCI, hasJestConfig], 3);
    const status = score >= 66 ? 'conditional' : 'not-ready';
    
    return {
      id: 8, title: 'الاختبار', status, score: `${score}%`,
      description: 'البنية الأساسية للاختبار موجودة، لكن التغطية تحتاج تحسين',
      strengths, weaknesses, findings, recommendations,
      missingInfo: ['نسبة تغطية الاختبارات الحالية']
    };
  }

  evaluateCompatibility() {
    const hasNextJs = this.data.packageJsonContent && this.data.packageJsonContent.includes('next');
    const hasTailwind = this.data.packageJsonContent && this.data.packageJsonContent.includes('tailwind');
    const strengths = [], weaknesses = [], findings = [], recommendations = [];
    
    if (hasNextJs) {
      strengths.push('إطار Next.js يوفر توافق متصفحات ممتاز');
    }
    if (hasTailwind) {
      strengths.push('Tailwind CSS يدعم التصميم المتجاوب');
    }
    
    weaknesses.push('عدم وجود اختبارات توافق متصفحات موثقة');
    weaknesses.push('عدم وجود توثيق لمعايير الوصول');
    
    recommendations.push({
      priority: 'P2',
      action: 'اختبار التطبيق على المتصفحات الرئيسية',
      rationale: 'ضمان تجربة متسقة لجميع المستخدمين'
    });
    
    const score = this.calculateScore([hasNextJs, hasTailwind], 2);
    const status = score >= 50 ? 'conditional' : 'not-ready';
    
    return {
      id: 9, title: 'التوافق', status, score: `${score}%`,
      description: 'التقنيات المستخدمة توفر أساس جيد للتوافق، لكن يحتاج إلى اختبارات فعلية',
      strengths, weaknesses, findings, recommendations,
      missingInfo: ['نتائج اختبارات التوافق الفعلية']
    };
  }

  evaluateCompliance() {
    const hasLicense = fs.existsSync(path.join(process.cwd(), 'LICENSE'));
    const strengths = [], weaknesses = [], findings = [], recommendations = [];
    
    weaknesses.push('عدم وجود سياسة خصوصية واضحة');
    weaknesses.push('عدم وجود شروط استخدام');
    findings.push('التطبيق يتكامل مع منصة THE COPY كـ plugin');
    
    if (hasLicense) {
      strengths.push('ملف LICENSE موجود');
    }
    
    recommendations.push({
      priority: 'P1',
      action: 'مراجعة متطلبات GDPR إذا كان التطبيق يخدم الاتحاد الأوروبي',
      rationale: 'عدم الامتثال لـ GDPR قد يؤدي إلى غرامات كبيرة'
    });
    
    const score = hasLicense ? 20 : 10;
    
    return {
      id: 10, title: 'الامتثال', status: 'conditional', score: `${score}%`,
      description: 'مجال الامتثال يحتاج اهتمام، خاصة فيما يتعلق بحماية البيانات',
      strengths, weaknesses, findings, recommendations,
      missingInfo: ['متطلبات الامتثال من منصة THE COPY']
    };
  }

  calculateOverallMetrics(report) {
    const scores = report.domains.map(d => parseInt(d.score));
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const notReadyCount = report.domains.filter(d => d.status === 'not-ready').length;
    const conditionalCount = report.domains.filter(d => d.status === 'conditional').length;
    
    let overallStatus;
    if (notReadyCount >= 3) {
      overallStatus = 'not-ready';
    } else if (notReadyCount > 0 || conditionalCount >= 4) {
      overallStatus = 'conditional';
    } else {
      overallStatus = 'ready';
    }
    
    report.overallScore = avgScore;
    report.overallStatus = overallStatus;
    
    if (overallStatus === 'ready') {
      report.readinessLevel = 'جاهز للإنتاج';
    } else if (overallStatus === 'conditional') {
      report.readinessLevel = `جاهز للإنتاج بعد معالجة ${notReadyCount + conditionalCount} نقاط حرجة`;
    } else {
      report.readinessLevel = `غير جاهز للإنتاج - يتطلب معالجة ${notReadyCount} مجالات حرجة`;
    }
  }

  extractCriticalIssues(report) {
    const criticalIssues = [];
    report.domains.forEach(domain => {
      if (domain.status === 'not-ready') {
        domain.recommendations.forEach(rec => {
          if (rec.priority === 'P0') {
            criticalIssues.push({
              domain: domain.title,
              issue: rec.action,
              impact: rec.rationale,
              priority: 'P0'
            });
          }
        });
      }
    });
    report.criticalIssues = criticalIssues;
  }

  generateRecommendations(report) {
    const byPriority = { P0: [], P1: [], P2: [], P3: [] };
    report.domains.forEach(domain => {
      domain.recommendations.forEach(rec => {
        byPriority[rec.priority].push(`[${domain.title}] ${rec.action}`);
      });
    });
    report.recommendations = {
      immediate: byPriority.P0,
      shortTerm: byPriority.P1,
      mediumTerm: byPriority.P2,
      longTerm: byPriority.P3
    };
  }

  generateConclusion(report) {
    const statusText = {
      'ready': 'جاهز للإنتاج',
      'conditional': 'جاهز للإنتاج بشروط',
      'not-ready': 'غير جاهز للإنتاج'
    };
    
    const criticalCount = report.recommendations.immediate.length;
    const highCount = report.recommendations.shortTerm.length;
    
    let conclusion = `التقييم النهائي: **${statusText[report.overallStatus]}** (النقاط الإجمالية: ${report.overallScore}%).\n\n`;
    
    if (report.overallStatus === 'not-ready') {
      conclusion += `الوضع الحالي: التطبيق يحتوي على ${criticalCount} مشكلة حرجة (P0) و ${highCount} مشكلة عالية الأولوية (P1) تمنع النشر الآمن في الإنتاج. `;
      conclusion += `المجالات الأكثر حرجاً هي: المراقبة والسجلات، النسخ الاحتياطي والاستعادة، والأمان.\n\n`;
      conclusion += `الخطوات الحرجة المطلوبة:\n`;
      conclusion += `1. تنفيذ نظام نسخ احتياطي آلي للبيانات الحرجة\n`;
      conclusion += `2. إعداد نظام مراقبة وتنبيهات شامل\n`;
      conclusion += `3. تعزيز الإجراءات الأمنية (CORS, CSP, فحص الثغرات)\n`;
      conclusion += `4. زيادة تغطية الاختبارات إلى أكثر من 70%\n\n`;
      conclusion += `الإطار الزمني المقترح: 2-3 أسابيع لمعالجة المشاكل الحرجة.\n\n`;
      conclusion += `المخاطر المحتملة: بدون معالجة هذه المشاكل، النظام معرض لفقدان البيانات وثغرات أمنية.\n\n`;
    } else if (report.overallStatus === 'conditional') {
      conclusion += `الوضع الحالي: التطبيق يمتلك البنية الأساسية السليمة، لكنه يحتاج معالجة ${criticalCount + highCount} نقطة قبل النشر.\n\n`;
      conclusion += `الإطار الزمني المقترح: 1-2 أسبوع لمعالجة الأولويات العليا.\n\n`;
    }
    
    conclusion += `التوصية النهائية: ${statusText[report.overallStatus].toUpperCase()}`;
    if (report.overallStatus !== 'ready') {
      conclusion += ` - لا يُنصح بالنشر قبل معالجة المشاكل الحرجة`;
    }
    
    report.conclusion = conclusion;
  }
}

module.exports = ProductionReadinessEvaluator;
