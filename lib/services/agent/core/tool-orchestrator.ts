/**
 * Tool Orchestrator - 工具协调器
 * 🎯 职责单一：专门负责工具调用的协调和执行
 * 遵循 SRP 原则，从 CodeReviewAgent 中分离出来
 */

import {
  AgentContext,
  AgentError,
  ClaudeMessage,
  StreamEvent,
  ToolCall,
} from '../../../../types';
import {
  type ExecutionOptions,
  ToolScheduler,
} from '../tools/tool-scheduler';
import { ClaudeClient } from './claude-client';
import { MessageProcessor } from './message-processor';

export interface ToolExecutionContext {
  sessionId: string;
  currentTurn: number;
  abortSignal?: AbortSignal;
}

// StreamEvent 现在从 types 中导入

/**
 * 工具协调器 - 专注于工具调用协调
 */
export class ToolOrchestrator {
  constructor(
    private toolScheduler: ToolScheduler,
    private claudeClient: ClaudeClient,
    private messageProcessor: MessageProcessor
  ) {}

  /**
   * 执行工具调用（非流式）
   * 通过 ToolScheduler 执行，享受所有策略控制
   */
  async executeTools(toolCalls: ToolCall[], context: AgentContext): Promise<void> {
    const toolResults: ClaudeMessage[] = [];

    for (const toolCall of toolCalls) {
      try {
        toolCall.status = 'executing';
        toolCall.startTime = Date.now();

        // 通过 ToolScheduler 执行，享受所有策略控制
        const executionOptions: ExecutionOptions = {
          timeout: 30000, // 30秒超时
        };

        const result = await this.toolScheduler.scheduleTool(
          toolCall.tool as never,
          toolCall.params,
          executionOptions
        );

        toolCall.status = result.success ? 'completed' : 'failed';
        toolCall.endTime = Date.now();
        toolCall.result = result;

        if (!result.success) {
          toolCall.error = result.error;
        }

        // 格式化工具结果为 Claude 消息
        const resultMessage = this.claudeClient.formatToolResult(
          toolCall.id, 
          result
        );
        toolResults.push(resultMessage);

      } catch (error) {
        toolCall.status = 'failed';
        toolCall.endTime = Date.now();
        toolCall.error = error instanceof Error ? error.message : String(error);

        // 格式化错误为 Claude 消息
        const errorMessage = this.claudeClient.formatToolError(
          toolCall.id, 
          error instanceof Error ? error : new Error(String(error))
        );
        toolResults.push(errorMessage);
      }
    }

    // 将工具结果添加到消息历史
    const toolResultMessage = this.messageProcessor.createToolResultMessage(toolCalls);
    context.messages.push(toolResultMessage);
  }

  /**
   * 流式执行工具调用
   */
  async *executeToolsStream(
    toolCalls: ToolCall[], 
    context: AgentContext,
    abortController?: AbortController
  ): AsyncGenerator<StreamEvent, void, unknown> {
    
    for (const toolCall of toolCalls) {
      yield {
        type: 'tool_start',
        data: { toolCall },
      };

      try {
        toolCall.status = 'executing';
        toolCall.startTime = Date.now();

        // 通过 ToolScheduler 执行工具
        const executionOptions: ExecutionOptions = {
          signal: abortController?.signal,
          timeout: 30000,
        };

        // 如果工具支持进度更新，可以在这里处理
        yield {
          type: 'tool_progress',
          data: { toolCall, progress: 0.5 },
        };

        const result = await this.toolScheduler.scheduleTool(
          toolCall.tool as never,
          toolCall.params,
          executionOptions
        );

        toolCall.status = result.success ? 'completed' : 'failed';
        toolCall.endTime = Date.now();
        toolCall.result = result;

        if (!result.success) {
          toolCall.error = result.error;
        }

        yield {
          type: 'tool_complete',
          data: { toolCall },
        };

      } catch (error) {
        toolCall.status = 'failed';
        toolCall.endTime = Date.now();
        toolCall.error = error instanceof Error ? error.message : String(error);

        yield {
          type: 'error',
          data: { 
            error: this.createToolError(error, toolCall.tool),
            toolCall,
          },
        };
      }
    }

    // 将工具结果添加到消息历史
    const toolResultMessage = this.messageProcessor.createToolResultMessage(toolCalls);
    context.messages.push(toolResultMessage);
  }

  /**
   * 批量执行工具（并发）
   */
  async executeConcurrentTools(
    toolCalls: ToolCall[], 
    context: AgentContext,
    maxConcurrency: number = 3
  ): Promise<void> {
    // 分批执行工具调用
    const batches = this.createBatches(toolCalls, maxConcurrency);
    
    for (const batch of batches) {
      const promises = batch.map(async (toolCall) => {
        try {
          toolCall.status = 'executing';
          toolCall.startTime = Date.now();

                     const result = await this.toolScheduler.scheduleTool(
             toolCall.tool as never,
             toolCall.params,
             { timeout: 30000 }
           );

          toolCall.status = result.success ? 'completed' : 'failed';
          toolCall.endTime = Date.now();
          toolCall.result = result;

          if (!result.success) {
            toolCall.error = result.error;
          }

        } catch (error) {
          toolCall.status = 'failed';
          toolCall.endTime = Date.now();
          toolCall.error = error instanceof Error ? error.message : String(error);
        }
      });

      // 等待当前批次完成
      await Promise.all(promises);
    }

    // 将工具结果添加到消息历史
    const toolResultMessage = this.messageProcessor.createToolResultMessage(toolCalls);
    context.messages.push(toolResultMessage);
  }

  /**
   * 检查工具是否可用
   */
  isToolAvailable(toolName: string, context: AgentContext): boolean {
    return context.toolRegistry.tools.has(toolName);
  }

  /**
   * 获取工具执行统计
   */
  getExecutionStats(toolCalls: ToolCall[]) {
    const stats = {
      total: toolCalls.length,
      completed: 0,
      failed: 0,
      totalDuration: 0,
      averageDuration: 0,
    };

    for (const call of toolCalls) {
      if (call.status === 'completed') stats.completed++;
      if (call.status === 'failed') stats.failed++;
      
      if (call.startTime && call.endTime) {
        const duration = call.endTime - call.startTime;
        stats.totalDuration += duration;
      }
    }

    stats.averageDuration = stats.total > 0 ? stats.totalDuration / stats.total : 0;

    return stats;
  }

  /**
   * 创建工具错误
   */
  private createToolError(error: unknown, toolName: string): AgentError {
    return {
      code: 'TOOL_EXECUTION_ERROR',
      message: `Tool '${toolName}' execution failed: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: Date.now(),
      details: {
        toolName,
        originalError: error instanceof Error ? error.stack : undefined,
      },
    };
  }

  /**
   * 创建批次
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
} 