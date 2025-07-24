/**
 * Agent Executor - 核心 Agent Loop 执行器
 * 🎯 职责单一：只负责 Agent 的执行流程，不涉及具体业务逻辑
 * 遵循 SRP 原则，从 CodeReviewAgent 中分离出来
 */

import {
  AgentContext,
  AgentError,
  ClaudeResponse,
  Message,
  StreamEvent,
  ToolCall,
} from '../../../../types';
import { ClaudeClient } from './claude-client';
import { MessageProcessor } from './message-processor';
import { ToolOrchestrator } from './tool-orchestrator';

// StreamEvent 现在从 types 中导入

export interface ExecutionResult {
  message: Message;
  completed: boolean;
}

/**
 * Agent 执行器 - 专注于执行流程控制
 */
export class AgentExecutor {
  constructor(
    private claudeClient: ClaudeClient,
    private messageProcessor: MessageProcessor,
    private toolOrchestrator: ToolOrchestrator
  ) {}

  /**
   * 执行 Agent Loop（非流式）
   * 参考原来的 executeAgentLoop 但职责更单一
   */
  async execute(context: AgentContext): Promise<ExecutionResult> {
    let attempts = 0;
    
    while (attempts < context.state.maxTurns) {
      context.state.currentTurn = attempts + 1;
      context.state.status = 'thinking';
      
      try {
        // 构建 Claude 消息
        const claudeMessages = this.messageProcessor.buildClaudeMessages(context.messages);
        
        // 调用 Claude API
        const response = await this.claudeClient.generateContent(
          claudeMessages,
          this.getAvailableTools(context),
          context.config.systemPrompt
        );

        // 处理响应
        const result = await this.processResponse(response, context);
        
        if (result) {
          context.state.status = 'idle';
          return {
            message: result,
            completed: this.isConversationComplete(context),
          };
        }

        attempts++;
      } catch (error) {
        if (attempts >= context.state.maxTurns - 1) {
          context.state.status = 'error';
          throw this.createExecutionError(error);
        }
        console.warn(`Agent loop attempt ${attempts + 1} failed:`, error);
        attempts++;
      }
    }

    throw new Error('Agent loop exceeded maximum turns');
  }

  /**
   * 流式执行 Agent Loop
   */
  async *executeStream(
    context: AgentContext, 
    abortController?: AbortController
  ): AsyncGenerator<StreamEvent, void, unknown> {
    let attempts = 0;
    
    while (attempts < context.state.maxTurns) {
      context.state.currentTurn = attempts + 1;
      context.state.status = 'thinking';
      
      try {
        // 构建 Claude 消息
        const claudeMessages = this.messageProcessor.buildClaudeMessages(context.messages);
        
        yield {
          type: 'thinking',
          data: { content: `Turn ${attempts + 1}: Analyzing your request...` },
        };

        // 流式调用 Claude API
        const responseStream = this.claudeClient.generateContentStream(
          claudeMessages,
          this.getAvailableTools(context),
          context.config.systemPrompt
        );

        // 处理流式响应
        let accumulatedContent = '';
        let pendingToolCalls: ToolCall[] = [];

        for await (const event of responseStream) {
          if (abortController?.signal.aborted) {
            context.state.status = 'error';
            return;
          }

          const streamResult = await this.messageProcessor.processStreamEvent(
            event, 
            accumulatedContent, 
            pendingToolCalls
          );

          if (streamResult.events) {
            for (const streamEvent of streamResult.events) {
              yield streamEvent;
            }
          }

          accumulatedContent = streamResult.content;
          pendingToolCalls = streamResult.toolCalls;
        }

        // 如果有工具调用，执行它们
        if (pendingToolCalls.length > 0) {
          yield* this.toolOrchestrator.executeToolsStream(pendingToolCalls, context, abortController);
        }

        // 如果没有工具调用，返回最终响应
        if (pendingToolCalls.length === 0 && accumulatedContent) {
          const finalMessage = this.messageProcessor.createAssistantMessage(
            accumulatedContent,
            { model: context.config.model }
          );
          
          context.messages.push(finalMessage);
          context.state.status = 'idle';

          yield {
            type: 'response',
            data: { message: finalMessage },
          };

          yield {
            type: 'complete',
            data: { message: finalMessage },
          };

          return;
        }

        attempts++;
      } catch (error) {
        context.state.status = 'error';
        
        yield {
          type: 'error',
          data: { error: this.createExecutionError(error) },
        };

        if (attempts >= context.state.maxTurns - 1) {
          return;
        }
        attempts++;
      }
    }

    context.state.status = 'error';
    yield {
      type: 'error',
      data: { error: this.createExecutionError(new Error('Maximum turns exceeded')) },
    };
  }

  /**
   * 处理 Claude 响应
   */
  private async processResponse(response: ClaudeResponse, context: AgentContext): Promise<Message | null> {
    const processedResponse = this.messageProcessor.processClaudeResponse(response);
    
    // 如果有工具调用，执行它们
    if (processedResponse.toolCalls.length > 0) {
      await this.toolOrchestrator.executeTools(processedResponse.toolCalls, context);
      return null; // 继续循环
    }

    // 如果没有工具调用，返回响应消息
    if (processedResponse.textContent) {
            const assistantMessage = this.messageProcessor.createAssistantMessage(
        processedResponse.textContent,
        {
          model: response.model,
          tokens: {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          },
        }
      );

      context.messages.push(assistantMessage);
      context.state.tokensUsed += response.usage.input_tokens + response.usage.output_tokens;

      return assistantMessage;
    }

    return null;
  }

  /**
   * 获取可用工具
   */
  private getAvailableTools(context: AgentContext) {
    return context.toolRegistry.list();
  }

  /**
   * 检查对话是否完成
   */
  private isConversationComplete(context: AgentContext): boolean {
    return context.state.currentTurn >= context.state.maxTurns ||
           context.messages.length > 100; // 防止过长对话
  }

  /**
   * 创建执行错误
   */
  private createExecutionError(error: unknown): AgentError {
    return {
      code: 'EXECUTION_ERROR',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
      details: {
        type: 'agent_execution',
        originalError: error instanceof Error ? error.stack : undefined,
      },
    };
  }
} 