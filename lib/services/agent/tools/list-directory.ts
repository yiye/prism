/**
 * ListDirectory Tool - 目录列表工具
 * 🎯 参考 qwen-code 的 LSTool 实现，支持 gitignore 和智能过滤
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  BaseTool,
  type ToolParams,
  type ToolResult,
} from './base-tool';

export interface ListDirectoryParams extends ToolParams {
  path: string;
  ignore?: string[];
  respect_git_ignore?: boolean;
  show_hidden?: boolean;
  max_items?: number;
}

export interface DirectoryItem {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size?: number;
  modified?: string;
  permissions?: string;
}

export interface ListDirectoryResult extends ToolResult {
  success: boolean;
  path: string;
  items: DirectoryItem[];
  total_count: number;
  has_more?: boolean;
}

/**
 * ListDirectory 工具实现
 * 🌟 功能特性：
 * - 支持 gitignore 规则过滤
 * - 自定义忽略模式
 * - 智能文件类型识别
 * - 详细的文件信息
 * - 性能优化的大目录处理
 */
export class ListDirectoryTool extends BaseTool<ListDirectoryParams, ListDirectoryResult> {
  static readonly Name = 'list_directory';

  constructor(private projectRoot: string = process.cwd()) {
    super({
      name: ListDirectoryTool.Name,
      displayName: 'ListDirectory',
      description: `Lists the names of files and subdirectories directly within a specified directory path. 
      
Features:
- Respects .gitignore patterns automatically
- Custom ignore patterns support
- Shows file types, sizes, and modification times
- Handles hidden files and directories
- Efficient handling of large directories

This tool is essential for exploring project structure and finding files.`,
      
      parameterSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The absolute or relative path to the directory to list. Relative paths are resolved against the project root.',
          },
          ignore: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of glob patterns to ignore (e.g., ["*.log", "temp/*", "node_modules"]). These are in addition to .gitignore rules.',
          },
          respect_git_ignore: {
            type: 'boolean',
            description: 'Whether to respect .gitignore patterns when listing files. Defaults to true.',
            default: true,
          },
          show_hidden: {
            type: 'boolean',
            description: 'Whether to show hidden files and directories (starting with .). Defaults to false.',
            default: false,
          },
          max_items: {
            type: 'number',
            description: 'Maximum number of items to return. Defaults to 1000 for performance.',
            default: 1000,
          },
        },
        required: ['path'],
      },
    });
  }

  /**
   * 验证目录路径
   */
  private validateDirectoryPath(dirPath: string): { isValid: boolean; resolvedPath: string; error?: string } {
    try {
      // 解析相对路径
      const resolvedPath = path.isAbsolute(dirPath) 
        ? dirPath 
        : path.resolve(this.projectRoot, dirPath);

      // 检查路径是否存在
      if (!fs.existsSync(resolvedPath)) {
        return {
          isValid: false,
          resolvedPath,
          error: `Directory '${dirPath}' does not exist.`,
        };
      }

      // 检查是否是目录
      const stats = fs.statSync(resolvedPath);
      if (!stats.isDirectory()) {
        return {
          isValid: false,
          resolvedPath,
          error: `Path '${dirPath}' is not a directory.`,
        };
      }

      // 检查是否有读取权限
      try {
        fs.accessSync(resolvedPath, fs.constants.R_OK);
      } catch {
        return {
          isValid: false,
          resolvedPath,
          error: `No read permission for directory '${dirPath}'.`,
        };
      }

      return { isValid: true, resolvedPath };
    } catch (error) {
      return {
        isValid: false,
        resolvedPath: dirPath,
        error: `Invalid directory path: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * 加载 .gitignore 规则
   */
  private loadGitIgnorePatterns(dirPath: string): string[] {
    const patterns: string[] = [];
    
    // 查找 .gitignore 文件（从当前目录向上查找）
    let currentDir = dirPath;
    const rootDir = path.parse(currentDir).root;
    
    while (currentDir !== rootDir) {
      const gitignorePath = path.join(currentDir, '.gitignore');
      
      if (fs.existsSync(gitignorePath)) {
        try {
          const content = fs.readFileSync(gitignorePath, 'utf8');
          const lines = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
          
          patterns.push(...lines);
        } catch (error) {
          console.warn(`Failed to read .gitignore at ${gitignorePath}:`, error);
        }
      }
      
      // 向上一级目录
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }
    
    // 默认忽略常见的 Git 相关文件
    patterns.push('.git', '.git/**/*');
    
    return patterns;
  }

  /**
   * 检查文件是否应该被忽略
   */
  private shouldIgnoreItem(
    itemName: string, 
    itemPath: string, 
    dirPath: string, 
    ignorePatterns: string[], 
    showHidden: boolean
  ): boolean {
    // 检查隐藏文件
    if (!showHidden && itemName.startsWith('.')) {
      return true;
    }

    // 检查忽略模式
    const relativePath = path.relative(this.projectRoot, itemPath);
    
    for (const pattern of ignorePatterns) {
      // 简单的 glob 模式匹配
      if (this.matchesPattern(itemName, pattern) || 
          this.matchesPattern(relativePath, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 简单的 glob 模式匹配
   */
  private matchesPattern(text: string, pattern: string): boolean {
    // 转换 glob 模式为正则表达式
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\[([^\]]+)\]/g, '[$1]');
    
    try {
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(text);
    } catch {
      // 如果正则表达式无效，直接字符串匹配
      return text.includes(pattern);
    }
  }

  /**
   * 获取文件详细信息
   */
  private async getItemDetails(itemPath: string, itemName: string): Promise<DirectoryItem> {
    try {
      const stats = await fs.promises.stat(itemPath);
      
      let type: 'file' | 'directory' | 'symlink';
      if (stats.isSymbolicLink()) {
        type = 'symlink';
      } else if (stats.isDirectory()) {
        type = 'directory';
      } else {
        type = 'file';
      }

      return {
        name: itemName,
        type,
        size: type === 'file' ? stats.size : undefined,
        modified: stats.mtime.toISOString(),
        permissions: stats.mode.toString(8).slice(-3),
      };
    } catch (error) {
      // 如果无法获取详细信息，返回基本信息
      return {
        name: itemName,
        type: 'file', // 默认类型
      };
    }
  }

  async execute(params: ListDirectoryParams): Promise<ListDirectoryResult> {
    const { 
      path: dirPath, 
      ignore = [], 
      respect_git_ignore = true, 
      show_hidden = false, 
      max_items = 1000 
    } = params;

    // 1. 验证目录路径
    const pathValidation = this.validateDirectoryPath(dirPath);
    if (!pathValidation.isValid) {
      return {
        success: false,
        path: dirPath,
        items: [],
        total_count: 0,
        error: pathValidation.error,
        llmContent: `Error: ${pathValidation.error}`,
        returnDisplay: `❌ **Directory Listing Failed**\n\nPath: \`${dirPath}\`\nError: ${pathValidation.error}`,
      };
    }

    const { resolvedPath } = pathValidation;

    try {
      // 2. 收集忽略模式
      let ignorePatterns = [...ignore];
      if (respect_git_ignore) {
        const gitIgnorePatterns = this.loadGitIgnorePatterns(resolvedPath);
        ignorePatterns.push(...gitIgnorePatterns);
      }

      // 3. 读取目录内容
      const entries = await fs.promises.readdir(resolvedPath);
      const items: DirectoryItem[] = [];
      let processedCount = 0;

      // 4. 处理每个条目
      for (const entry of entries) {
        if (processedCount >= max_items) {
          break;
        }

        const itemPath = path.join(resolvedPath, entry);
        
        // 检查是否应该忽略
        if (this.shouldIgnoreItem(entry, itemPath, resolvedPath, ignorePatterns, show_hidden)) {
          continue;
        }

        // 获取详细信息
        const item = await this.getItemDetails(itemPath, entry);
        items.push(item);
        processedCount++;
      }

      // 5. 按类型和名称排序（目录在前，然后是文件）
      items.sort((a, b) => {
        if (a.type !== b.type) {
          if (a.type === 'directory') return -1;
          if (b.type === 'directory') return 1;
        }
        return a.name.localeCompare(b.name);
      });

      // 6. 构建结果
      const result: ListDirectoryResult = {
        success: true,
        path: resolvedPath,
        items,
        total_count: items.length,
        has_more: entries.length > max_items,
        llmContent: this.formatLLMContent(resolvedPath, items, entries.length > max_items),
        returnDisplay: this.formatDisplayContent(resolvedPath, items, entries.length > max_items),
      };

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      return {
        success: false,
        path: resolvedPath,
        items: [],
        total_count: 0,
        error: errorMessage,
        llmContent: `Failed to list directory '${resolvedPath}': ${errorMessage}`,
        returnDisplay: `❌ **Directory Listing Failed**\n\nPath: \`${resolvedPath}\`\nError: ${errorMessage}`,
      };
    }
  }

  private formatLLMContent(dirPath: string, items: DirectoryItem[], hasMore: boolean): string {
    const relativePath = path.relative(this.projectRoot, dirPath);
    let content = `Directory listing for '${relativePath || '.'}':\n\n`;
    
    const directories = items.filter(item => item.type === 'directory');
    const files = items.filter(item => item.type === 'file');
    const symlinks = items.filter(item => item.type === 'symlink');

    if (directories.length > 0) {
      content += `Directories (${directories.length}):\n`;
      directories.forEach(dir => {
        content += `  📁 ${dir.name}/\n`;
      });
      content += '\n';
    }

    if (files.length > 0) {
      content += `Files (${files.length}):\n`;
      files.forEach(file => {
        const sizeInfo = file.size !== undefined ? ` (${this.formatFileSize(file.size)})` : '';
        content += `  📄 ${file.name}${sizeInfo}\n`;
      });
      content += '\n';
    }

    if (symlinks.length > 0) {
      content += `Symbolic links (${symlinks.length}):\n`;
      symlinks.forEach(link => {
        content += `  🔗 ${link.name}\n`;
      });
    }

    if (hasMore) {
      content += '\n⚠️ Note: Listing truncated due to large number of items.';
    }

    return content;
  }

  private formatDisplayContent(dirPath: string, items: DirectoryItem[], hasMore: boolean): string {
    const relativePath = path.relative(this.projectRoot, dirPath);
    
    let display = `📁 **Directory Listing**\n\n`;
    display += `**Path:** \`${relativePath || '.'}\`\n`;
    display += `**Items:** ${items.length}\n\n`;

    if (items.length === 0) {
      display += '*Directory is empty or all items are filtered out.*';
      return display;
    }

    // 分组显示
    const directories = items.filter(item => item.type === 'directory');
    const files = items.filter(item => item.type === 'file');
    const symlinks = items.filter(item => item.type === 'symlink');

    if (directories.length > 0) {
      display += `**📁 Directories (${directories.length}):**\n`;
      directories.slice(0, 20).forEach(dir => {
        display += `- \`${dir.name}/\`\n`;
      });
      if (directories.length > 20) {
        display += `- *... and ${directories.length - 20} more directories*\n`;
      }
      display += '\n';
    }

    if (files.length > 0) {
      display += `**📄 Files (${files.length}):**\n`;
      files.slice(0, 30).forEach(file => {
        const sizeInfo = file.size !== undefined ? ` *(${this.formatFileSize(file.size)})*` : '';
        display += `- \`${file.name}\`${sizeInfo}\n`;
      });
      if (files.length > 30) {
        display += `- *... and ${files.length - 30} more files*\n`;
      }
      display += '\n';
    }

    if (symlinks.length > 0) {
      display += `**🔗 Symbolic Links (${symlinks.length}):**\n`;
      symlinks.forEach(link => {
        display += `- \`${link.name}\`\n`;
      });
    }

    if (hasMore) {
      display += '\n⚠️ **Note:** Listing truncated due to large number of items.';
    }

    return display;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    const base = 1024;
    const unitIndex = Math.floor(Math.log(bytes) / Math.log(base));
    const size = bytes / Math.pow(base, unitIndex);
    
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  validateParams(params: ListDirectoryParams): string | null {
    if (!params.path) {
      return 'path is required';
    }
    
    if (params.path.trim().length === 0) {
      return 'path cannot be empty';
    }

    if (params.max_items !== undefined && (params.max_items < 1 || params.max_items > 10000)) {
      return 'max_items must be between 1 and 10000';
    }
    
    return null;
  }

  getDescription(params: ListDirectoryParams): string {
    const { path: dirPath, ignore, respect_git_ignore, show_hidden } = params;
    let description = `List contents of directory: '${dirPath}'`;
    
    const options: string[] = [];
    if (respect_git_ignore === false) options.push('ignore .gitignore');
    if (show_hidden) options.push('show hidden files');
    if (ignore && ignore.length > 0) options.push(`ignore patterns: ${ignore.join(', ')}`);
    
    if (options.length > 0) {
      description += ` (${options.join(', ')})`;
    }
    
    return description;
  }
}

/**
 * 创建 ListDirectory 工具实例
 */
export function createListDirectoryTool(projectRoot?: string): ListDirectoryTool {
  return new ListDirectoryTool(projectRoot);
} 