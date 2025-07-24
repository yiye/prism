/**
 * GlobSearch Tool - 文件查找工具
 * 🎯 参考 qwen-code 的 GlobTool 实现，支持 glob 模式文件查找
 */

import fs from 'node:fs';
import path from 'node:path';

import { glob } from 'glob';

import {
  BaseTool,
  type ToolParams,
  type ToolResult,
} from './base-tool';

export interface GlobSearchParams extends ToolParams {
  pattern: string;
  base_path?: string;
  ignore?: string[];
  max_results?: number;
  respect_git_ignore?: boolean;
  include_hidden?: boolean;
}

export interface FileMatch {
  file: string;
  size: number;
  modified: string;
  type: 'file' | 'directory' | 'symlink';
}

export interface GlobSearchResult extends ToolResult {
  success: boolean;
  pattern: string;
  base_path: string;
  matches: FileMatch[];
  total_matches: number;
  has_more?: boolean;
}

/**
 * GlobSearch 工具实现
 * 🌟 功能特性：
 * - 强大的 glob 模式匹配
 * - 支持多种文件类型过滤
 * - 自动排除敏感文件
 * - 高性能的文件遍历
 * - 详细的文件元信息
 */
export class GlobSearchTool extends BaseTool<GlobSearchParams, GlobSearchResult> {
  static readonly Name = 'find_files';

  constructor(private projectRoot: string = process.cwd()) {
    super({
      name: GlobSearchTool.Name,
      displayName: 'FindFiles',
      description: `Searches for files and directories that match a glob pattern within the specified directory.
      
Features:
- Powerful glob pattern matching (*, **, ?, [...])
- Supports complex patterns like "src/**/*.{ts,tsx,js,jsx}"
- Automatic exclusion of sensitive files (.git, node_modules, etc.)
- File metadata (size, modification time, type)
- Respects .gitignore patterns
- Performance optimized for large directories

Examples:
- "*.js" - All JavaScript files in current directory
- "**/*.ts" - All TypeScript files recursively
- "src/**/*.{ts,tsx}" - TypeScript files in src directory
- "test/**/*" - All files in test directory`,
      
      parameterSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: `The glob pattern to search for files and directories. Supports:
- * matches any characters except /
- ** matches any characters including /
- ? matches any single character except /
- [...] matches any character in brackets
- {...} matches any of the comma-separated patterns

Examples: "*.js", "src/**/*.ts", "**/*.{js,ts,jsx,tsx}", "test/**/test-*.js"`,
          },
          base_path: {
            type: 'string',
            description: 'Optional: The base directory to search within. Defaults to current working directory.',
          },
          ignore: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: Additional glob patterns to ignore (beyond .gitignore).',
          },
          max_results: {
            type: 'number',
            description: 'Optional: Maximum number of results to return. Defaults to 500.',
            default: 500,
          },
          respect_git_ignore: {
            type: 'boolean',
            description: 'Optional: Whether to respect .gitignore patterns. Defaults to true.',
            default: true,
          },
          include_hidden: {
            type: 'boolean',
            description: 'Optional: Whether to include hidden files and directories (starting with .). Defaults to false.',
            default: false,
          },
        },
        required: ['pattern'],
      },
    });
  }

  /**
   * 验证搜索路径
   */
  private validateBasePath(basePath?: string): { isValid: boolean; resolvedPath: string; error?: string } {
    try {
      const resolvedPath = basePath 
        ? (path.isAbsolute(basePath) ? basePath : path.resolve(this.projectRoot, basePath))
        : this.projectRoot;

      if (!fs.existsSync(resolvedPath)) {
        return {
          isValid: false,
          resolvedPath,
          error: `Base path '${basePath || '.'}' does not exist.`,
        };
      }

      const stats = fs.statSync(resolvedPath);
      if (!stats.isDirectory()) {
        return {
          isValid: false,
          resolvedPath,
          error: `Base path '${basePath || '.'}' is not a directory.`,
        };
      }

      return { isValid: true, resolvedPath };
    } catch (error) {
      return {
        isValid: false,
        resolvedPath: basePath || this.projectRoot,
        error: `Invalid base path: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * 加载 gitignore 模式
   */
  private loadGitIgnorePatterns(basePath: string): string[] {
    const patterns: string[] = [];
    
    let currentDir = basePath;
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
      
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }
    
    return patterns;
  }

  /**
   * 获取默认忽略模式
   */
  private getDefaultIgnorePatterns(): string[] {
    return [
      '.git/**',
      '.git',
      'node_modules/**',
      'node_modules',
      '.DS_Store',
      'Thumbs.db',
      '*.tmp',
      '*.temp',
      '.cache/**',
      '.vscode',
      '.idea',
      'dist/**',
      'build/**',
      '.next/**',
      '.nuxt/**',
      'coverage/**',
      '*.log',
      '*.lock',
      '.env.local',
      '.env.*.local',
    ];
  }

  /**
   * 执行 glob 搜索
   */
  private async performGlobSearch(
    pattern: string,
    basePath: string,
    ignorePatterns: string[],
    includeHidden: boolean,
    maxResults: number
  ): Promise<{ matches: FileMatch[]; hasMore: boolean }> {
    try {
      // 配置 glob 选项
      const globOptions = {
        cwd: basePath,
        absolute: true,
        dot: includeHidden, // 包含隐藏文件
        ignore: ignorePatterns,
        nodir: false, // 包含目录
        follow: false, // 不跟随符号链接
        stat: true, // 获取文件统计信息
      };

      // 执行 glob 搜索
      const results = await glob(pattern, globOptions);
      
      // 限制结果数量
      const limitedResults = results.slice(0, maxResults);
      const hasMore = results.length > maxResults;

      // 获取文件详细信息
      const matches: FileMatch[] = [];
      
      for (const filePath of limitedResults) {
        try {
          const stats = await fs.promises.stat(filePath);
          
          let type: 'file' | 'directory' | 'symlink';
          if (stats.isSymbolicLink()) {
            type = 'symlink';
          } else if (stats.isDirectory()) {
            type = 'directory';
          } else {
            type = 'file';
          }

          matches.push({
            file: filePath,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            type,
          });
        } catch (error) {
          console.warn(`Failed to get stats for ${filePath}:`, error);
          // 如果无法获取统计信息，仍然包含该文件
          matches.push({
            file: filePath,
            size: 0,
            modified: new Date().toISOString(),
            type: 'file',
          });
        }
      }

      return { matches, hasMore };
    } catch (error) {
      throw new Error(`Glob search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async execute(params: GlobSearchParams): Promise<GlobSearchResult> {
    const {
      pattern,
      base_path,
      ignore = [],
      max_results = 500,
      respect_git_ignore = true,
      include_hidden = false,
    } = params;

    // 1. 验证基础路径
    const pathValidation = this.validateBasePath(base_path);
    if (!pathValidation.isValid) {
      return {
        success: false,
        pattern,
        base_path: base_path || '.',
        matches: [],
        total_matches: 0,
        error: pathValidation.error,
        llmContent: `Error: ${pathValidation.error}`,
        returnDisplay: `❌ **File Search Failed**\n\nPattern: \`${pattern}\`\nBase Path: \`${base_path || '.'}\`\nError: ${pathValidation.error}`,
      };
    }

    const { resolvedPath } = pathValidation;

    try {
      // 2. 收集忽略模式
      let allIgnorePatterns = [...this.getDefaultIgnorePatterns(), ...ignore];
      
      if (respect_git_ignore) {
        const gitIgnorePatterns = this.loadGitIgnorePatterns(resolvedPath);
        allIgnorePatterns.push(...gitIgnorePatterns);
      }

      // 3. 执行搜索
      const { matches, hasMore } = await this.performGlobSearch(
        pattern,
        resolvedPath,
        allIgnorePatterns,
        include_hidden,
        max_results
      );

      // 4. 按类型和名称排序
      matches.sort((a, b) => {
        // 目录优先
        if (a.type !== b.type) {
          if (a.type === 'directory') return -1;
          if (b.type === 'directory') return 1;
        }
        
        // 然后按名称排序
        const aName = path.basename(a.file);
        const bName = path.basename(b.file);
        return aName.localeCompare(bName);
      });

      // 5. 构建结果
      const result: GlobSearchResult = {
        success: true,
        pattern,
        base_path: resolvedPath,
        matches,
        total_matches: matches.length,
        has_more: hasMore,
        llmContent: this.formatLLMContent(pattern, resolvedPath, matches, hasMore),
        returnDisplay: this.formatDisplayContent(pattern, resolvedPath, matches, hasMore),
      };

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      return {
        success: false,
        pattern,
        base_path: resolvedPath,
        matches: [],
        total_matches: 0,
        error: errorMessage,
        llmContent: `Failed to search for pattern '${pattern}' in '${resolvedPath}': ${errorMessage}`,
        returnDisplay: `❌ **File Search Failed**\n\nPattern: \`${pattern}\`\nBase Path: \`${resolvedPath}\`\nError: ${errorMessage}`,
      };
    }
  }

  private formatLLMContent(
    pattern: string,
    basePath: string,
    matches: FileMatch[],
    hasMore: boolean
  ): string {
    const relativePath = path.relative(this.projectRoot, basePath);
    let content = `File search results for pattern '${pattern}' in '${relativePath || '.'}':\n\n`;
    
    content += `Total matches: ${matches.length}${hasMore ? '+' : ''}\n\n`;

    if (matches.length === 0) {
      content += 'No files found matching the pattern.';
      return content;
    }

    // 按类型分组
    const directories = matches.filter(m => m.type === 'directory');
    const files = matches.filter(m => m.type === 'file');
    const symlinks = matches.filter(m => m.type === 'symlink');

    if (directories.length > 0) {
      content += `📁 Directories (${directories.length}):\n`;
      directories.forEach(dir => {
        const relativeFile = path.relative(this.projectRoot, dir.file);
        content += `  ${relativeFile}/\n`;
      });
      content += '\n';
    }

    if (files.length > 0) {
      content += `📄 Files (${files.length}):\n`;
      files.forEach(file => {
        const relativeFile = path.relative(this.projectRoot, file.file);
        const sizeInfo = this.formatFileSize(file.size);
        content += `  ${relativeFile} (${sizeInfo})\n`;
      });
      content += '\n';
    }

    if (symlinks.length > 0) {
      content += `🔗 Symbolic Links (${symlinks.length}):\n`;
      symlinks.forEach(link => {
        const relativeFile = path.relative(this.projectRoot, link.file);
        content += `  ${relativeFile}\n`;
      });
    }

    if (hasMore) {
      content += '\n⚠️ Note: Results truncated due to large number of matches.';
    }

    return content;
  }

  private formatDisplayContent(
    pattern: string,
    basePath: string,
    matches: FileMatch[],
    hasMore: boolean
  ): string {
    const relativePath = path.relative(this.projectRoot, basePath);
    
    let display = `🔍 **File Search Results**\n\n`;
    display += `**Pattern:** \`${pattern}\`\n`;
    display += `**Base Path:** \`${relativePath || '.'}\`\n`;
    display += `**Matches Found:** ${matches.length}${hasMore ? '+' : ''}\n\n`;

    if (matches.length === 0) {
      display += '*No files found matching the pattern.*';
      return display;
    }

    // 按类型分组显示
    const directories = matches.filter(m => m.type === 'directory');
    const files = matches.filter(m => m.type === 'file');
    const symlinks = matches.filter(m => m.type === 'symlink');

    if (directories.length > 0) {
      display += `**📁 Directories (${directories.length}):**\n`;
      directories.slice(0, 15).forEach(dir => {
        const relativeFile = path.relative(this.projectRoot, dir.file);
        display += `- \`${relativeFile}/\`\n`;
      });
      if (directories.length > 15) {
        display += `- *... and ${directories.length - 15} more directories*\n`;
      }
      display += '\n';
    }

    if (files.length > 0) {
      display += `**📄 Files (${files.length}):**\n`;
      files.slice(0, 25).forEach(file => {
        const relativeFile = path.relative(this.projectRoot, file.file);
        const sizeInfo = this.formatFileSize(file.size);
        display += `- \`${relativeFile}\` *(${sizeInfo})*\n`;
      });
      if (files.length > 25) {
        display += `- *... and ${files.length - 25} more files*\n`;
      }
      display += '\n';
    }

    if (symlinks.length > 0) {
      display += `**🔗 Symbolic Links (${symlinks.length}):**\n`;
      symlinks.forEach(link => {
        const relativeFile = path.relative(this.projectRoot, link.file);
        display += `- \`${relativeFile}\`\n`;
      });
    }

    if (hasMore) {
      display += '\n⚠️ **Note:** Results truncated due to large number of matches.';
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

  validateParams(params: GlobSearchParams): string | null {
    if (!params.pattern) {
      return 'pattern is required';
    }
    
    if (params.pattern.trim().length === 0) {
      return 'pattern cannot be empty';
    }

    if (params.max_results !== undefined && (params.max_results < 1 || params.max_results > 5000)) {
      return 'max_results must be between 1 and 5000';
    }
    
    return null;
  }

  getDescription(params: GlobSearchParams): string {
    const { pattern, base_path, include_hidden } = params;
    let description = `Find files matching pattern '${pattern}'`;
    
    if (base_path) {
      description += ` in '${base_path}'`;
    }
    
    const options: string[] = [];
    if (include_hidden) options.push('include hidden files');
    
    if (options.length > 0) {
      description += ` (${options.join(', ')})`;
    }
    
    return description;
  }
}

/**
 * 创建 GlobSearch 工具实例
 */
export function createGlobSearchTool(projectRoot?: string): GlobSearchTool {
  return new GlobSearchTool(projectRoot);
} 