/**
 * Read Many Files Tool
 * 基于 qwen-code 的 read-many-files 功能适配 agent 架构
 * 用于批量读取多个文件内容
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import {
  ToolResult,
  ToolSchema,
  ValidationResult,
} from '../../../../types';
import { ReadOnlyTool } from './base-tool';

interface ReadManyFilesParams {
  files: string[];
  includeLineNumbers?: boolean;
  maxFileSize?: number;
  encoding?: string;
  filterPatterns?: string[];
  excludePatterns?: string[];
}

interface FileContent {
  path: string;
  absolutePath: string;
  content: string;
  lineCount: number;
  fileSize: number;
  lastModified: Date;
  encoding: string;
  error?: string;
}

interface ReadManyFilesResult extends ToolResult {
  success: boolean;
  metadata: {
    totalFiles: number;
    successfulReads: number;
    failedReads: number;
    totalSize: number;
    totalLines: number;
    processingTime: number;
  };
  files: FileContent[];
}

/**
 * 批量文件读取工具
 * 参考 qwen-code 的 read-many-files 实现
 */
export class ReadManyFilesTool extends ReadOnlyTool<ReadManyFilesParams, ReadManyFilesResult> {
  private readonly maxFiles = 50;
  private readonly defaultMaxFileSize = 1024 * 1024; // 1MB
  private readonly allowedExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.html', '.md',
    '.vue', '.svelte', '.astro', '.yaml', '.yml', '.xml', '.txt', '.py',
    '.java', '.c', '.cpp', '.h', '.hpp', '.rs', '.go', '.php', '.rb'
  ]);
  private readonly projectRoot: string;

  constructor(projectRoot?: string) {
    const schema: ToolSchema = {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file paths to read (relative to project root or absolute)',
        },
        includeLineNumbers: {
          type: 'boolean',
          description: 'Include line numbers in the output (default: false)',
        },
        maxFileSize: {
          type: 'number',
          description: 'Maximum file size in bytes (default: 1MB)',
        },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf-8)',
        },
        filterPatterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Glob patterns to include files',
        },
        excludePatterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Glob patterns to exclude files',
        },
      },
      required: ['files'],
      description: 'Read multiple files efficiently for code analysis',
    };

    super({
      name: 'read_many_files',
      displayName: 'Read Many Files',
      description: 'Batch read multiple files for efficient code analysis',
      schema,
      isModifying: false,
    });

    this.projectRoot = projectRoot || process.cwd();
  }

  protected validateSpecific(params: ReadManyFilesParams): ValidationResult {
    // 验证文件数量
    if (!params.files || params.files.length === 0) {
      return {
        valid: false,
        error: 'At least one file path is required',
      };
    }

    if (params.files.length > this.maxFiles) {
      return {
        valid: false,
        error: `Too many files (max: ${this.maxFiles})`,
      };
    }

    // 验证文件大小限制
    const maxFileSize = params.maxFileSize || this.defaultMaxFileSize;
    if (maxFileSize < 1024 || maxFileSize > 10 * 1024 * 1024) {
      return {
        valid: false,
        error: 'maxFileSize must be between 1KB and 10MB',
      };
    }

    // 验证编码
    if (params.encoding && !['utf-8', 'utf8', 'ascii', 'latin1'].includes(params.encoding)) {
      return {
        valid: false,
        error: 'Unsupported encoding. Use utf-8, ascii, or latin1',
      };
    }

    return { valid: true };
  }

  protected async executeImpl(
    params: ReadManyFilesParams,
    signal: AbortSignal
  ): Promise<ReadManyFilesResult> {
    const startTime = Date.now();
    const encoding = params.encoding || 'utf-8';
    const maxFileSize = params.maxFileSize || this.defaultMaxFileSize;
    const includeLineNumbers = params.includeLineNumbers || false;

    const results: FileContent[] = [];
    let successfulReads = 0;
    let failedReads = 0;
    let totalSize = 0;
    let totalLines = 0;

    // 并发读取文件（限制并发数）
    const concurrency = 5;
    const chunks = this.chunkArray(params.files, concurrency);

    for (const chunk of chunks) {
      if (signal.aborted) {
        throw new Error('Operation aborted');
      }

      const promises = chunk.map(filePath => this.readSingleFile(
        filePath,
        encoding,
        maxFileSize,
        includeLineNumbers
      ));

      const chunkResults = await Promise.allSettled(promises);
      
      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const fileContent = result.value;
          if (fileContent.error) {
            failedReads++;
          } else {
            successfulReads++;
            totalSize += fileContent.fileSize;
            totalLines += fileContent.lineCount;
          }
          results.push(fileContent);
        } else {
          failedReads++;
          results.push({
            path: chunk[index],
            absolutePath: this.resolvePath(chunk[index]),
            content: '',
            lineCount: 0,
            fileSize: 0,
            lastModified: new Date(),
            encoding,
            error: result.reason?.message || 'Unknown error',
          });
        }
      });
    }

    const processingTime = Date.now() - startTime;

    // 格式化输出
    const output = this.formatOutput(results, params);

    return {
      output,
      success: failedReads === 0,
      metadata: {
        totalFiles: params.files.length,
        successfulReads,
        failedReads,
        totalSize,
        totalLines,
        processingTime,
      },
      files: results,
    };
  }

  private async readSingleFile(
    filePath: string,
    encoding: string,
    maxFileSize: number,
    includeLineNumbers: boolean
  ): Promise<FileContent> {
    const absolutePath = this.resolvePath(filePath);

    try {
      // 检查路径安全性
      if (!this.isPathSafe(absolutePath)) {
        throw new Error('Path is outside project directory or contains unsafe patterns');
      }

      // 检查文件扩展名
      const ext = path.extname(absolutePath).toLowerCase();
      if (!this.allowedExtensions.has(ext)) {
        throw new Error(`File type ${ext} is not allowed`);
      }

      // 获取文件信息
      const stats = await fs.stat(absolutePath);
      
      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      if (stats.size > maxFileSize) {
        throw new Error(`File size ${stats.size} exceeds limit ${maxFileSize}`);
      }

      // 读取文件内容
      const content = await fs.readFile(absolutePath, encoding as BufferEncoding);
      const lines = content.split('\n');
      
      let processedContent = content;
      if (includeLineNumbers) {
        processedContent = lines
          .map((line, index) => `${(index + 1).toString().padStart(4, ' ')}: ${line}`)
          .join('\n');
      }

      return {
        path: filePath,
        absolutePath,
        content: processedContent,
        lineCount: lines.length,
        fileSize: stats.size,
        lastModified: stats.mtime,
        encoding,
      };

    } catch (error) {
      return {
        path: filePath,
        absolutePath,
        content: '',
        lineCount: 0,
        fileSize: 0,
        lastModified: new Date(),
        encoding,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.projectRoot, filePath);
  }

  private isPathSafe(absolutePath: string): boolean {
    // 确保路径在项目根目录内
    const normalizedPath = path.normalize(absolutePath);
    const normalizedRoot = path.normalize(this.projectRoot);
    
    return normalizedPath.startsWith(normalizedRoot) && 
           !normalizedPath.includes('..') &&
           !normalizedPath.includes('~');
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private formatOutput(results: FileContent[], _params: ReadManyFilesParams): string {
    void _params;
    let output = `# Batch File Reading Results\n\n`;
    
    const successful = results.filter(r => !r.error);
    const failed = results.filter(r => r.error);

    output += `**Summary:**\n`;
    output += `- Total files: ${results.length}\n`;
    output += `- Successfully read: ${successful.length}\n`;
    output += `- Failed to read: ${failed.length}\n`;
    output += `- Total size: ${this.formatFileSize(successful.reduce((sum, f) => sum + f.fileSize, 0))}\n`;
    output += `- Total lines: ${successful.reduce((sum, f) => sum + f.lineCount, 0)}\n\n`;

    // 列出失败的文件
    if (failed.length > 0) {
      output += `## Failed Files\n\n`;
      failed.forEach(file => {
        output += `- **${file.path}**: ${file.error}\n`;
      });
      output += '\n';
    }

    // 显示成功读取的文件内容
    if (successful.length > 0) {
      output += `## File Contents\n\n`;
      
      successful.forEach((file, index) => {
        output += `### ${index + 1}. ${file.path}\n\n`;
        output += `**Path:** ${file.absolutePath}\n`;
        output += `**Size:** ${this.formatFileSize(file.fileSize)}\n`;
        output += `**Lines:** ${file.lineCount}\n`;
        output += `**Modified:** ${file.lastModified.toLocaleDateString()}\n\n`;
        
        // 如果文件内容太长，截断显示
        if (file.content.length > 5000) {
          const truncated = file.content.substring(0, 5000);
          output += `\`\`\`${this.getLanguageFromExtension(file.path)}\n${truncated}\n\n... (content truncated, showing first 5000 characters)\n\`\`\`\n\n`;
        } else {
          output += `\`\`\`${this.getLanguageFromExtension(file.path)}\n${file.content}\n\`\`\`\n\n`;
        }
        
        output += `---\n\n`;
      });
    }

    return output;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  private getLanguageFromExtension(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
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
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml',
      '.py': 'python',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.rs': 'rust',
      '.go': 'go',
      '.php': 'php',
      '.rb': 'ruby',
    };
    return langMap[ext] || 'text';
  }

  async shouldConfirm(params: ReadManyFilesParams): Promise<boolean> {
    // 如果要读取很多文件或大文件，需要确认
    const totalEstimatedSize = params.files.length * (params.maxFileSize || this.defaultMaxFileSize);
    return params.files.length > 20 || totalEstimatedSize > 10 * 1024 * 1024; // 10MB
  }
}

/**
 * 创建 Read Many Files 工具实例
 */
export function createReadManyFilesTool(projectRoot?: string): ReadManyFilesTool {
  return new ReadManyFilesTool(projectRoot);
} 