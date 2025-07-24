/**
 * File Edit Tool
 * 基于 qwen-code 的 edit 功能适配 agent 架构
 * 用于智能文件编辑和修改
 */

import * as diff from 'diff';
import * as fs from 'fs/promises';
import * as path from 'path';

import {
  ToolResult,
  ToolSchema,
  ValidationResult,
} from '../../../../types';
import { ModifyingTool } from './base-tool';

interface FileEditParams {
  path: string;
  operation: 'replace' | 'insert' | 'append' | 'prepend' | 'delete' | 'patch';
  content?: string;
  startLine?: number;
  endLine?: number;
  searchPattern?: string;
  replacePattern?: string;
  insertPosition?: number;
  createBackup?: boolean;
  dryRun?: boolean;
}

interface EditResult extends ToolResult {
  success: boolean;
  llmContent?: string;
  returnDisplay?: string;
  error?: string;
  metadata: {
    operation: string;
    originalSize: number;
    newSize: number;
    linesChanged: number;
    filePath: string;
    backupPath?: string;
    diffStats: {
      additions: number;
      deletions: number;
      changes: number;
    };
  };
  diff?: string;
  originalContent?: string;
  newContent?: string;
}

/**
 * 文件编辑工具
 * 参考 qwen-code 的 edit 实现
 */
export class FileEditTool extends ModifyingTool<FileEditParams, EditResult> {
  private readonly maxFileSize = 5 * 1024 * 1024; // 5MB
  private readonly allowedExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', '.html', '.md',
    '.vue', '.svelte', '.astro', '.yaml', '.yml', '.xml', '.txt', '.py',
    '.java', '.c', '.cpp', '.h', '.hpp', '.rs', '.go', '.php', '.rb',
    '.sh', '.bat', '.ps1', '.sql', '.toml', '.ini', '.conf'
  ]);
  private readonly projectRoot: string;

  constructor(projectRoot?: string) {
    const schema: ToolSchema = {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to edit (relative to project root or absolute)',
        },
        operation: {
          type: 'string',
          enum: ['replace', 'insert', 'append', 'prepend', 'delete', 'patch'],
          description: 'Type of edit operation to perform',
        },
        content: {
          type: 'string',
          description: 'Content to insert/replace (required for replace, insert, append, prepend)',
        },
        startLine: {
          type: 'number',
          description: 'Start line number for range operations (1-indexed)',
        },
        endLine: {
          type: 'number',
          description: 'End line number for range operations (1-indexed)',
        },
        searchPattern: {
          type: 'string',
          description: 'Pattern to search for (regex supported)',
        },
        replacePattern: {
          type: 'string',
          description: 'Replacement pattern for search-replace operations',
        },
        insertPosition: {
          type: 'number',
          description: 'Line position for insert operation (1-indexed)',
        },
        createBackup: {
          type: 'boolean',
          description: 'Create backup before editing (default: true)',
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview changes without applying them (default: false)',
        },
      },
      required: ['path', 'operation'],
      description: 'Edit files with various operations: replace, insert, append, prepend, delete, patch',
    };

    super({
      name: 'file_edit',
      displayName: 'File Edit',
      description: 'Intelligent file editing with backup and diff support',
      schema,
      isOutputMarkdown: true,
    });

    this.projectRoot = projectRoot || process.cwd();
  }

  protected validateSpecific(params: FileEditParams): ValidationResult {
    const { operation, content, startLine, endLine, searchPattern, insertPosition } = params;

    // 验证操作类型特定的参数
    switch (operation) {
      case 'replace':
        if ((!startLine && !searchPattern) || !content) {
          return {
            valid: false,
            error: 'Replace operation requires content and either startLine/endLine or searchPattern',
          };
        }
        if (startLine && endLine && startLine > endLine) {
          return {
            valid: false,
            error: 'startLine must be less than or equal to endLine',
          };
        }
        break;

      case 'insert':
        if (!content || !insertPosition) {
          return {
            valid: false,
            error: 'Insert operation requires content and insertPosition',
          };
        }
        if (insertPosition < 1) {
          return {
            valid: false,
            error: 'insertPosition must be greater than 0',
          };
        }
        break;

      case 'append':
      case 'prepend':
        if (!content) {
          return {
            valid: false,
            error: `${operation} operation requires content`,
          };
        }
        break;

      case 'delete':
        if (!startLine && !searchPattern) {
          return {
            valid: false,
            error: 'Delete operation requires either startLine/endLine or searchPattern',
          };
        }
        break;

      case 'patch':
        if (!content) {
          return {
            valid: false,
            error: 'Patch operation requires content (unified diff format)',
          };
        }
        break;
    }

    // 验证行号
    if (startLine && startLine < 1) {
      return {
        valid: false,
        error: 'startLine must be greater than 0',
      };
    }

    if (endLine && endLine < 1) {
      return {
        valid: false,
        error: 'endLine must be greater than 0',
      };
    }

    return { valid: true };
  }

  protected async executeImpl(
    params: FileEditParams,
    _signal: AbortSignal
  ): Promise<EditResult> {
    void _signal;
    const absolutePath = this.resolvePath(params.path);

    // 安全性检查
    if (!this.isPathSafe(absolutePath)) {
      throw new Error('Path is outside project directory or contains unsafe patterns');
    }

    // 检查文件扩展名
    const ext = path.extname(absolutePath).toLowerCase();
    if (!this.allowedExtensions.has(ext)) {
      throw new Error(`File type ${ext} is not allowed for editing`);
    }

    // 读取原始文件内容
    let originalContent = '';
    try {
      const stats = await fs.stat(absolutePath);
      if (stats.size > this.maxFileSize) {
        throw new Error(`File size ${stats.size} exceeds limit ${this.maxFileSize}`);
      }
      originalContent = await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // 文件不存在，创建新文件
        if (params.operation !== 'append' && params.operation !== 'prepend') {
          throw new Error('File does not exist. Use append or prepend to create new files.');
        }
      } else {
        throw error;
      }
    }

    // 执行编辑操作
    const newContent = await this.performEdit(originalContent, params);

    // 计算差异
    const diffResult = this.calculateDiff(originalContent, newContent);
    
    // 创建备份（如果需要且不是 dry run）
    let backupPath: string | undefined;
    if (!params.dryRun && params.createBackup !== false && originalContent) {
      backupPath = await this.createBackup(absolutePath, originalContent);
    }

    // 如果不是 dry run，写入文件
    if (!params.dryRun) {
      await fs.writeFile(absolutePath, newContent, 'utf-8');
    }

    // 格式化输出
    const output = this.formatEditOutput(params, originalContent, newContent, diffResult, backupPath);

    return {
      output,
      success: true,
      metadata: {
        operation: params.operation,
        originalSize: originalContent.length,
        newSize: newContent.length,
        linesChanged: Math.abs(newContent.split('\n').length - originalContent.split('\n').length),
        filePath: absolutePath,
        backupPath,
        diffStats: {
          additions: diffResult.additions,
          deletions: diffResult.deletions,
          changes: diffResult.changes,
        },
      },
      diff: diffResult.unifiedDiff,
      originalContent: params.dryRun ? originalContent : undefined,
      newContent: params.dryRun ? newContent : undefined,
    };
  }

  private async performEdit(originalContent: string, params: FileEditParams): Promise<string> {
    const lines = originalContent.split('\n');

    switch (params.operation) {
      case 'replace':
        return this.performReplace(originalContent, lines, params);
      
      case 'insert':
        return this.performInsert(lines, params);
      
      case 'append':
        return originalContent + (originalContent && !originalContent.endsWith('\n') ? '\n' : '') + params.content!;
      
      case 'prepend':
        return params.content! + (params.content!.endsWith('\n') ? '' : '\n') + originalContent;
      
      case 'delete':
        return this.performDelete(lines, params);
      
      case 'patch':
        return this.performPatch(originalContent, params);
      
      default:
        throw new Error(`Unknown operation: ${params.operation}`);
    }
  }

  private performReplace(originalContent: string, lines: string[], params: FileEditParams): string {
    if (params.searchPattern) {
      // 基于模式的替换
      const regex = new RegExp(params.searchPattern, 'g');
      return originalContent.replace(regex, params.replacePattern || params.content!);
    } else {
      // 基于行号的替换
      const startIdx = (params.startLine! - 1);
      const endIdx = params.endLine ? (params.endLine - 1) : startIdx;
      
      const newLines = [...lines];
      newLines.splice(startIdx, endIdx - startIdx + 1, ...params.content!.split('\n'));
      
      return newLines.join('\n');
    }
  }

  private performInsert(lines: string[], params: FileEditParams): string {
    const insertIdx = params.insertPosition! - 1;
    const newLines = [...lines];
    newLines.splice(insertIdx, 0, ...params.content!.split('\n'));
    return newLines.join('\n');
  }

  private performDelete(lines: string[], params: FileEditParams): string {
    if (params.searchPattern) {
      // 删除匹配模式的行
      const regex = new RegExp(params.searchPattern);
      return lines.filter(line => !regex.test(line)).join('\n');
    } else {
      // 删除指定行范围
      const startIdx = params.startLine! - 1;
      const endIdx = params.endLine ? (params.endLine - 1) : startIdx;
      
      const newLines = [...lines];
      newLines.splice(startIdx, endIdx - startIdx + 1);
      
      return newLines.join('\n');
    }
  }

  private performPatch(originalContent: string, params: FileEditParams): string {
    try {
      // 应用统一差异格式的补丁
      const patches = diff.parsePatch(params.content!);
      if (patches.length === 0) {
        throw new Error('Invalid patch format');
      }

      let result = originalContent;
      for (const patch of patches) {
        result = diff.applyPatch(result, patch) as string;
        if (typeof result === 'boolean' && result === false) {
          throw new Error('Failed to apply patch');
        }
      }

      return result;
    } catch (error) {
      throw new Error(`Patch application failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private calculateDiff(originalContent: string, newContent: string) {
    const changes = diff.diffLines(originalContent, newContent);
    
    let additions = 0;
    let deletions = 0;
    let modifications = 0;

    changes.forEach(change => {
      if (change.added) {
        additions += change.count || 0;
      } else if (change.removed) {
        deletions += change.count || 0;
      } else if (change.added && change.removed) {
        modifications += change.count || 0;
      }
    });

    const unifiedDiff = diff.createPatch('file', originalContent, newContent, 'original', 'modified');

    return {
      additions,
      deletions,
      changes: modifications,
      unifiedDiff,
    };
  }

  private async createBackup(filePath: string, content: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup.${timestamp}`;
    
    await fs.writeFile(backupPath, content, 'utf-8');
    return backupPath;
  }

  private formatEditOutput(
    params: FileEditParams,
    originalContent: string,
    newContent: string,
    diffResult: {
      additions: number;
      deletions: number;
      changes: number;
      unifiedDiff: string;
    },
    backupPath?: string
  ): string {
    let output = `# File Edit Result\n\n`;
    
    if (params.dryRun) {
      output += `**🔍 DRY RUN MODE - No changes were applied**\n\n`;
    }

    output += `**Operation:** ${params.operation}\n`;
    output += `**File:** ${params.path}\n`;
    output += `**Original Size:** ${originalContent.length} characters\n`;
    output += `**New Size:** ${newContent.length} characters\n`;
    output += `**Lines Changed:** ${Math.abs(newContent.split('\n').length - originalContent.split('\n').length)}\n`;
    
    if (backupPath) {
      output += `**Backup Created:** ${backupPath}\n`;
    }
    
    output += '\n';

    // 显示统计信息
    output += `## Change Statistics\n\n`;
    output += `- **Lines Added:** ${diffResult.additions}\n`;
    output += `- **Lines Deleted:** ${diffResult.deletions}\n`;
    output += `- **Lines Modified:** ${diffResult.changes}\n\n`;

    // 显示差异
    if (diffResult.unifiedDiff && originalContent !== newContent) {
      output += `## Unified Diff\n\n`;
      output += '```diff\n' + diffResult.unifiedDiff + '\n```\n\n';
    }

    // 如果是预览模式，显示新内容的预览
    if (params.dryRun) {
      output += `## Preview of Changes\n\n`;
      if (newContent.length > 2000) {
        output += '```\n' + newContent.substring(0, 2000) + '\n\n... (content truncated)\n```\n';
      } else {
        output += '```\n' + newContent + '\n```\n';
      }
    }

    return output;
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.projectRoot, filePath);
  }

  private isPathSafe(absolutePath: string): boolean {
    const normalizedPath = path.normalize(absolutePath);
    const normalizedRoot = path.normalize(this.projectRoot);
    
    return normalizedPath.startsWith(normalizedRoot) && 
           !normalizedPath.includes('..') &&
           !normalizedPath.includes('~');
  }

  async shouldConfirm(params: FileEditParams): Promise<boolean> {
    // 需要确认的操作类型
    const dangerousOperations = ['delete', 'replace', 'patch'];
    return dangerousOperations.includes(params.operation) && !params.dryRun;
  }
}

/**
 * 创建 File Edit 工具实例
 */
export function createFileEditTool(projectRoot?: string): FileEditTool {
  return new FileEditTool(projectRoot);
} 