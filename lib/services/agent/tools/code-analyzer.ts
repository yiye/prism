/**
 * Code Analyzer Tool
 * 专门用于前端代码审查和质量分析
 * 基于 qwen-code 的工具架构设计
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import {
  ReviewIssue,
  ReviewMetrics,
  ReviewSuggestion,
  ToolResult,
  ToolSchema,
  ValidationResult,
} from '../../../../types';
import { ReadOnlyTool } from './base-tool';

interface CodeAnalyzerParams {
  target: string; // 文件路径或目录
  type: 'file' | 'directory';
  focusAreas?: string[]; // 重点关注的方面
  depth?: number; // 目录扫描深度
  includeTests?: boolean;
}

interface CodeAnalyzerResult extends ToolResult {
  metadata: {
    targetPath: string;
    analyzedFiles: string[];
    issues: ReviewIssue[];
    suggestions: ReviewSuggestion[];
    metrics: ReviewMetrics;
    executionTime: number;
  };
}

/**
 * 代码分析工具
 * 提供全面的前端代码质量分析
 */
export class CodeAnalyzerTool extends ReadOnlyTool<CodeAnalyzerParams, CodeAnalyzerResult> {
  private readonly supportedExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte'
  ]);

  private readonly maxFilesPerAnalysis = 50;
  private readonly maxFileSize = 2 * 1024 * 1024; // 2MB
  private readonly projectRoot: string;

  constructor(projectRoot?: string) {
    const schema: ToolSchema = {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'File path or directory to analyze',
        },
        type: {
          type: 'string',
          description: 'Target type: file or directory',
        },
        focusAreas: {
          type: 'array',
          description: 'Areas to focus on: performance, security, maintainability, style, logic',
        },
        depth: {
          type: 'number',
          description: 'Directory scanning depth (default: 3)',
        },
        includeTests: {
          type: 'boolean',
          description: 'Include test files in analysis (default: false)',
        },
      },
      required: ['target', 'type'],
      description: 'Analyze code quality and provide review feedback',
    };

    super(
    {
      name: 'analyze_code',
      displayName: 'Code Analyzer',
      description: 'Analyze code quality, detect issues, and provide improvement suggestions',
      schema,
      isOutputMarkdown: true,
    });

    this.projectRoot = projectRoot || process.cwd();
  }

  protected validateSpecific(params: CodeAnalyzerParams): ValidationResult {
    if (!['file', 'directory'].includes(params.type)) {
      return {
        valid: false,
        error: 'Type must be either "file" or "directory"',
      };
    }

    if (params.depth !== undefined && (params.depth < 1 || params.depth > 10)) {
      return {
        valid: false,
        error: 'Depth must be between 1 and 10',
      };
    }

    if (params.focusAreas) {
      const validAreas = new Set(['performance', 'security', 'maintainability', 'style', 'logic']);
      const invalidAreas = params.focusAreas.filter(area => !validAreas.has(area));
      if (invalidAreas.length > 0) {
        return {
          valid: false,
          error: `Invalid focus areas: ${invalidAreas.join(', ')}. Valid areas: ${Array.from(validAreas).join(', ')}`,
        };
      }
    }

    return { valid: true };
  }

  protected async executeImpl(
    params: CodeAnalyzerParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void
  ): Promise<CodeAnalyzerResult> {
    const startTime = Date.now();
    const resolvedPath = this.resolvePath(params.target);

    this.updateOutputSafely(`Starting code analysis: ${params.target}`, updateOutput);

    try {
      // 收集要分析的文件
      const filesToAnalyze = await this.collectFiles(resolvedPath, params);
      
      this.checkCancellation(signal);
      this.updateOutputSafely(`Found ${filesToAnalyze.length} files to analyze`, updateOutput);

      if (filesToAnalyze.length === 0) {
        return this.createResult('No supported files found for analysis.', {
          targetPath: resolvedPath,
          analyzedFiles: [],
          issues: [],
          suggestions: [],
          metrics: this.createEmptyMetrics(),
          executionTime: Date.now() - startTime,
        }) as CodeAnalyzerResult;
      }

      // 执行分析
      const issues: ReviewIssue[] = [];
      const suggestions: ReviewSuggestion[] = [];
      let totalLines = 0;
      let complexityScore = 0;

      const progress = this.createProgressUpdater(updateOutput, 'Analyzing: ');

      for (let i = 0; i < filesToAnalyze.length; i++) {
        this.checkCancellation(signal);

        const filePath = filesToAnalyze[i];
        progress(i / filesToAnalyze.length, path.basename(filePath));

        try {
          const analysis = await this.analyzeFile(filePath, params.focusAreas);
          issues.push(...analysis.issues);
          suggestions.push(...analysis.suggestions);
          totalLines += analysis.lineCount;
          complexityScore += analysis.complexity;
        } catch (error) {
          console.warn(`Failed to analyze ${filePath}:`, error);
          issues.push({
            id: `analysis-error-${i}`,
            severity: 'warning',
            category: 'analysis',
            title: 'Analysis Error',
            description: `Failed to analyze file: ${error instanceof Error ? error.message : String(error)}`,
            file: filePath,
          });
        }
      }

      progress(1, 'Complete');

      const metrics: ReviewMetrics = {
        filesAnalyzed: filesToAnalyze.length,
        linesOfCode: totalLines,
        issuesFound: issues.length,
        complexityScore: Math.round(complexityScore / filesToAnalyze.length),
        maintainabilityIndex: this.calculateMaintainabilityIndex(issues, totalLines),
      };

      const output = this.formatAnalysisOutput(issues, suggestions, metrics, filesToAnalyze);

      return this.createResult(output, {
        targetPath: resolvedPath,
        analyzedFiles: filesToAnalyze,
        issues,
        suggestions,
        metrics,
        executionTime: Date.now() - startTime,
      }) as CodeAnalyzerResult;

    } catch (error) {
      throw new Error(`Code analysis failed: ${this.formatError(error)}`);
    }
  }

  /**
   * 收集要分析的文件
   */
  private async collectFiles(targetPath: string, params: CodeAnalyzerParams): Promise<string[]> {
    const files: string[] = [];

    try {
      const stats = await fs.stat(targetPath);

      if (stats.isFile()) {
        if (this.isSupportedFile(targetPath, params.includeTests)) {
          files.push(targetPath);
        }
      } else if (stats.isDirectory()) {
        await this.collectFilesFromDirectory(targetPath, files, params, 0);
      }
    } catch (error) {
      throw new Error(`Cannot access target: ${this.formatError(error)}`);
    }

    return files.slice(0, this.maxFilesPerAnalysis);
  }

  /**
   * 从目录中收集文件
   */
  private async collectFilesFromDirectory(
    dirPath: string,
    files: string[],
    params: CodeAnalyzerParams,
    currentDepth: number
  ): Promise<void> {
    const maxDepth = params.depth || 3;
    if (currentDepth >= maxDepth || files.length >= this.maxFilesPerAnalysis) {
      return;
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // 跳过不需要的目录
        if (entry.isDirectory() && this.shouldSkipDirectory(entry.name)) {
          continue;
        }

        if (entry.isFile() && this.isSupportedFile(fullPath, params.includeTests)) {
          files.push(fullPath);
        } else if (entry.isDirectory()) {
          await this.collectFilesFromDirectory(fullPath, files, params, currentDepth + 1);
        }
      }
    } catch (error) {
      console.warn(`Cannot read directory ${dirPath}:`, error);
    }
  }

  /**
   * 检查是否应该跳过目录
   */
  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = new Set([
      'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
      '.nyc_output', '.vscode', '.idea', 'tmp', 'temp'
    ]);
    return skipDirs.has(dirName) || dirName.startsWith('.');
  }

  /**
   * 检查是否为支持的文件
   */
  private isSupportedFile(filePath: string, includeTests = false): boolean {
    const ext = path.extname(filePath);
    if (!this.supportedExtensions.has(ext)) {
      return false;
    }

    const basename = path.basename(filePath);
    const isTestFile = /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(basename);
    
    return includeTests || !isTestFile;
  }

  /**
   * 分析单个文件
   */
  private async analyzeFile(
    filePath: string,
    focusAreas?: string[]
  ): Promise<{
    issues: ReviewIssue[];
    suggestions: ReviewSuggestion[];
    lineCount: number;
    complexity: number;
  }> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = path.relative(this.projectRoot, filePath);

    const issues: ReviewIssue[] = [];
    const suggestions: ReviewSuggestion[] = [];

    // 基础代码质量检查
    const basicAnalysis = this.performBasicAnalysis(content, lines, relativePath);
    issues.push(...basicAnalysis.issues);
    suggestions.push(...basicAnalysis.suggestions);

    // 根据关注领域进行特定分析
    if (!focusAreas || focusAreas.includes('performance')) {
      const perfAnalysis = this.analyzePerformance(content, lines, relativePath);
      issues.push(...perfAnalysis.issues);
      suggestions.push(...perfAnalysis.suggestions);
    }

    if (!focusAreas || focusAreas.includes('security')) {
      const secAnalysis = this.analyzeSecurity(content, lines, relativePath);
      issues.push(...secAnalysis.issues);
      suggestions.push(...secAnalysis.suggestions);
    }

    if (!focusAreas || focusAreas.includes('maintainability')) {
      const maintAnalysis = this.analyzeMaintainability(content, lines, relativePath);
      issues.push(...maintAnalysis.issues);
      suggestions.push(...maintAnalysis.suggestions);
    }

    if (!focusAreas || focusAreas.includes('style')) {
      const styleAnalysis = this.analyzeStyle(content, lines, relativePath);
      issues.push(...styleAnalysis.issues);
      suggestions.push(...styleAnalysis.suggestions);
    }

    const complexity = this.calculateComplexity(content);

    return {
      issues,
      suggestions,
      lineCount: lines.length,
      complexity,
    };
  }

  /**
   * 基础代码分析
   */
  private performBasicAnalysis(content: string, lines: string[], filePath: string) {
    const issues: ReviewIssue[] = [];
    const suggestions: ReviewSuggestion[] = [];

    // 检查文件大小
    if (content.length > this.maxFileSize) {
      issues.push({
        id: `large-file-${filePath}`,
        severity: 'warning',
        category: 'maintainability',
        title: 'Large File',
        description: `File is too large (${content.length} bytes). Consider splitting into smaller modules.`,
        file: filePath,
      });
    }

    // 检查长函数
    const longFunctionMatches = content.match(/function\s+\w+[^}]*{[^}]*(?:{[^}]*}[^}]*)*}/g);
    if (longFunctionMatches) {
      longFunctionMatches.forEach((func, index) => {
        const funcLines = func.split('\n').length;
        if (funcLines > 50) {
          issues.push({
            id: `long-function-${filePath}-${index}`,
            severity: 'warning',
            category: 'maintainability',
            title: 'Long Function',
            description: `Function has ${funcLines} lines. Consider breaking it down into smaller functions.`,
            file: filePath,
          });
        }
      });
    }

    // 检查TODO和FIXME
    lines.forEach((line, index) => {
      if (/\/\/\s*(TODO|FIXME|HACK)/i.test(line)) {
        issues.push({
          id: `todo-${filePath}-${index}`,
          severity: 'info',
          category: 'maintainability',
          title: 'TODO/FIXME Found',
          description: line.trim(),
          file: filePath,
          line: index + 1,
        });
      }
    });

    return { issues, suggestions };
  }

  /**
   * 性能分析
   */
  private analyzePerformance(content: string, lines: string[], filePath: string) {
    const issues: ReviewIssue[] = [];
    const suggestions: ReviewSuggestion[] = [];

    // 检查潜在的性能问题
    if (content.includes('console.log') || content.includes('console.warn')) {
      issues.push({
        id: `console-logs-${filePath}`,
        severity: 'warning',
        category: 'performance',
        title: 'Console Statements',
        description: 'Console statements found. Remove them in production code.',
        file: filePath,
      });
    }

    // React相关性能检查
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      // 检查内联对象/函数
      const inlineObjectRegex = /\s+\w+={{[^}]+}}/g;
      const inlineObjectMatches = content.match(inlineObjectRegex);
      if (inlineObjectMatches && inlineObjectMatches.length > 3) {
        suggestions.push({
          id: `inline-objects-${filePath}`,
          type: 'optimize',
          title: 'Avoid Inline Objects',
          description: 'Multiple inline objects found in JSX. Consider moving them outside render or using useMemo.',
          file: filePath,
          benefits: ['Prevents unnecessary re-renders', 'Improves performance'],
        });
      }

      // 检查是否缺少React.memo或useMemo
      if (!content.includes('React.memo') && !content.includes('useMemo') && content.includes('export default')) {
        suggestions.push({
          id: `missing-memo-${filePath}`,
          type: 'optimize',
          title: 'Consider Memoization',
          description: 'Component might benefit from React.memo or useMemo for performance optimization.',
          file: filePath,
          benefits: ['Prevents unnecessary re-renders', 'Optimizes performance'],
        });
      }
    }

    return { issues, suggestions };
  }

  /**
   * 安全分析
   */
  private analyzeSecurity(content: string, lines: string[], filePath: string) {
    const issues: ReviewIssue[] = [];
    const suggestions: ReviewSuggestion[] = [];

    // 检查危险的innerHTML使用
    if (content.includes('dangerouslySetInnerHTML') || content.includes('innerHTML')) {
      issues.push({
        id: `dangerous-html-${filePath}`,
        severity: 'error',
        category: 'security',
        title: 'Dangerous HTML Usage',
        description: 'Usage of dangerouslySetInnerHTML or innerHTML detected. Ensure content is sanitized.',
        file: filePath,
      });
    }

    // 检查硬编码的敏感信息
    const sensitivePatterns = [
      /password\s*=\s*["'][^"']*["']/i,
      /api[_-]?key\s*=\s*["'][^"']*["']/i,
      /secret\s*=\s*["'][^"']*["']/i,
      /token\s*=\s*["'][^"']*["']/i,
    ];

    lines.forEach((line, index) => {
      sensitivePatterns.forEach((pattern) => {
        if (pattern.test(line)) {
          issues.push({
            id: `hardcoded-secret-${filePath}-${index}`,
            severity: 'critical',
            category: 'security',
            title: 'Hardcoded Sensitive Information',
            description: 'Potential hardcoded sensitive information found. Use environment variables instead.',
            file: filePath,
            line: index + 1,
          });
        }
      });
    });

    return { issues, suggestions };
  }

  /**
   * 可维护性分析
   */
  private analyzeMaintainability(content: string, lines: string[], filePath: string) {
    const issues: ReviewIssue[] = [];
    const suggestions: ReviewSuggestion[] = [];

    // 检查重复代码
    const codeBlocks = content.match(/{[^{}]*}/g) || [];
    const duplicateBlocks = this.findDuplicates(codeBlocks);
    if (duplicateBlocks.length > 0) {
      suggestions.push({
        id: `duplicate-code-${filePath}`,
        type: 'refactor',
        title: 'Duplicate Code Detected',
        description: `Found ${duplicateBlocks.length} potential duplicate code blocks. Consider extracting common logic.`,
        file: filePath,
        benefits: ['Reduces code duplication', 'Improves maintainability'],
      });
    }

    // 检查复杂的条件语句
    const complexConditions = content.match(/if\s*\([^)]*\&\&[^)]*\&\&[^)]*\)/g);
    if (complexConditions && complexConditions.length > 0) {
      suggestions.push({
        id: `complex-conditions-${filePath}`,
        type: 'refactor',
        title: 'Complex Conditional Logic',
        description: 'Complex conditional statements found. Consider using early returns or extracting to functions.',
        file: filePath,
        benefits: ['Improves readability', 'Easier to test'],
      });
    }

    return { issues, suggestions };
  }

  /**
   * 代码风格分析
   */
  private analyzeStyle(content: string, lines: string[], filePath: string) {
    const issues: ReviewIssue[] = [];
    const suggestions: ReviewSuggestion[] = [];

    // 检查命名约定
    const varDeclarations = content.match(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
    if (varDeclarations) {
      varDeclarations.forEach((declaration) => {
        const varName = declaration.split(/\s+/)[1];
        if (!/^[a-z][a-zA-Z0-9]*$/.test(varName) && !/^[A-Z][A-Z0-9_]*$/.test(varName)) {
          issues.push({
            id: `naming-convention-${filePath}-${varName}`,
            severity: 'info',
            category: 'style',
            title: 'Naming Convention',
            description: `Variable '${varName}' doesn't follow camelCase or CONST_CASE convention.`,
            file: filePath,
          });
        }
      });
    }

    // 检查行长度
    lines.forEach((line, index) => {
      if (line.length > 120) {
        issues.push({
          id: `long-line-${filePath}-${index}`,
          severity: 'info',
          category: 'style',
          title: 'Long Line',
          description: `Line ${index + 1} is ${line.length} characters long. Consider breaking it down.`,
          file: filePath,
          line: index + 1,
        });
      }
    });

    return { issues, suggestions };
  }

  /**
   * 计算代码复杂度
   */
  private calculateComplexity(content: string): number {
    let complexity = 1; // 基础复杂度

    // 计算圈复杂度
    const complexityPatterns = [
      /if\s*\(/g,
      /else\s+if\s*\(/g,
      /while\s*\(/g,
      /for\s*\(/g,
      /switch\s*\(/g,
      /case\s+/g,
      /catch\s*\(/g,
      /\&\&/g,
      /\|\|/g,
      /\?/g,
    ];

    complexityPatterns.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    });

    return Math.min(complexity, 100); // 限制最大值
  }

  /**
   * 查找重复代码块
   */
  private findDuplicates(blocks: string[]): string[] {
    const seen = new Map<string, number>();
    const duplicates: string[] = [];

    blocks.forEach((block) => {
      const normalized = block.replace(/\s+/g, ' ').trim();
      if (normalized.length > 20) { // 只检查较长的代码块
        const count = seen.get(normalized) || 0;
        seen.set(normalized, count + 1);
        if (count === 1) {
          duplicates.push(normalized);
        }
      }
    });

    return duplicates;
  }

  /**
   * 计算可维护性指数
   */
  private calculateMaintainabilityIndex(issues: ReviewIssue[], linesOfCode: number): number {
    const errorWeight = 10;
    const warningWeight = 5;
    const infoWeight = 1;

    const errorCount = issues.filter(i => i.severity === 'error' || i.severity === 'critical').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;

    const penaltyScore = errorCount * errorWeight + warningCount * warningWeight + infoCount * infoWeight;
    const baseScore = 100;
    const normalizedPenalty = (penaltyScore / Math.max(linesOfCode / 100, 1));

    return Math.max(0, Math.round(baseScore - normalizedPenalty));
  }

  /**
   * 创建空的指标对象
   */
  private createEmptyMetrics(): ReviewMetrics {
    return {
      filesAnalyzed: 0,
      linesOfCode: 0,
      issuesFound: 0,
      complexityScore: 0,
      maintainabilityIndex: 100,
    };
  }

  /**
   * 格式化分析输出
   */
  private formatAnalysisOutput(
    issues: ReviewIssue[],
    suggestions: ReviewSuggestion[],
    metrics: ReviewMetrics,
    _filePaths: string[]
  ): string {
    void _filePaths;
    const sections: string[] = [];

    // 概览
    sections.push('# Code Analysis Report');
    sections.push('');
    sections.push('## Overview');
    sections.push(`- **Files Analyzed**: ${metrics.filesAnalyzed}`);
    sections.push(`- **Lines of Code**: ${metrics.linesOfCode.toLocaleString()}`);
    sections.push(`- **Issues Found**: ${metrics.issuesFound}`);
    sections.push(`- **Complexity Score**: ${metrics.complexityScore}/100`);
    sections.push(`- **Maintainability Index**: ${metrics.maintainabilityIndex}/100`);
    sections.push('');

    // 问题汇总
    if (issues.length > 0) {
      sections.push('## Issues Summary');
      const issueBySeverity = this.groupBy(issues, 'severity');
      
      Object.entries(issueBySeverity).forEach(([severity, severityIssues]) => {
        sections.push(`### ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${severityIssues.length})`);
        severityIssues.slice(0, 10).forEach((issue) => {
          sections.push(`- **${issue.title}** in \`${issue.file}\`${issue.line ? ` (line ${issue.line})` : ''}`);
          sections.push(`  ${issue.description}`);
        });
        
        if (severityIssues.length > 10) {
          sections.push(`  ... and ${severityIssues.length - 10} more`);
        }
        sections.push('');
      });
    }

    // 改进建议
    if (suggestions.length > 0) {
      sections.push('## Improvement Suggestions');
      suggestions.slice(0, 5).forEach((suggestion) => {
        sections.push(`### ${suggestion.title}`);
        sections.push(`**File**: \`${suggestion.file}\``);
        sections.push(`**Type**: ${suggestion.type}`);
        sections.push(`**Description**: ${suggestion.description}`);
        if (suggestion.benefits && suggestion.benefits.length > 0) {
          sections.push(`**Benefits**: ${suggestion.benefits.join(', ')}`);
        }
        sections.push('');
      });
    }

    return sections.join('\n');
  }

  /**
   * 按字段分组
   */
  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const group = String(item[key]);
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  /**
   * 解析路径
   */
  private resolvePath(target: string): string {
    if (path.isAbsolute(target)) {
      return target;
    }
    return path.resolve(this.projectRoot, target);
  }

  /**
   * 获取工具描述
   */
  getDescription(params: CodeAnalyzerParams): string {
    const focusText = params.focusAreas ? ` (focus: ${params.focusAreas.join(', ')})` : '';
    return `Analyze ${params.type}: ${params.target}${focusText}`;
  }
}

/**
 * 创建代码分析工具实例
 */
export function createCodeAnalyzerTool(projectRoot?: string): CodeAnalyzerTool {
  return new CodeAnalyzerTool(projectRoot);
} 