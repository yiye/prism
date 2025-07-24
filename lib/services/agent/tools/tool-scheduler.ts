/**
 * Tool Scheduler - 工具执行调度器
 * 🎯 基于 qwen-code 的 CoreToolScheduler 架构设计
 * 负责工具执行的策略控制、监控和调度
 */

import { type ToolSchema } from '../../../../types';
import {
  type ToolParams,
  type ToolResult,
} from './base-tool';
import {
  createFileEditTool,
  FileEditTool,
} from './file-edit';
import {
  createFileReaderTool,
  type FileReaderTool,
} from './file-reader';
import {
  createGlobSearchTool,
  GlobSearchTool,
} from './glob-search';
import {
  createGrepSearchTool,
  GrepSearchTool,
} from './grep-search';
import {
  createListDirectoryTool,
  ListDirectoryTool,
} from './list-directory';
import {
  createMemoryTool,
  MemoryTool,
} from './memory-tool';
import {
  createReadManyFilesTool,
  ReadManyFilesTool,
} from './read-many-files';
import {
  createShellCommandTool,
  ShellCommandTool,
} from './shell-command';
// 新增工具导入
import {
  createWebFetchTool,
  WebFetchTool,
} from './web-fetch';
import {
  createWebSearchTool,
  WebSearchTool,
} from './web-search';
import {
  createWriteFileTool,
  WriteFileTool,
} from './write-file';

// 工具类型定义 - 更新包含新工具
export type ToolName = 
  | 'write_file'
  | 'list_directory'
  | 'search_file_content'
  | 'find_files'
  | 'execute_shell_command'
  | 'read_file'
  | 'web_fetch'
  | 'web_search'
  | 'memory'
  | 'read_many_files'
  | 'file_edit';

export type ToolInstance = 
  | WriteFileTool
  | ListDirectoryTool
  | GrepSearchTool
  | GlobSearchTool
  | ShellCommandTool
  | FileReaderTool
  | WebFetchTool
  | WebSearchTool
  | MemoryTool
  | ReadManyFilesTool
  | FileEditTool;

/**
 * 工具配置接口
 */
export interface ToolConfig {
  enabled: boolean;
  maxConcurrent?: number;
  timeout?: number;
  rateLimitPerMinute?: number;
}

/**
 * 工具调度器配置
 */
export interface ToolSchedulerConfig {
  projectRoot: string;
  tools: Partial<Record<ToolName, ToolConfig>>;
  globalTimeout?: number;
  maxConcurrentTools?: number;
  // 新工具的配置选项
  webSearchApiKeys?: {
    googleApiKey?: string;
    googleCseId?: string;
    bingApiKey?: string;
  };
  allowedDomains?: string[]; // 用于 web_fetch
}

/**
 * 工具执行结果
 */
export interface ToolExecutionResult extends ToolResult {
  toolName: string;
  duration: number;
  success?: boolean;
  error?: string;
}

/**
 * 工具执行选项
 */
export interface ExecutionOptions {
  timeout?: number;
  signal?: AbortSignal;
}

/**
 * 工具调度器 - 执行策略控制和监控
 * 🎯 参考 qwen-code 的 CoreToolScheduler 架构
 * 
 * 核心功能：
 * - 工具执行调度和策略控制
 * - 速率限制和超时管理
 * - 错误处理和重试机制
 * - 性能监控和审计日志
 */
export class ToolScheduler {
  private readonly tools: Map<ToolName, ToolInstance> = new Map();
  private readonly config: ToolSchedulerConfig;
  private readonly rateLimiters: Map<ToolName, number[]> = new Map();
  private readonly executionStats: Map<ToolName, {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    averageDuration: number;
    lastExecution: number;
  }> = new Map();

  constructor(config: ToolSchedulerConfig) {
    this.config = config;
    this.initializeTools();
    this.initializeStats();
  }

  /**
   * 初始化所有工具 - 包含新工具
   */
  private initializeTools(): void {
    const { projectRoot } = this.config;

    // 注册原有工具
    this.registerTool('write_file', createWriteFileTool(projectRoot));
    this.registerTool('list_directory', createListDirectoryTool(projectRoot));
    this.registerTool('search_file_content', createGrepSearchTool(projectRoot));
    this.registerTool('find_files', createGlobSearchTool(projectRoot));
    this.registerTool('execute_shell_command', createShellCommandTool(projectRoot));
    this.registerTool('read_file', createFileReaderTool(projectRoot));

    // 注册新工具
    this.registerTool('web_fetch', createWebFetchTool(this.config.allowedDomains));
    this.registerTool('web_search', createWebSearchTool(this.config.webSearchApiKeys));
    this.registerTool('memory', createMemoryTool(projectRoot));
    this.registerTool('read_many_files', createReadManyFilesTool(projectRoot));
    this.registerTool('file_edit', createFileEditTool(projectRoot));

    console.log(`🛠️ Initialized ToolScheduler with ${this.tools.size} tools`);
  }

  /**
   * 初始化统计信息
   */
  private initializeStats(): void {
    for (const toolName of this.tools.keys()) {
      this.executionStats.set(toolName, {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        averageDuration: 0,
        lastExecution: 0,
      });
    }
  }

  /**
   * 注册工具
   */
  private registerTool(name: ToolName, tool: ToolInstance): void {
    this.tools.set(name, tool);
  }

  /**
   * 获取工具
   */
  public getTool(name: ToolName): ToolInstance | undefined {
    return this.tools.get(name);
  }

  /**
   * 调度工具执行 - 核心方法
   * 参考 qwen-code 的 CoreToolScheduler.schedule()
   */
  public async scheduleTool(
    toolName: ToolName,
    params: ToolParams,
    options: ExecutionOptions = {}
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    // 更新统计
    const stats = this.executionStats.get(toolName);
    if (stats) {
      stats.totalCalls++;
    }

    // 1. 检查工具是否存在
    const tool = this.tools.get(toolName);
    if (!tool) {
      const result = this.createErrorResult(
        toolName,
        `Tool '${toolName}' not found`,
        startTime
      );
      this.updateFailureStats(toolName);
      return result;
    }

    // 2. 检查工具是否启用
    const toolConfig = this.config.tools[toolName];
    if (toolConfig && toolConfig.enabled === false) {
      const result = this.createErrorResult(
        toolName,
        `Tool '${toolName}' is disabled`,
        startTime
      );
      this.updateFailureStats(toolName);
      return result;
    }

    // 3. 检查速率限制
    if (!this.checkRateLimit(toolName)) {
      const result = this.createErrorResult(
        toolName,
        `Rate limit exceeded for tool '${toolName}'`,
        startTime
      );
      this.updateFailureStats(toolName);
      return result;
    }

    // 4. 验证参数
    const validation = tool.validateParams(params as never);
    if (!validation || typeof validation === 'string' || !validation.valid) {
      const errorMsg = typeof validation === 'string' ? validation : validation?.error || 'Parameter validation failed';
      const result = this.createErrorResult(
        toolName,
        `Parameter validation failed: ${errorMsg}`,
        startTime
      );
      this.updateFailureStats(toolName);
      return result;
    }

    // 5. 设置超时
    const timeout = options.timeout || 
                   toolConfig?.timeout || 
                   this.config.globalTimeout || 
                   60000; // 默认60秒

    try {
      // 6. 执行工具（带超时控制）
      const abortController = new AbortController();
      const effectiveSignal = options.signal || abortController.signal;
      
      const executePromise = tool.execute(params as never, effectiveSignal);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          abortController.abort();
          reject(new Error(`Tool execution timed out after ${timeout}ms`));
        }, timeout);
      });

      const result = await Promise.race([executePromise, timeoutPromise]);
      const duration = Date.now() - startTime;

      // 更新成功统计
      this.updateSuccessStats(toolName, startTime);

      return {
        ...result,
        toolName,
        duration,
        success: 'success' in result ? result.success !== false : true,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateFailureStats(toolName);

      return this.createErrorResult(
        toolName,
        error instanceof Error ? error.message : String(error),
        startTime,
        duration
      );
    }
  }

  /**
   * 检查速率限制
   */
  private checkRateLimit(toolName: ToolName): boolean {
    const toolConfig = this.config.tools[toolName];
    if (!toolConfig?.rateLimitPerMinute) {
      return true;
    }

    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    let rateLimitData = this.rateLimiters.get(toolName) || [];
    
    // 清理过期的时间戳
    rateLimitData = rateLimitData.filter(timestamp => timestamp > oneMinuteAgo);
    
    // 检查是否超过限制
    if (rateLimitData.length >= toolConfig.rateLimitPerMinute) {
      return false;
    }
    
    // 添加当前时间戳
    rateLimitData.push(now);
    this.rateLimiters.set(toolName, rateLimitData);
    
    return true;
  }

  /**
   * 更新成功统计
   */
  private updateSuccessStats(toolName: ToolName, startTime: number): void {
    const stats = this.executionStats.get(toolName);
    if (stats) {
      stats.successfulCalls++;
      stats.lastExecution = Date.now();
      
      const duration = Date.now() - startTime;
      stats.averageDuration = (stats.averageDuration * (stats.totalCalls - 1) + duration) / stats.totalCalls;
    }
  }

  /**
   * 更新失败统计
   */
  private updateFailureStats(toolName: ToolName): void {
    const stats = this.executionStats.get(toolName);
    if (stats) {
      stats.failedCalls++;
      stats.lastExecution = Date.now();
    }
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(
    toolName: string,
    error: string,
    startTime: number,
    duration?: number
  ): ToolExecutionResult {
    return {
      output: `Error: ${error}`,
      success: false,
      toolName,
      duration: duration || (Date.now() - startTime),
      error,
    };
  }

  /**
   * 获取工具统计信息
   */
  public getStats(): Record<string, {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    averageDuration: number;
    lastExecution: number;
    successRate: string;
  }> {
    const stats: Record<string, {
      totalCalls: number;
      successfulCalls: number;
      failedCalls: number;
      averageDuration: number;
      lastExecution: number;
      successRate: string;
    }> = {};
    
    for (const [toolName, data] of this.executionStats) {
      stats[toolName] = {
        ...data,
        successRate: data.totalCalls > 0 ? (data.successfulCalls / data.totalCalls * 100).toFixed(2) + '%' : '0%',
      };
    }
    
    return stats;
  }

  /**
   * 获取可用工具列表
   */
  public getAvailableTools(): Array<{ name: string; description: string; schema: ToolSchema }> {
    return Array.from(this.tools.entries()).map(([name, tool]) => ({
      name,
      description: tool.description,
      schema: tool.schema,
    }));
  }

  /**
   * 重置统计信息
   */
  public resetStats(): void {
    this.initializeStats();
    this.rateLimiters.clear();
  }
}

/**
 * 创建默认工具调度器
 * 包含所有新工具的预配置实例
 */
export function createDefaultToolScheduler(
  projectRoot?: string,
  options?: {
    webSearchApiKeys?: ToolSchedulerConfig['webSearchApiKeys'];
    allowedDomains?: string[];
  }
): ToolScheduler {
  const config: ToolSchedulerConfig = {
    projectRoot: projectRoot || process.cwd(),
    tools: {
      // 基础工具 - 默认启用
      read_file: { enabled: true, timeout: 30000, rateLimitPerMinute: 100 },
      write_file: { enabled: true, timeout: 30000, rateLimitPerMinute: 50 },
      list_directory: { enabled: true, timeout: 10000, rateLimitPerMinute: 100 },
      search_file_content: { enabled: true, timeout: 60000, rateLimitPerMinute: 50 },
      find_files: { enabled: true, timeout: 30000, rateLimitPerMinute: 100 },
      execute_shell_command: { enabled: true, timeout: 120000, rateLimitPerMinute: 20 },
      
      // 新工具 - 默认启用
      web_fetch: { enabled: true, timeout: 30000, rateLimitPerMinute: 30 },
      web_search: { enabled: true, timeout: 30000, rateLimitPerMinute: 10 },
      memory: { enabled: true, timeout: 10000, rateLimitPerMinute: 50 },
      read_many_files: { enabled: true, timeout: 60000, rateLimitPerMinute: 20 },
      file_edit: { enabled: true, timeout: 30000, rateLimitPerMinute: 30 },
    },
    globalTimeout: 120000, // 2分钟全局超时
    maxConcurrentTools: 5,
    webSearchApiKeys: options?.webSearchApiKeys,
    allowedDomains: options?.allowedDomains,
  };

  return new ToolScheduler(config);
} 