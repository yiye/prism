/**
 * Agent Loop 执行器
 * 从 agent.ts 中提取的循环执行逻辑
 */

import {
  AgentContext,
  ClaudeContent,
  ClaudeMessage,
  ClaudeResponse,
  ClaudeStreamEvent,
  Message,
  StreamEvent,
  ToolCall,
} from '../../../../types';
import { ToolRegistry } from '../tools/tool-registry';
import {
  type ExecutionOptions,
  ToolScheduler,
} from '../tools/tool-scheduler';
import { ClaudeClient } from './claude-client';

/**
 * Agent Loop 执行器
 * 负责管理 Agent 的循环执行逻辑
 */
export class AgentLoopExecutor {
  constructor(
    private claudeClient: ClaudeClient,
    private toolRegistry: ToolRegistry,
    private toolScheduler: ToolScheduler
  ) {}

  /**
   * 执行 Agent Loop
   * 参考 qwen-code 的 Turn-based 循环机制
   */
  async executeLoop(
    context: AgentContext,
    systemPrompt: string,
    abortController?: AbortController
  ): Promise<Message> {
    let attempts = 0;
    
    while (attempts < context.state.maxTurns) {
      context.state.currentTurn = attempts + 1;
      
             try {
         // 构建 Claude 消息
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         const claudeMessages = this.buildClaudeMessages(context) as any;
         
         // 调用 Claude API
        const response = await this.claudeClient.generateContent(
          claudeMessages,
          this.getAvailableTools(),
          systemPrompt
        );

        // 处理响应
        const result = await this.processClaudeResponse(response, context, abortController);
        
        if (result) {
          return result;
        }

        attempts++;
      } catch (error) {
        if (attempts >= context.state.maxTurns - 1) {
          throw error;
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
  async *executeLoopStream(
    context: AgentContext,
    systemPrompt: string,
    abortController?: AbortController
  ): AsyncGenerator<StreamEvent, void, unknown> {
    let attempts = 0;
    
    while (attempts < context.state.maxTurns) {
      context.state.currentTurn = attempts + 1;
      
             try {
         // 构建 Claude 消息
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         const claudeMessages = this.buildClaudeMessages(context) as any;
         
         yield {
          type: 'thinking',
          data: { content: `Turn ${attempts + 1}: Analyzing your request...` },
        };

        // 流式调用 Claude API
        const responseStream = this.claudeClient.generateContentStream(
          claudeMessages,
          this.getAvailableTools(),
          systemPrompt
        );

        // 处理流式响应
        let accumulatedContent = '';
        let pendingToolCalls: ToolCall[] = [];

        for await (const event of responseStream) {
          if (abortController?.signal.aborted) {
            return;
          }

          const streamResult = await this.processStreamEvent(
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
          yield* this.executeToolsStream(pendingToolCalls, context, abortController);
        }

        // 如果没有工具调用，返回最终响应
        if (pendingToolCalls.length === 0 && accumulatedContent) {
          const finalMessage: Message = {
            id: this.generateMessageId(),
            role: 'assistant',
            content: accumulatedContent,
            timestamp: Date.now(),
          };

          context.messages.push(finalMessage);

          yield {
            type: 'complete',
            data: { message: finalMessage },
          };
          return;
        }

        attempts++;
      } catch (error) {
        if (attempts >= context.state.maxTurns - 1) {
          throw error;
        }
        console.warn(`Stream attempt ${attempts + 1} failed:`, error);
        attempts++;
      }
    }

    throw new Error('Agent loop exceeded maximum turns');
  }

     /**
    * 处理 Claude 响应
    */
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   private async processClaudeResponse(
     response: ClaudeResponse,
    context: AgentContext,
    abortController?: AbortController
  ): Promise<Message | null> {
    const content = response.content || [];
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    // 解析响应内容
    for (const block of content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id || '',
          tool: block.name || '',
          params: block.input || {},
          status: 'pending',
        });
      }
    }

    // 如果有工具调用，执行它们
    if (toolCalls.length > 0) {
      await this.executeTools(toolCalls, context, abortController);
      return null; // 继续循环
    }

    // 如果没有工具调用，返回响应
    if (textContent) {
      const assistantMessage: Message = {
        id: this.generateMessageId(),
        role: 'assistant',
        content: textContent,
        timestamp: Date.now(),
        metadata: {
          model: response.model,
          tokens: {
            input: response.usage?.input_tokens || 0,
            output: response.usage?.output_tokens || 0,
          },
        },
      };

      context.messages.push(assistantMessage);
      context.state.tokensUsed += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

      return assistantMessage;
    }

    return null;
  }

     /**
    * 处理流式事件
    */
   private async processStreamEvent(
     event: ClaudeStreamEvent,
    currentContent: string,
    currentToolCalls: ToolCall[]
  ): Promise<{
    content: string;
    toolCalls: ToolCall[];
    events?: StreamEvent[];
  }> {
    const events: StreamEvent[] = [];

    switch (event.type) {
      case 'content_block_delta':
        if (event.delta?.text) {
          currentContent += event.delta.text;
          events.push({
            type: 'response',
            data: { content: currentContent },
          });
        }
        break;

      case 'content_block_start':
        if (event.content_block?.type === 'tool_use') {
          const contentBlock = event.content_block as Record<string, unknown>;
          const toolCall: ToolCall = {
            id: String(contentBlock.id || ''),
            tool: String(contentBlock.name || ''),
            params: {},
            status: 'pending',
          };
          currentToolCalls.push(toolCall);
          
          events.push({
            type: 'tool_start',
            data: { toolCall },
          });
        }
        break;

      case 'message_stop':
        // 消息结束
        break;
    }

    return {
      content: currentContent,
      toolCalls: currentToolCalls,
      events,
    };
  }

  /**
   * 执行工具调用
   */
  private async executeTools(
    toolCalls: ToolCall[],
    context: AgentContext,
    abortController?: AbortController
  ): Promise<void> {
    const toolResults: ClaudeMessage[] = [];

    for (const toolCall of toolCalls) {
      try {
        toolCall.status = 'executing';
        toolCall.startTime = Date.now();

        const executionOptions: ExecutionOptions = {
          signal: abortController?.signal,
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
    const toolResultMessage: Message = {
      id: this.generateMessageId(),
      role: 'user',
      content: toolResults.map(r => r.content ? String(r.content) : '').join('\n'),
      timestamp: Date.now(),
      metadata: {
        tool_calls: toolCalls,
      },
    };

    context.messages.push(toolResultMessage);
  }

  /**
   * 流式执行工具调用
   */
  private async *executeToolsStream(
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

        const executionOptions: ExecutionOptions = {
          signal: abortController?.signal,
          timeout: 30000,
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
          data: { error: { 
            code: 'TOOL_ERROR',
            message: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          }},
        };
      }
    }

    // 将工具结果添加到消息历史
    const toolResultMessage: Message = {
      id: this.generateMessageId(),
      role: 'user',
      content: toolCalls.map(tc => tc.result?.output || tc.error || 'No result').join('\n'),
      timestamp: Date.now(),
      metadata: { tool_calls: toolCalls },
    };

    context.messages.push(toolResultMessage);
  }

  /**
   * 构建 Claude 消息格式
   */
  private buildClaudeMessages(context: AgentContext): ClaudeMessage[] {
    return context.messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: this.convertMessageContent(msg.content),
      }));
  }

     /**
    * 转换消息内容格式
    */
   private convertMessageContent(content: string | unknown[]): string | ClaudeContent[] {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content.map(item => {
        if (typeof item === 'string') {
          return { type: 'text', text: item } as ClaudeContent;
        }
        return item as ClaudeContent;
      });
    }

    return String(content);
  }

  /**
   * 获取可用工具
   */
  private getAvailableTools() {
    return this.toolRegistry.list();
  }

  /**
   * 生成消息 ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
} 