/**
 * GrepSearch Tool - 内容搜索工具
 * 🎯 参考 qwen-code 的 GrepTool 实现，支持正则表达式搜索和文件过滤
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  BaseTool,
  type ToolParams,
  type ToolResult,
} from './base-tool';

export interface GrepSearchParams extends ToolParams {
  pattern: string;
  path?: string;
  include?: string;
  exclude?: string[];
  case_sensitive?: boolean;
  max_results?: number;
  context_lines?: number;
  respect_git_ignore?: boolean;
}

export interface SearchMatch {
  file: string;
  line_number: number;
  line_content: string;
  match_start: number;
  match_end: number;
  context_before?: string[];
  context_after?: string[];
}

export interface GrepSearchResult extends ToolResult {
  success: boolean;
  pattern: string;
  search_path: string;
  matches: SearchMatch[];
  total_matches: number;
  files_searched: number;
  has_more?: boolean;
}

/**
 * GrepSearch 工具实现
 * 🌟 功能特性：
 * - 正则表达式模式匹配
 * - 灵活的文件包含/排除规则
 * - 上下文行显示
 * - 性能优化的大型项目搜索
 * - gitignore 规则支持
 */
export class GrepSearchTool extends BaseTool<GrepSearchParams, GrepSearchResult> {
  static readonly Name = 'search_file_content';

  constructor(private projectRoot: string = process.cwd()) {
    super({
      name: GrepSearchTool.Name,
      displayName: 'SearchText',
      description: `Searches for a regular expression pattern within the content of files in a specified directory (or current working directory). 
      
Features:
- Regular expression pattern matching
- File filtering with glob patterns
- Context lines around matches
- Case-sensitive and case-insensitive search
- Respects .gitignore patterns
- Performance optimized for large codebases

This tool is essential for finding specific code patterns, functions, variables, or text across multiple files.`,
      
      parameterSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The regular expression (regex) pattern to search for within file contents (e.g., "function\\s+myFunction", "import\\s+\\{.*\\}\\s+from\\s+.*").',
          },
          path: {
            type: 'string',
            description: 'Optional: The absolute or relative path to the directory to search within. If omitted, searches the current working directory.',
          },
          include: {
            type: 'string',
            description: 'Optional: A glob pattern to filter which files are searched (e.g., "*.js", "*.{ts,tsx}", "src/**"). If omitted, searches all text files.',
          },
          exclude: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional: Array of glob patterns for files to exclude from search (e.g., ["*.log", "node_modules/**", "dist/**"]).',
          },
          case_sensitive: {
            type: 'boolean',
            description: 'Optional: Whether the search should be case-sensitive. Defaults to false.',
            default: false,
          },
          max_results: {
            type: 'number',
            description: 'Optional: Maximum number of matches to return. Defaults to 100 for performance.',
            default: 100,
          },
          context_lines: {
            type: 'number',
            description: 'Optional: Number of context lines to show before and after each match. Defaults to 2.',
            default: 2,
          },
          respect_git_ignore: {
            type: 'boolean',
            description: 'Optional: Whether to respect .gitignore patterns when searching files. Defaults to true.',
            default: true,
          },
        },
        required: ['pattern'],
      },
    });
  }

  /**
   * 验证搜索路径
   */
  private validateSearchPath(searchPath?: string): { isValid: boolean; resolvedPath: string; error?: string } {
    try {
      const resolvedPath = searchPath 
        ? (path.isAbsolute(searchPath) ? searchPath : path.resolve(this.projectRoot, searchPath))
        : this.projectRoot;

      if (!fs.existsSync(resolvedPath)) {
        return {
          isValid: false,
          resolvedPath,
          error: `Search path '${searchPath || '.'}' does not exist.`,
        };
      }

      const stats = fs.statSync(resolvedPath);
      if (!stats.isDirectory()) {
        return {
          isValid: false,
          resolvedPath,
          error: `Search path '${searchPath || '.'}' is not a directory.`,
        };
      }

      return { isValid: true, resolvedPath };
    } catch (error) {
      return {
        isValid: false,
        resolvedPath: searchPath || this.projectRoot,
        error: `Invalid search path: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * 验证正则表达式模式
   */
  private validatePattern(pattern: string): { isValid: boolean; regex?: RegExp; error?: string } {
    try {
      const regex = new RegExp(pattern, 'gm');
      return { isValid: true, regex };
    } catch (error) {
      return {
        isValid: false,
        error: `Invalid regular expression pattern: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * 加载 gitignore 模式
   */
  private loadGitIgnorePatterns(searchPath: string): string[] {
    const patterns: string[] = [];
    
    let currentDir = searchPath;
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
    
    // 默认排除模式
    patterns.push(
      '.git/**/*',
      'node_modules/**/*',
      '*.log',
      '*.lock',
      'dist/**/*',
      'build/**/*',
      '.next/**/*',
      '.nuxt/**/*',
      'coverage/**/*'
    );
    
    return patterns;
  }

  /**
   * 检查文件是否应该被搜索
   */
  private shouldSearchFile(
    filePath: string,
    includePattern?: string,
    excludePatterns: string[] = [],
    gitIgnorePatterns: string[] = []
  ): boolean {
    const fileName = path.basename(filePath);
    const relativePath = path.relative(this.projectRoot, filePath);

    // 检查是否是文本文件
    if (!this.isTextFile(filePath)) {
      return false;
    }

    // 检查包含模式
    if (includePattern && !this.matchesGlob(fileName, includePattern) && !this.matchesGlob(relativePath, includePattern)) {
      return false;
    }

    // 检查排除模式
    const allExcludePatterns = [...excludePatterns, ...gitIgnorePatterns];
    for (const pattern of allExcludePatterns) {
      if (this.matchesGlob(fileName, pattern) || this.matchesGlob(relativePath, pattern)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 检查是否是文本文件
   */
  private isTextFile(filePath: string): boolean {
    // 基于扩展名的简单检查
    const textExtensions = new Set([
      '.txt', '.md', '.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
      '.css', '.scss', '.sass', '.less', '.html', '.htm', '.xml', '.json', '.yaml', '.yml',
      '.sh', '.bash', '.ps1', '.sql', '.php', '.rb', '.go', '.rs', '.kt', '.swift', '.dart',
      '.vue', '.svelte', '.config', '.conf', '.ini', '.env', '.gitignore', '.dockerignore',
      '.makefile', '.cmake', '.gradle', '.properties', '.toml', '.lock', '.log'
    ]);

    const ext = path.extname(filePath).toLowerCase();
    
    // 没有扩展名的常见文本文件
    const textFileNames = new Set([
      'readme', 'license', 'changelog', 'contributing', 'dockerfile', 'makefile',
      'gemfile', 'rakefile', 'gulpfile', 'gruntfile', 'webpack.config', 'rollup.config'
    ]);

    const baseName = path.basename(filePath, ext).toLowerCase();

    return textExtensions.has(ext) || textFileNames.has(baseName) || ext === '';
  }

  /**
   * 简单的 glob 模式匹配
   */
  private matchesGlob(text: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '###DOUBLESTAR###')
      .replace(/\*/g, '[^/]*')
      .replace(/###DOUBLESTAR###/g, '.*')
      .replace(/\?/g, '[^/]');
    
    try {
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(text);
    } catch {
      return text.includes(pattern);
    }
  }

  /**
   * 递归查找文件
   */
  private async findFiles(
    searchPath: string,
    includePattern?: string,
    excludePatterns: string[] = [],
    gitIgnorePatterns: string[] = []
  ): Promise<string[]> {
    const files: string[] = [];
    
    const traverse = async (currentPath: string) => {
      try {
        const entries = await fs.promises.readdir(currentPath);
        
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry);
          const stats = await fs.promises.stat(fullPath);
          
          if (stats.isDirectory()) {
            // 检查目录是否应该被跳过
            const relativePath = path.relative(this.projectRoot, fullPath);
            if (!gitIgnorePatterns.some(pattern => this.matchesGlob(relativePath, pattern))) {
              await traverse(fullPath);
            }
          } else if (stats.isFile()) {
            if (this.shouldSearchFile(fullPath, includePattern, excludePatterns, gitIgnorePatterns)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to read directory ${currentPath}:`, error);
      }
    };
    
    await traverse(searchPath);
    return files;
  }

  /**
   * 在文件中搜索模式
   */
  private async searchInFile(
    filePath: string,
    regex: RegExp,
    caseSensitive: boolean,
    contextLines: number
  ): Promise<SearchMatch[]> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      const matches: SearchMatch[] = [];

      // 重新创建正则表达式以确保正确的标志
      const flags = caseSensitive ? 'gm' : 'gim';
      const searchRegex = new RegExp(regex.source, flags);

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        let match;
        
        searchRegex.lastIndex = 0; // 重置正则表达式状态
        
        while ((match = searchRegex.exec(line)) !== null) {
          const contextBefore = contextLines > 0 
            ? lines.slice(Math.max(0, lineIndex - contextLines), lineIndex)
            : undefined;
          
          const contextAfter = contextLines > 0
            ? lines.slice(lineIndex + 1, Math.min(lines.length, lineIndex + 1 + contextLines))
            : undefined;

          matches.push({
            file: filePath,
            line_number: lineIndex + 1,
            line_content: line,
            match_start: match.index,
            match_end: match.index + match[0].length,
            context_before: contextBefore,
            context_after: contextAfter,
          });

          // 防止无限循环（零宽度匹配）
          if (match[0].length === 0) {
            searchRegex.lastIndex++;
          }
        }
      }

      return matches;
    } catch (error) {
      console.warn(`Failed to search in file ${filePath}:`, error);
      return [];
    }
  }

  async execute(params: GrepSearchParams): Promise<GrepSearchResult> {
    const {
      pattern,
      path: searchPath,
      include,
      exclude = [],
      case_sensitive = false,
      max_results = 100,
      context_lines = 2,
      respect_git_ignore = true,
    } = params;

    // 1. 验证搜索路径
    const pathValidation = this.validateSearchPath(searchPath);
    if (!pathValidation.isValid) {
      return {
        success: false,
        pattern,
        search_path: searchPath || '.',
        matches: [],
        total_matches: 0,
        files_searched: 0,
        error: pathValidation.error,
        llmContent: `Error: ${pathValidation.error}`,
        returnDisplay: `❌ **Search Failed**\n\nPattern: \`${pattern}\`\nPath: \`${searchPath || '.'}\`\nError: ${pathValidation.error}`,
      };
    }

    // 2. 验证正则表达式
    const patternValidation = this.validatePattern(pattern);
    if (!patternValidation.isValid) {
      return {
        success: false,
        pattern,
        search_path: pathValidation.resolvedPath,
        matches: [],
        total_matches: 0,
        files_searched: 0,
        error: patternValidation.error,
        llmContent: `Error: ${patternValidation.error}`,
        returnDisplay: `❌ **Search Failed**\n\nPattern: \`${pattern}\`\nError: ${patternValidation.error}`,
      };
    }

    const { resolvedPath } = pathValidation;
    const { regex } = patternValidation;

    try {
      // 3. 收集忽略模式
      const gitIgnorePatterns = respect_git_ignore ? this.loadGitIgnorePatterns(resolvedPath) : [];

      // 4. 查找要搜索的文件
      const filesToSearch = await this.findFiles(resolvedPath, include, exclude, gitIgnorePatterns);

      // 5. 在文件中搜索
      const allMatches: SearchMatch[] = [];
      let matchCount = 0;

      for (const filePath of filesToSearch) {
        if (matchCount >= max_results) {
          break;
        }

        const fileMatches = await this.searchInFile(filePath, regex!, case_sensitive, context_lines);
        
        for (const match of fileMatches) {
          if (matchCount >= max_results) {
            break;
          }
          allMatches.push(match);
          matchCount++;
        }
      }

      // 6. 构建结果
      const result: GrepSearchResult = {
        success: true,
        pattern,
        search_path: resolvedPath,
        matches: allMatches,
        total_matches: allMatches.length,
        files_searched: filesToSearch.length,
        has_more: matchCount >= max_results,
        llmContent: this.formatLLMContent(pattern, resolvedPath, allMatches, filesToSearch.length, matchCount >= max_results),
        returnDisplay: this.formatDisplayContent(pattern, resolvedPath, allMatches, filesToSearch.length, matchCount >= max_results),
      };

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      return {
        success: false,
        pattern,
        search_path: resolvedPath,
        matches: [],
        total_matches: 0,
        files_searched: 0,
        error: errorMessage,
        llmContent: `Failed to search for pattern '${pattern}' in '${resolvedPath}': ${errorMessage}`,
        returnDisplay: `❌ **Search Failed**\n\nPattern: \`${pattern}\`\nPath: \`${resolvedPath}\`\nError: ${errorMessage}`,
      };
    }
  }

  private formatLLMContent(
    pattern: string,
    searchPath: string,
    matches: SearchMatch[],
    filesSearched: number,
    hasMore: boolean
  ): string {
    const relativePath = path.relative(this.projectRoot, searchPath);
    let content = `Search results for pattern '${pattern}' in '${relativePath || '.'}':\n\n`;
    
    content += `Files searched: ${filesSearched}\n`;
    content += `Matches found: ${matches.length}${hasMore ? '+' : ''}\n\n`;

    if (matches.length === 0) {
      content += 'No matches found.';
      return content;
    }

    // 按文件分组显示结果
    const fileGroups = new Map<string, SearchMatch[]>();
    for (const match of matches) {
      const fileMatches = fileGroups.get(match.file) || [];
      fileMatches.push(match);
      fileGroups.set(match.file, fileMatches);
    }

    for (const [filePath, fileMatches] of fileGroups) {
      const relativeFilePath = path.relative(this.projectRoot, filePath);
      content += `📄 ${relativeFilePath} (${fileMatches.length} matches):\n`;
      
      for (const match of fileMatches.slice(0, 5)) { // 限制每个文件显示的匹配数
        content += `  Line ${match.line_number}: ${match.line_content.trim()}\n`;
      }
      
      if (fileMatches.length > 5) {
        content += `  ... and ${fileMatches.length - 5} more matches\n`;
      }
      
      content += '\n';
    }

    if (hasMore) {
      content += '⚠️ Note: Results truncated due to large number of matches.';
    }

    return content;
  }

  private formatDisplayContent(
    pattern: string,
    searchPath: string,
    matches: SearchMatch[],
    filesSearched: number,
    hasMore: boolean
  ): string {
    const relativePath = path.relative(this.projectRoot, searchPath);
    
    let display = `🔍 **Search Results**\n\n`;
    display += `**Pattern:** \`${pattern}\`\n`;
    display += `**Path:** \`${relativePath || '.'}\`\n`;
    display += `**Files Searched:** ${filesSearched}\n`;
    display += `**Matches Found:** ${matches.length}${hasMore ? '+' : ''}\n\n`;

    if (matches.length === 0) {
      display += '*No matches found.*';
      return display;
    }

    // 按文件分组显示
    const fileGroups = new Map<string, SearchMatch[]>();
    for (const match of matches) {
      const fileMatches = fileGroups.get(match.file) || [];
      fileMatches.push(match);
      fileGroups.set(match.file, fileMatches);
    }

    let fileCount = 0;
    for (const [filePath, fileMatches] of fileGroups) {
      if (fileCount >= 10) { // 限制显示的文件数
        display += `*... and ${fileGroups.size - fileCount} more files*\n`;
        break;
      }

      const relativeFilePath = path.relative(this.projectRoot, filePath);
      display += `### 📄 \`${relativeFilePath}\` (${fileMatches.length} matches)\n\n`;
      
      for (const match of fileMatches.slice(0, 3)) { // 每个文件最多显示3个匹配
        display += `**Line ${match.line_number}:**\n`;
        display += `\`\`\`\n${match.line_content}\n\`\`\`\n\n`;
      }
      
      if (fileMatches.length > 3) {
        display += `*... and ${fileMatches.length - 3} more matches in this file*\n\n`;
      }
      
      fileCount++;
    }

    if (hasMore) {
      display += '\n⚠️ **Note:** Results truncated due to large number of matches.';
    }

    return display;
  }

  validateParams(params: GrepSearchParams): string | null {
    if (!params.pattern) {
      return 'pattern is required';
    }
    
    if (params.pattern.trim().length === 0) {
      return 'pattern cannot be empty';
    }

    if (params.max_results !== undefined && (params.max_results < 1 || params.max_results > 1000)) {
      return 'max_results must be between 1 and 1000';
    }

    if (params.context_lines !== undefined && (params.context_lines < 0 || params.context_lines > 10)) {
      return 'context_lines must be between 0 and 10';
    }
    
    return null;
  }

  getDescription(params: GrepSearchParams): string {
    const { pattern, path: searchPath, include, case_sensitive } = params;
    let description = `Search for pattern '${pattern}'`;
    
    if (searchPath) {
      description += ` in '${searchPath}'`;
    }
    
    const options: string[] = [];
    if (include) options.push(`files: ${include}`);
    if (case_sensitive) options.push('case-sensitive');
    
    if (options.length > 0) {
      description += ` (${options.join(', ')})`;
    }
    
    return description;
  }
}

/**
 * 创建 GrepSearch 工具实例
 */
export function createGrepSearchTool(projectRoot?: string): GrepSearchTool {
  return new GrepSearchTool(projectRoot);
} 