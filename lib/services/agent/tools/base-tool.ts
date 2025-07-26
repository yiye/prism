/**
 * Base Tool Implementation
 * 基于 qwen-code 的 BaseTool 架构设计
 * 提供工具的通用功能和抽象接口
 */

import {
  BaseToolConfig,
  Tool,
  ToolExecutionError,
  ToolResult,
  ToolSchema,
  ValidationResult,
} from '@/types';

// 导出工具参数类型（解决 tool-manager.ts 导入问题）
export type ToolParams = Record<string, unknown>;

// 确保 ToolResult 被正确导出
export type { ToolResult } from '@/types';

/**
 * 抽象基础工具类
 * 参考 qwen-code 的 BaseTool 实现
 */
export abstract class BaseTool<TParams = Record<string, unknown>, TResult extends ToolResult = ToolResult> 
  implements Tool<TParams, TResult> {
  
  public readonly name: string;
  public readonly displayName: string;
  public readonly description: string;
  public readonly schema: ToolSchema;
  public readonly isOutputMarkdown: boolean;
  public readonly canUpdateOutput: boolean;

  constructor(
    config: BaseToolConfig
  ) {
    this.name = config.name;
    this.displayName = config.displayName;
    this.description = config.description;
    this.schema = config.schema;
    this.isOutputMarkdown = config.isOutputMarkdown ?? false;
    this.canUpdateOutput = config.canUpdateOutput ?? false;
  }

  /**
   * 验证工具参数
   * 子类可以重写以提供特定的验证逻辑
   */
  validateParams(params: TParams): ValidationResult {
    try {
      // 基础验证：检查必需字段
      const required = this.schema.required || [];
      for (const field of required) {
        if (!(field in (params as Record<string, unknown>))) {
          return {
            valid: false,
            error: `Missing required parameter: ${field}`,
          };
        }
      }

      // 调用子类特定验证
      const customValidation = this.validateSpecific(params);
      if (!customValidation.valid) {
        return customValidation;
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  /**
   * 检查是否需要用户确认
   * 默认不需要确认，危险操作的工具应该重写此方法
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async shouldConfirm(params: TParams): Promise<boolean> {
    return false;
  }

  /**
   * 执行工具统一入口
   */
  async execute(
    params: TParams, 
    signal: AbortSignal, 
    updateOutput?: (output: string) => void
  ): Promise<TResult> {
    // 验证参数
    const validation = this.validateParams(params);
    if (!validation.valid) {
      throw new ToolExecutionError(
        this.name,
        new Error(validation.error),
        `Parameter validation failed: ${validation.error}`
      );
    }

    // 检查是否被取消
    if (signal.aborted) {
      throw new ToolExecutionError(
        this.name,
        new Error('Operation was cancelled'),
        'Tool execution was aborted'
      );
    }

    try {
      // 执行具体逻辑
      return await this.executeImpl(params, signal, updateOutput);
    } catch (error) {
      if (error instanceof ToolExecutionError) {
        throw error;
      }
      
      throw new ToolExecutionError(
        this.name,
        error instanceof Error ? error : new Error(String(error)),
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取工具描述信息
   * 用于在执行前向用户展示将要执行的操作
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getDescription(params: TParams): string {
    return `${this.displayName}: ${this.description}`;
  }

  /**
   * 子类特定的参数验证
   * 子类可以重写以提供更详细的验证逻辑
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected validateSpecific(params: TParams): ValidationResult {
    return { valid: true };
  }

  /**
   * 工具的具体实现逻辑
   * 所有子类必须实现此方法
   */
  protected abstract executeImpl(
    params: TParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void
  ): Promise<TResult>;

  /**
   * 安全地更新输出
   * 避免过频繁的更新影响性能
   */
  protected updateOutputSafely(
    output: string,
    updateOutput?: (output: string) => void,
    throttleMs = 100
  ): void {
    if (updateOutput) {
      // 简单的节流实现
      if (!this.lastUpdateTime || Date.now() - this.lastUpdateTime > throttleMs) {
        updateOutput(output);
        this.lastUpdateTime = Date.now();
      }
    }
  }

  private lastUpdateTime?: number;

  /**
   * 创建标准的工具结果
   */
  protected createResult(
    output: string,
    metadata?: Record<string, unknown>
  ): TResult {
    return {
      output,
      metadata,
      artifacts: [],
    } as unknown as TResult;
  }

  /**
   * 检查操作是否被取消
   */
  protected checkCancellation(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new ToolExecutionError(
        this.name,
        new Error('Operation was cancelled'),
        'Tool execution was aborted'
      );
    }
  }

  /**
   * 格式化错误信息
   */
  protected formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * 创建进度更新函数
   * 用于长时间运行的工具提供进度反馈
   */
  protected createProgressUpdater(
    updateOutput?: (output: string) => void,
    prefix = ''
  ): (progress: number, status?: string) => void {
    return (progress: number, status?: string) => {
      const progressBar = '█'.repeat(Math.floor(progress * 20)) + 
                         '░'.repeat(20 - Math.floor(progress * 20));
      const percentage = Math.floor(progress * 100);
      const statusText = status ? ` - ${status}` : '';
      const output = `${prefix}[${progressBar}] ${percentage}%${statusText}`;
      
      this.updateOutputSafely(output, updateOutput);
    };
  }
}

/**
 * 只读工具基类
 * 用于不修改系统状态的工具，如文件读取、代码分析等
 */
export abstract class ReadOnlyTool<TParams = Record<string, unknown>, TResult extends ToolResult = ToolResult> 
  extends BaseTool<TParams, TResult> {
  
  constructor(config: BaseToolConfig) {
    super({
      ...config,
      isOutputMarkdown: config.isOutputMarkdown ?? true,
      canUpdateOutput: false,
    });
  }

  // 只读工具永远不需要确认
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async shouldConfirm(params: TParams): Promise<boolean> {
    return false;
  }
}

/**
 * 修改性工具基类
 * 用于可能修改系统状态的工具，如文件写入、命令执行等
 */
export abstract class ModifyingTool<TParams = Record<string, unknown>, TResult extends ToolResult = ToolResult> 
  extends BaseTool<TParams, TResult> {
  
  constructor(config: BaseToolConfig) {
    super({
      ...config,
      isOutputMarkdown: config.isOutputMarkdown ?? false,
      canUpdateOutput: config.canUpdateOutput ?? true,
    });
  }

  // 修改性工具默认需要确认，除非子类明确覆盖
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async shouldConfirm(params: TParams): Promise<boolean> {
    return true;
  }

  /**
   * 检查操作的风险级别
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected assessRisk(params: TParams): 'low' | 'medium' | 'high' {
    return 'medium'; // 默认中等风险
  }

  /**
   * 生成确认消息
   */
  protected generateConfirmationMessage(params: TParams): string {
    const risk = this.assessRisk(params);
    const riskEmoji = {
      low: '✅',
      medium: '⚠️',
      high: '🚨',
    }[risk];

    return `${riskEmoji} ${this.getDescription(params)}`;
  }
}

/**
 * 工具工厂函数
 * 用于创建标准化的工具实例
 */
export function createTool<TParams = Record<string, unknown>, TResult extends ToolResult = ToolResult>(
  config: {
    name: string;
    displayName: string;
    description: string;
    schema: ToolSchema;
    isOutputMarkdown?: boolean;
    canUpdateOutput?: boolean;
    readonly?: boolean;
    executeImpl: (params: TParams, signal: AbortSignal, updateOutput?: (output: string) => void) => Promise<TResult>;
    validateSpecific?: (params: TParams) => ValidationResult;
    shouldConfirm?: (params: TParams) => Promise<boolean>;
  }
): Tool<TParams, TResult> {
  class DynamicTool extends BaseTool<TParams, TResult> {
    constructor() {
      super({
        name: config.name,
        displayName: config.displayName,
        description: config.description,
        schema: config.schema,
        isOutputMarkdown: config.isOutputMarkdown,
        canUpdateOutput: config.canUpdateOutput,
      });
    }

    protected async executeImpl(
      params: TParams,
      signal: AbortSignal,
      updateOutput?: (output: string) => void
    ): Promise<TResult> {
      return config.executeImpl(params, signal, updateOutput);
    }

    protected validateSpecific(params: TParams): ValidationResult {
      return config.validateSpecific ? config.validateSpecific(params) : { valid: true };
    }

    async shouldConfirm(params: TParams): Promise<boolean> {
      if (config.shouldConfirm) {
        return config.shouldConfirm(params);
      }
      return config.readonly ? false : true;
    }
  }
  
  return new DynamicTool();
} 