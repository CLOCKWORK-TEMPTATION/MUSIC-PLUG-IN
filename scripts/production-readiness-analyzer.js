#!/usr/bin/env node

/**
 * Production Readiness Analyzer
 * أداة تحليل جاهزية الإنتاج - تقوم بفحص شامل للمستودع وإنشاء تقرير مفصل
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ProductionReadinessAnalyzer {
  constructor(repoPath = process.cwd()) {
    this.repoPath = repoPath;
    this.analysisData = {
      hasPackageJson: false,
      hasRequirementsTxt: false,
      hasPyprojectToml: false,
      hasDockerfile: false,
      hasTests: false,
      hasCI: false,
      hasReadme: false,
      hasGitignore: false,
      fileStructure: [],
      packageJsonContent: null,
      readmeContent: null,
      requirementsContent: null,
      pyprojectContent: null,
      dockerfileContent: null,
      ciWorkflowContent: null,
      repositoryInfo: {},
    };
  }

  /**
   * تنفيذ التحليل الشامل
   */
  async analyze() {
    console.log('🔍 بدء تحليل المستودع...\n');
    
    this.checkFileExistence();
    this.loadFileContents();
    this.analyzeFileStructure();
    this.analyzeRepositoryInfo();
    this.detectTests();
    this.detectCI();
    
    console.log('✅ اكتمل التحليل الأولي\n');
    return this.analysisData;
  }

  /**
   * فحص وجود الملفات الأساسية
   */
  checkFileExistence() {
    const filesToCheck = {
      hasPackageJson: 'package.json',
      hasRequirementsTxt: 'requirements.txt',
      hasPyprojectToml: 'pyproject.toml',
      hasDockerfile: 'Dockerfile',
      hasReadme: 'README.md',
      hasGitignore: '.gitignore',
    };

    for (const [key, fileName] of Object.entries(filesToCheck)) {
      const filePath = path.join(this.repoPath, fileName);
      this.analysisData[key] = fs.existsSync(filePath);
      
      if (this.analysisData[key]) {
        console.log(`  ✓ ${fileName} موجود`);
      }
    }

    // البحث عن ملفات Docker في المجلدات الفرعية
    if (!this.analysisData.hasDockerfile) {
      const dockerfiles = this.findFiles('Dockerfile');
      this.analysisData.hasDockerfile = dockerfiles.length > 0;
    }

    // البحث عن requirements.txt في المجلدات الفرعية
    if (!this.analysisData.hasRequirementsTxt) {
      const requirementFiles = this.findFiles('requirements.txt');
      this.analysisData.hasRequirementsTxt = requirementFiles.length > 0;
    }
  }

  /**
   * تحميل محتوى الملفات
   */
  loadFileContents() {
    // package.json
    if (this.analysisData.hasPackageJson) {
      const packagePath = path.join(this.repoPath, 'package.json');
      this.analysisData.packageJsonContent = fs.readFileSync(packagePath, 'utf8');
    }

    // README.md
    if (this.analysisData.hasReadme) {
      const readmePath = path.join(this.repoPath, 'README.md');
      this.analysisData.readmeContent = fs.readFileSync(readmePath, 'utf8');
    }

    // requirements.txt
    const requirementFiles = this.findFiles('requirements.txt');
    if (requirementFiles.length > 0) {
      this.analysisData.requirementsContent = fs.readFileSync(requirementFiles[0], 'utf8');
    }

    // pyproject.toml
    if (this.analysisData.hasPyprojectToml) {
      const pyprojectPath = path.join(this.repoPath, 'pyproject.toml');
      this.analysisData.pyprojectContent = fs.readFileSync(pyprojectPath, 'utf8');
    }

    // Dockerfile
    const dockerfiles = this.findFiles('Dockerfile');
    if (dockerfiles.length > 0) {
      this.analysisData.dockerfileContent = fs.readFileSync(dockerfiles[0], 'utf8');
    }

    // CI Workflow
    const ciFiles = this.findFiles('*.yml', '.github/workflows');
    if (ciFiles.length > 0) {
      this.analysisData.ciWorkflowContent = fs.readFileSync(ciFiles[0], 'utf8');
    }
  }

  /**
   * تحليل هيكل الملفات
   */
  analyzeFileStructure() {
    const structure = [];
    const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];
    
    const walkDir = (dir, level = 0) => {
      if (level > 3) return; // حد أقصى 3 مستويات
      
      try {
        const files = fs.readdirSync(dir);
        
        files.forEach(file => {
          if (ignoreDirs.includes(file)) return;
          
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          const relativePath = path.relative(this.repoPath, filePath);
          const indent = '  '.repeat(level);
          
          if (stat.isDirectory()) {
            structure.push(`${indent}📁 ${file}/`);
            walkDir(filePath, level + 1);
          } else {
            const icon = this.getFileIcon(file);
            structure.push(`${indent}${icon} ${file}`);
          }
        });
      } catch (err) {
        // تجاهل الأخطاء
      }
    };
    
    walkDir(this.repoPath);
    this.analysisData.fileStructure = structure;
  }

  /**
   * تحليل معلومات المستودع
   */
  analyzeRepositoryInfo() {
    try {
      // الحصول على اسم المستودع من git remote
      const remoteUrl = execSync('git config --get remote.origin.url', { 
        cwd: this.repoPath,
        encoding: 'utf8' 
      }).trim();
      
      // استخراج owner/repo من URL
      const match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
      if (match) {
        this.analysisData.repositoryInfo = {
          owner: match[1],
          repo: match[2].replace('.git', ''),
          fullName: `${match[1]}/${match[2].replace('.git', '')}`,
        };
      }

      // الحصول على الفرع الحالي
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.repoPath,
        encoding: 'utf8'
      }).trim();
      this.analysisData.repositoryInfo.currentBranch = branch;

      // عدد الملفات
      const fileCount = execSync('find . -type f | wc -l', {
        cwd: this.repoPath,
        encoding: 'utf8'
      }).trim();
      this.analysisData.repositoryInfo.fileCount = parseInt(fileCount);

    } catch (err) {
      console.log('  ⚠️  تعذر الحصول على معلومات Git');
    }
  }

  /**
   * كشف الاختبارات
   */
  detectTests() {
    const testFiles = this.findFiles('*.test.*');
    const specFiles = this.findFiles('*.spec.*');
    this.analysisData.hasTests = (testFiles.length + specFiles.length) > 0;
    
    if (this.analysisData.hasTests) {
      console.log(`  ✓ وُجدت ${testFiles.length + specFiles.length} ملف اختبار`);
    }
  }

  /**
   * كشف CI/CD
   */
  detectCI() {
    const ciFiles = this.findFiles('*.yml', '.github/workflows');
    this.analysisData.hasCI = ciFiles.length > 0;
    
    if (this.analysisData.hasCI) {
      console.log(`  ✓ وُجدت ${ciFiles.length} workflow CI/CD`);
    }
  }

  /**
   * البحث عن ملفات بنمط معين
   */
  findFiles(pattern, baseDir = '') {
    const searchDir = baseDir ? path.join(this.repoPath, baseDir) : this.repoPath;
    const results = [];
    
    const walk = (dir) => {
      try {
        const files = fs.readdirSync(dir);
        
        files.forEach(file => {
          if (['node_modules', '.git', 'dist', 'build'].includes(file)) return;
          
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          
          if (stat.isDirectory()) {
            walk(filePath);
          } else {
            if (this.matchPattern(file, pattern)) {
              results.push(filePath);
            }
          }
        });
      } catch (err) {
        // تجاهل الأخطاء
      }
    };
    
    if (fs.existsSync(searchDir)) {
      walk(searchDir);
    }
    
    return results;
  }

  /**
   * مطابقة النمط
   */
  matchPattern(filename, pattern) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(filename);
    }
    return filename === pattern;
  }

  /**
   * الحصول على أيقونة الملف
   */
  getFileIcon(filename) {
    const ext = path.extname(filename);
    const iconMap = {
      '.js': '📜',
      '.ts': '📘',
      '.tsx': '⚛️',
      '.json': '📋',
      '.md': '📄',
      '.yml': '⚙️',
      '.yaml': '⚙️',
      '.py': '🐍',
      '.go': '🔵',
      '.rs': '🦀',
      '.java': '☕',
      'Dockerfile': '🐳',
      '.env': '🔐',
    };
    
    return iconMap[ext] || iconMap[filename] || '📄';
  }

  /**
   * طباعة ملخص التحليل
   */
  printSummary() {
    console.log('\n' + '═'.repeat(80));
    console.log('📊 ملخص التحليل الأولي');
    console.log('═'.repeat(80));
    
    console.log('\n🏗️ البنية التقنية:');
    console.log(`  package.json: ${this.analysisData.hasPackageJson ? '✓ موجود' : '✗ غير موجود'}`);
    console.log(`  requirements.txt: ${this.analysisData.hasRequirementsTxt ? '✓ موجود' : '✗ غير موجود'}`);
    console.log(`  pyproject.toml: ${this.analysisData.hasPyprojectToml ? '✓ موجود' : '✗ غير موجود'}`);
    console.log(`  Dockerfile: ${this.analysisData.hasDockerfile ? '✓ موجود' : '✗ غير موجود'}`);
    
    console.log('\n🔒 ضمان الجودة:');
    console.log(`  اختبارات آلية: ${this.analysisData.hasTests ? '✓ موجودة' : '✗ غير موجودة'}`);
    console.log(`  CI/CD Pipeline: ${this.analysisData.hasCI ? '✓ موجود' : '✗ غير موجود'}`);
    
    console.log('\n📚 التوثيق:');
    console.log(`  README: ${this.analysisData.hasReadme ? '✓ موجود' : '✗ غير موجود'}`);
    console.log(`  .gitignore: ${this.analysisData.hasGitignore ? '✓ موجود' : '✗ غير موجود'}`);
    
    if (this.analysisData.repositoryInfo.fullName) {
      console.log('\n📦 معلومات المستودع:');
      console.log(`  المستودع: ${this.analysisData.repositoryInfo.fullName}`);
      console.log(`  الفرع: ${this.analysisData.repositoryInfo.currentBranch}`);
    }
    
    console.log('\n' + '═'.repeat(80) + '\n');
  }
}

module.exports = ProductionReadinessAnalyzer;

// تشغيل مباشر
if (require.main === module) {
  const analyzer = new ProductionReadinessAnalyzer();
  analyzer.analyze().then(data => {
    analyzer.printSummary();
    
    // حفظ النتائج
    const outputPath = path.join(process.cwd(), 'analysis-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`💾 تم حفظ بيانات التحليل في: ${outputPath}\n`);
  });
}
