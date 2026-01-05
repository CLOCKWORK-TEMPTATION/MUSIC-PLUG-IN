#!/usr/bin/env node

/**
 * مُولّد تقرير جاهزية الإنتاج
 * يجمع بين التحليل والتقييم لإنشاء تقرير JSON شامل بالعربية
 */

const fs = require('fs');
const path = require('path');
const ProductionReadinessAnalyzer = require('./production-readiness-analyzer');
const ProductionReadinessEvaluator = require('./production-readiness-evaluator');

async function main() {
  console.log('\n' + '═'.repeat(80));
  console.log('🎯 مُولّد تقرير جاهزية الإنتاج');
  console.log('   Production Readiness Report Generator');
  console.log('═'.repeat(80) + '\n');
  
  try {
    // المرحلة 1: تحليل المستودع
    console.log('📋 المرحلة 1: تحليل المستودع...\n');
    const analyzer = new ProductionReadinessAnalyzer();
    const analysisData = await analyzer.analyze();
    analyzer.printSummary();
    
    // المرحلة 2: تقييم الجاهزية
    console.log('📊 المرحلة 2: تقييم جاهزية الإنتاج...\n');
    const evaluator = new ProductionReadinessEvaluator(analysisData);
    const report = evaluator.generateReport();
    
    // المرحلة 3: حفظ التقرير
    const outputPath = path.join(process.cwd(), 'production-readiness-report.json');
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
    
    console.log('✅ تم إنشاء التقرير بنجاح!\n');
    console.log('═'.repeat(80));
    console.log('📄 ملخص التقرير');
    console.log('═'.repeat(80));
    console.log(`\n📦 المستودع: ${report.metadata.repository}`);
    console.log(`📅 تاريخ التقرير: ${report.metadata.reportDate}`);
    console.log(`🔧 اللغات الأساسية: ${report.metadata.primaryLanguages.join(', ')}`);
    console.log(`\n📊 النتيجة الإجمالية: ${report.overallScore}%`);
    console.log(`🎯 الحالة: ${report.overallStatus.toUpperCase()}`);
    console.log(`📝 مستوى الجاهزية: ${report.readinessLevel}\n`);
    
    console.log('─'.repeat(80));
    console.log('المجالات المُقيّمة:');
    console.log('─'.repeat(80));
    
    report.domains.forEach(domain => {
      const statusIcon = {
        'ready': '✅',
        'conditional': '⚠️',
        'not-ready': '❌',
        'unknown': '❓'
      }[domain.status];
      
      console.log(`${statusIcon} ${domain.title}: ${domain.score} (${domain.status})`);
    });
    
    console.log('\n' + '─'.repeat(80));
    console.log(`🚨 مشاكل حرجة: ${report.criticalIssues.length}`);
    console.log(`⚡ إجراءات فورية: ${report.recommendations.immediate.length}`);
    console.log(`📌 إجراءات قصيرة المدى: ${report.recommendations.shortTerm.length}`);
    console.log(`📋 إجراءات متوسطة المدى: ${report.recommendations.mediumTerm.length}`);
    console.log(`📝 إجراءات طويلة المدى: ${report.recommendations.longTerm.length}`);
    
    console.log('\n' + '═'.repeat(80));
    console.log(`💾 تم حفظ التقرير الكامل في:`);
    console.log(`   ${outputPath}`);
    console.log('═'.repeat(80) + '\n');
    
  } catch (error) {
    console.error('\n❌ حدث خطأ أثناء إنشاء التقرير:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// تشغيل
if (require.main === module) {
  main();
}

module.exports = main;
