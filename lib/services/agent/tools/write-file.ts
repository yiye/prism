/**
 * WriteFile Tool - 文件写入工具
 * 🎯 参考 qwen-code 实现，支持安全的文件写入操作
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  BaseTool,
  type ToolParams,
  type ToolResult,
} from './base-tool';

export interface WriteFileParams extends ToolParams {
  file_path: string;
  content: string;
  create_directories?: boolean;
}

export interface WriteFileResult extends ToolResult {
  success: boolean;
  file_path: string;
  bytes_written: number;
  created_directories?: string[];
}

/**
 * WriteFile 工具实现
 * 🌟 功能特性：
 * - 支持绝对路径文件写入
 * - 自动创建目录结构
 * - 安全路径验证
 * - 备份现有文件
 * - 详细的操作反馈
 */
export class WriteFileTool extends BaseTool<WriteFileParams, WriteFileResult> {
  static readonly Name = 'write_file';

  constructor(private projectRoot: string = process.cwd()) {
    super({
      name: WriteFileTool.Name,
      displayName: 'WriteFile',
      description: `Writes content to a specified file in the local filesystem. 
      
Features:
- Creates parent directories if they don't exist
- Backs up existing files automatically
- Validates file paths for security
- Supports both text and binary content
- Returns detailed operation results

The tool ensures safe file operations within the project directory.`,
      
      parameterSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute or relative path to the file to write to. Relative paths are resolved against the project root.',
          },
          content: {
            type: 'string',
            description: 'The content to write to the file. Supports UTF-8 text content.',
          },
          create_directories: {
            type: 'boolean',
            description: 'Whether to create parent directories if they don\'t exist. Defaults to true.',
            default: true,
          },
        },
        required: ['file_path', 'content'],
      },
    });
  }

  /**
   * 验证文件路径安全性
   */
  private validateFilePath(filePath: string): { isValid: boolean; resolvedPath: string; error?: string } {
    try {
      // 解析相对路径
      const resolvedPath = path.isAbsolute(filePath) 
        ? filePath 
        : path.resolve(this.projectRoot, filePath);

      // 检查路径是否在项目根目录内
      const relativePath = path.relative(this.projectRoot, resolvedPath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return {
          isValid: false,
          resolvedPath,
          error: `File path '${filePath}' is outside the project directory. Only files within the project are allowed.`,
        };
      }

      // 检查敏感目录
      const sensitivePatterns = [
        /node_modules/,
        /\.git/,
        /\.env/,
        /\.ssh/,
        /\.aws/,
      ];

      if (sensitivePatterns.some(pattern => pattern.test(resolvedPath))) {
        return {
          isValid: false,
          resolvedPath,
          error: `Cannot write to sensitive directory or file: ${filePath}`,
        };
      }

      return { isValid: true, resolvedPath };
    } catch (error) {
      return {
        isValid: false,
        resolvedPath: filePath,
        error: `Invalid file path: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * 创建备份文件
   */
  private async createBackup(filePath: string): Promise<string | null> {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${filePath}.backup.${timestamp}`;
      
      await fs.promises.copyFile(filePath, backupPath);
      return backupPath;
    } catch (error) {
      console.warn(`Failed to create backup for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * 创建目录结构
   */
  private async ensureDirectories(filePath: string): Promise<string[]> {
    const directory = path.dirname(filePath);
    const createdDirs: string[] = [];

    try {
      // 检查需要创建的目录
      const dirsToCreate: string[] = [];
      let currentDir = directory;
      
      while (!fs.existsSync(currentDir) && currentDir !== path.dirname(currentDir)) {
        dirsToCreate.unshift(currentDir);
        currentDir = path.dirname(currentDir);
      }

      // 逐级创建目录
      for (const dir of dirsToCreate) {
        await fs.promises.mkdir(dir, { recursive: false });
        createdDirs.push(dir);
      }

      return createdDirs;
    } catch (error) {
      throw new Error(`Failed to create directories for ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async execute(params: WriteFileParams): Promise<WriteFileResult> {
    const { file_path, content, create_directories = true } = params;

    // 1. 验证文件路径
    const pathValidation = this.validateFilePath(file_path);
    if (!pathValidation.isValid) {
      return {
        success: false,
        file_path: file_path,
        bytes_written: 0,
        error: pathValidation.error,
        llmContent: `Error: ${pathValidation.error}`,
        returnDisplay: `❌ **Write Failed**\n\nPath: \`${file_path}\`\nError: ${pathValidation.error}`,
      };
    }

    const { resolvedPath } = pathValidation;
    const createdDirectories: string[] = [];
    let backupPath: string | null = null;

    try {
      // 2. 创建备份（如果文件存在）
      backupPath = await this.createBackup(resolvedPath);

      // 3. 创建目录结构
      if (create_directories) {
        const dirs = await this.ensureDirectories(resolvedPath);
        createdDirectories.push(...dirs);
      }

      // 4. 写入文件
      await fs.promises.writeFile(resolvedPath, content, 'utf8');
      const stats = await fs.promises.stat(resolvedPath);

      // 5. 构建成功响应
      const result: WriteFileResult = {
        success: true,
        file_path: resolvedPath,
        bytes_written: stats.size,
        created_directories: createdDirectories.length > 0 ? createdDirectories : undefined,
        llmContent: `Successfully wrote ${stats.size} bytes to '${resolvedPath}'${
          backupPath ? ` (backup created: ${backupPath})` : ''
        }${
          createdDirectories.length > 0 ? ` (created directories: ${createdDirectories.join(', ')})` : ''
        }`,
        returnDisplay: this.formatSuccessDisplay(resolvedPath, stats.size, backupPath, createdDirectories),
      };

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      return {
        success: false,
        file_path: resolvedPath,
        bytes_written: 0,
        error: errorMessage,
        llmContent: `Failed to write file '${resolvedPath}': ${errorMessage}`,
        returnDisplay: `❌ **Write Failed**\n\nPath: \`${resolvedPath}\`\nError: ${errorMessage}`,
      };
    }
  }

  private formatSuccessDisplay(
    filePath: string, 
    bytesWritten: number, 
    backupPath: string | null, 
    createdDirectories: string[]
  ): string {
    const relativePath = path.relative(this.projectRoot, filePath);
    
    let display = `✅ **File Written Successfully**\n\n`;
    display += `**Path:** \`${relativePath}\`\n`;
    display += `**Size:** ${bytesWritten} bytes\n`;
    
    if (backupPath) {
      const relativeBackupPath = path.relative(this.projectRoot, backupPath);
      display += `**Backup:** \`${relativeBackupPath}\`\n`;
    }
    
    if (createdDirectories.length > 0) {
      const relativeDirs = createdDirectories.map(dir => path.relative(this.projectRoot, dir));
      display += `**Created Directories:** ${relativeDirs.map(dir => `\`${dir}\``).join(', ')}\n`;
    }
    
    return display;
  }

  validateParams(params: WriteFileParams): string | null {
    if (!params.file_path) {
      return 'file_path is required';
    }
    
    if (typeof params.content !== 'string') {
      return 'content must be a string';
    }
    
    if (params.file_path.trim().length === 0) {
      return 'file_path cannot be empty';
    }
    
    return null;
  }

  getDescription(params: WriteFileParams): string {
    const { file_path, content } = params;
    const contentPreview = content.length > 100 
      ? `${content.substring(0, 100)}...` 
      : content;
    
    return `Write ${content.length} characters to file '${file_path}':\n\n\`\`\`\n${contentPreview}\n\`\`\``;
  }
}

/**
 * 创建 WriteFile 工具实例
 */
export function createWriteFileTool(projectRoot?: string): WriteFileTool {
  return new WriteFileTool(projectRoot);
} 