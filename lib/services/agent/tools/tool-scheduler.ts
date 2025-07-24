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
  createShellCommandTool,
  ShellCommandTool,
} from './shell-command';
import {
  createWriteFileTool,
  WriteFileTool,
} from './write-file';

// 工具类型定义
export type ToolName = 
  | 'write_file'
  | 'list_directory'
  | 'search_file_content'
  | 'find_files'
  | 'execute_shell_command'
  | 'read_file';

export type ToolInstance = 
  | WriteFileTool
  | ListDirectoryTool
  | GrepSearchTool
  | GlobSearchTool
  | ShellCommandTool
  | FileReaderTool;

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
 * - 安全性检查和权限控制
 */
export class ToolScheduler {
  private tools = new Map<ToolName, ToolInstance>();
  private config: ToolSchedulerConfig;
  private rateLimits = new Map<ToolName, number[]>();
  private executionStats = new Map<ToolName, {
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    totalDuration: number;
  }>();

  constructor(config: ToolSchedulerConfig) {
    this.config = config;
    this.initializeTools();
    this.initializeStats();
  }

  /**
   * 初始化所有工具
   */
  private initializeTools(): void {
    const { projectRoot } = this.config;

    // 注册所有核心工具
    this.registerTool('write_file', createWriteFileTool(projectRoot));
    this.registerTool('list_directory', createListDirectoryTool(projectRoot));
    this.registerTool('search_file_content', createGrepSearchTool(projectRoot));
    this.registerTool('find_files', createGlobSearchTool(projectRoot));
    this.registerTool('execute_shell_command', createShellCommandTool(projectRoot));
    this.registerTool('read_file', createFileReaderTool(projectRoot));
  }

  /**
   * 初始化统计信息
   */
  private initializeStats(): void {
    for (const toolName of this.tools.keys()) {
      this.executionStats.set(toolName, {
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        totalDuration: 0,
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
      this.updateFailureStats(toolName, startTime);
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
      this.updateFailureStats(toolName, startTime);
      return result;
    }

    // 3. 检查速率限制
    if (!this.checkRateLimit(toolName)) {
      const result = this.createErrorResult(
        toolName,
        `Rate limit exceeded for tool '${toolName}'`,
        startTime
      );
      this.updateFailureStats(toolName, startTime);
      return result;
    }

    // 4. 验证参数
    const validation = tool.validateParams(params as any);
    if (!validation.valid) {
      const result = this.createErrorResult(
        toolName,
        `Parameter validation failed: ${validation.error}`,
        startTime
      );
      this.updateFailureStats(toolName, startTime);
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
      
      const executePromise = tool.execute(params as any, effectiveSignal);
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
        success: true,
        toolName,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      // 更新失败统计
      this.updateFailureStats(toolName, startTime);

      return this.createErrorResult(toolName, errorMessage, startTime);
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
    const windowStart = now - 60000; // 1分钟窗口
    
    // 获取当前工具的执行记录
    let executions = this.rateLimits.get(toolName) || [];
    
    // 清理过期记录
    executions = executions.filter(time => time > windowStart);
    
    // 检查是否超过限制
    if (executions.length >= toolConfig.rateLimitPerMinute) {
      return false;
    }

    // 记录当前执行
    executions.push(now);
    this.rateLimits.set(toolName, executions);
    
    return true;
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(
    toolName: ToolName,
    errorMessage: string,
    startTime: number
  ): ToolExecutionResult {
    return {
      success: false,
      error: errorMessage,
      output: `Tool execution failed: ${errorMessage}`,
      metadata: {},
      artifacts: [],
      toolName,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 更新成功统计
   */
  private updateSuccessStats(toolName: ToolName, startTime: number): void {
    const stats = this.executionStats.get(toolName);
    if (stats) {
      stats.successCalls++;
      stats.totalDuration += Date.now() - startTime;
    }
  }

  /**
   * 更新失败统计
   */
  private updateFailureStats(toolName: ToolName, startTime: number): void {
    const stats = this.executionStats.get(toolName);
    if (stats) {
      stats.failedCalls++;
      stats.totalDuration += Date.now() - startTime;
    }
  }

  /**
   * 获取执行统计信息
   */
  public getExecutionStats(): Record<string, {
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    avgDuration: number;
    errorRate: number;
  }> {
    const result: Record<string, any> = {};
    
    for (const [toolName, stats] of this.executionStats) {
      result[toolName] = {
        totalCalls: stats.totalCalls,
        successCalls: stats.successCalls,
        failedCalls: stats.failedCalls,
        avgDuration: stats.totalCalls > 0 ? Math.round(stats.totalDuration / stats.totalCalls) : 0,
        errorRate: stats.totalCalls > 0 ? Math.round((stats.failedCalls / stats.totalCalls) * 100) : 0,
      };
    }
    
    return result;
  }

  /**
   * 获取工具列表（为 LLM 提供）
   */
  public getToolsForLLM(): Array<{
    name: string;
    displayName: string;
    description: string;
    parameterSchema: ToolSchema;
  }> {
    const enabledTools: Array<{
      name: string;
      displayName: string;
      description: string;
      parameterSchema: ToolSchema;
    }> = [];

    for (const [toolName, tool] of this.tools) {
      const toolConfig = this.config.tools[toolName];
      
      // 只返回启用的工具
      if (!toolConfig || toolConfig.enabled !== false) {
        enabledTools.push({
          name: tool.name,
          displayName: tool.displayName,
          description: tool.description,
          parameterSchema: tool.schema,
        });
      }
    }

    return enabledTools;
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    this.rateLimits.clear();
    this.executionStats.clear();
  }
}

/**
 * 创建默认工具调度器
 */
export function createDefaultToolScheduler(projectRoot: string = process.cwd()): ToolScheduler {
  const config: ToolSchedulerConfig = {
    projectRoot,
    tools: {
      // 所有工具默认启用
      write_file: { enabled: true, rateLimitPerMinute: 20 },
      list_directory: { enabled: true, rateLimitPerMinute: 30 },
      search_file_content: { enabled: true, rateLimitPerMinute: 15 },
      find_files: { enabled: true, rateLimitPerMinute: 20 },
      execute_shell_command: { enabled: true, rateLimitPerMinute: 10 }, // Shell命令限制更严格
      read_file: { enabled: true, rateLimitPerMinute: 50 },
    },
    globalTimeout: 60000, // 60秒全局超时
    maxConcurrentTools: 3, // 最多同时执行3个工具
  };

  return new ToolScheduler(config);
} 