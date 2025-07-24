/**
 * File Reader Tool
 * 基于 qwen-code 的 ReadFileTool 架构设计
 * 用于安全地读取文件内容进行代码审查
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import {
  ToolResult,
  ToolSchema,
  ValidationResult,
} from '../../../../types';
import { ReadOnlyTool } from './base-tool';

interface FileReaderParams {
  path: string;
  startLine?: number;
  endLine?: number;
  encoding?: string;
}

interface FileReaderResult extends ToolResult {
  metadata: {
    absolutePath: string;
    fileSize: number;
    lineCount: number;
    encoding: string;
    language?: string;
    lastModified: Date;
  };
}

/**
 * 文件读取工具
 * 参考 qwen-code 的安全文件读取机制
 */
export class FileReaderTool extends ReadOnlyTool<FileReaderParams, FileReaderResult> {
  private readonly allowedExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.html', '.md',
    '.vue', '.svelte', '.astro', '.yaml', '.yml', '.xml', '.txt'
  ]);

  private readonly maxFileSize = 5 * 1024 * 1024; // 5MB
  private readonly projectRoot: string;

  constructor(projectRoot?: string) {
    const schema: ToolSchema = {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to project root or absolute path',
        },
        startLine: {
          type: 'number',
          description: 'Start line number (1-indexed, optional)',
        },
        endLine: {
          type: 'number', 
          description: 'End line number (1-indexed, optional)',
        },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf-8)',
        },
      },
      required: ['path'],
      description: 'Read file content for code review analysis',
    };

    super(
      'read_file',
      'Read File',
      'Read and analyze file content for code review',
      schema,
      true
    );

    this.projectRoot = projectRoot || process.cwd();
  }

  protected validateSpecific(params: FileReaderParams): ValidationResult {
    try {
      // 验证路径安全性
      const resolvedPath = this.resolvePath(params.path);
      
      if (!this.isPathSafe(resolvedPath)) {
        return {
          valid: false,
          error: 'Path is outside project directory or contains unsafe patterns',
        };
      }

      // 验证文件扩展名
      const ext = path.extname(resolvedPath).toLowerCase();
      if (!this.allowedExtensions.has(ext)) {
        return {
          valid: false,
          error: `File type '${ext}' is not supported. Allowed: ${Array.from(this.allowedExtensions).join(', ')}`,
        };
      }

      // 验证行号范围
      if (params.startLine !== undefined && params.startLine < 1) {
        return {
          valid: false,
          error: 'startLine must be >= 1',
        };
      }

      if (params.endLine !== undefined && params.endLine < 1) {
        return {
          valid: false,
          error: 'endLine must be >= 1',
        };
      }

      if (params.startLine && params.endLine && params.startLine > params.endLine) {
        return {
          valid: false,
          error: 'startLine must be <= endLine',
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Path validation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  protected async executeImpl(
    params: FileReaderParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void
  ): Promise<FileReaderResult> {
    const resolvedPath = this.resolvePath(params.path);
    const encoding = (params.encoding as BufferEncoding) || 'utf-8';

    this.updateOutputSafely(`Reading file: ${params.path}`, updateOutput);

    try {
      // 检查文件是否存在
      const stats = await fs.stat(resolvedPath);
      
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${params.path}`);
      }

      // 检查文件大小
      if (stats.size > this.maxFileSize) {
        throw new Error(`File too large: ${this.formatFileSize(stats.size)} (max: ${this.formatFileSize(this.maxFileSize)})`);
      }

      this.checkCancellation(signal);

      // 读取文件内容
      const content = await fs.readFile(resolvedPath, encoding);
      const lines = content.split('\n');

      this.checkCancellation(signal);

      // 提取指定行范围
      let selectedContent = content;
      let startLine = 1;
      let endLine = lines.length;

      if (params.startLine !== undefined || params.endLine !== undefined) {
        startLine = params.startLine || 1;
        endLine = params.endLine || lines.length;
        
        // 调整边界
        startLine = Math.max(1, Math.min(startLine, lines.length));
        endLine = Math.max(startLine, Math.min(endLine, lines.length));
        
        selectedContent = lines.slice(startLine - 1, endLine).join('\n');
      }

      const language = this.detectLanguage(resolvedPath);
      
      this.updateOutputSafely(`Successfully read ${endLine - startLine + 1} lines`, updateOutput);

      // 构建输出内容
      const output = this.formatFileContent(
        selectedContent,
        params.path,
        startLine,
        endLine,
        language
      );

      return this.createResult(output, {
        absolutePath: resolvedPath,
        fileSize: stats.size,
        lineCount: lines.length,
        encoding,
        language,
        lastModified: stats.mtime,
      }) as FileReaderResult;

    } catch (error) {
      throw new Error(`Failed to read file '${params.path}': ${this.formatError(error)}`);
    }
  }

  /**
   * 解析文件路径
   * 参考 qwen-code 的路径处理逻辑
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.projectRoot, filePath);
  }

  /**
   * 检查路径安全性
   * 防止路径遍历攻击
   */
  private isPathSafe(resolvedPath: string): boolean {
    // 检查是否在项目目录内
    const relative = path.relative(this.projectRoot, resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return false;
    }

    // 检查危险路径模式
    const dangerousPatterns = [
      /node_modules/,
      /\.git/,
      /\.env/,
      /package-lock\.json/,
      /yarn\.lock/,
    ];

    return !dangerousPatterns.some(pattern => pattern.test(resolvedPath));
  }

  /**
   * 检测编程语言
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.js': 'javascript',
      '.jsx': 'jsx',
      '.json': 'json',
      '.css': 'css',
      '.scss': 'scss',
      '.html': 'html',
      '.md': 'markdown',
      '.vue': 'vue',
      '.svelte': 'svelte',
      '.astro': 'astro',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml',
    };

    return languageMap[ext] || 'text';
  }

  /**
   * 格式化文件内容输出
   */
  private formatFileContent(
    content: string,
    filePath: string,
    startLine: number,
    endLine: number,
    language: string
  ): string {
    const lineRange = startLine === endLine 
      ? `line ${startLine}` 
      : `lines ${startLine}-${endLine}`;

    return `\`\`\`${language}
// File: ${filePath} (${lineRange})
${content}
\`\`\``;
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * 获取工具描述信息
   */
  getDescription(params: FileReaderParams): string {
    let description = `Read file: ${params.path}`;
    
    if (params.startLine || params.endLine) {
      const start = params.startLine || 1;
      const end = params.endLine || '(end)';
      description += ` (lines ${start}-${end})`;
    }

    return description;
  }
}

/**
 * 创建文件读取工具实例
 */
export function createFileReaderTool(projectRoot?: string): FileReaderTool {
  return new FileReaderTool(projectRoot);
} 