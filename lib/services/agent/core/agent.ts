/**
 * Code Review Agent
 * 基于 qwen-code 的 GeminiClient 架构设计
 * 实现完整的 Agent Loop 和工具调度逻辑
 */

import {
  AgentConfig,
  AgentContext,
  AgentError,
  ClaudeContent,
  ClaudeMessage,
  ClaudeStreamEvent,
  Message,
  ToolCall,
} from '../../../../types';
import {
  type ClaudeConfig,
  getClaudeConfig,
} from '../../../config/agent-config';
import { ToolRegistry } from '../tools/tool-registry';
import {
  type ExecutionOptions,
  ToolScheduler,
} from '../tools/tool-scheduler';
import { ClaudeClient } from './claude-client';

export interface AgentOptions {
  apiKey?: string; // 可选，如果不提供则从配置服务读取
  model?: string;
  maxTokens?: number;
  temperature?: number;
  maxTurns?: number;
  systemPrompt?: string;
  projectRoot?: string;
  configOverrides?: Partial<ClaudeConfig>; // 允许覆盖配置
}

export interface AgentResponse {
  message: Message;
  context: AgentContext;
  completed: boolean;
}

export interface StreamEvent {
  type: 'thinking' | 'tool_start' | 'tool_progress' | 'tool_complete' | 'response' | 'complete' | 'error';
  data: {
    content?: string;
    toolCall?: ToolCall;
    progress?: number;
    message?: Message;
    error?: AgentError;
  };
}

/**
 * 代码审查 Agent 主类
 * 🎯 重构架构：分离工具发现和执行调度
 * - ToolRegistry: 工具发现和元数据管理
 * - ToolScheduler: 工具执行调度和策略控制
 */
export class CodeReviewAgent {
  private claudeClient: ClaudeClient;
  private toolRegistry: ToolRegistry;  // 工具发现和元数据
  private toolScheduler: ToolScheduler; // 工具执行调度
  private config: AgentConfig;
  private context: AgentContext;
  private abortController?: AbortController;

  constructor(
    options: AgentOptions, 
    toolRegistry: ToolRegistry,
    toolScheduler: ToolScheduler
  ) {
    // 获取统一配置
    const globalClaudeConfig = getClaudeConfig();
    
    // 构建最终的 Claude 配置（优先级：options > configOverrides > globalConfig）
    const claudeConfig = {
      apiKey: options.apiKey || globalClaudeConfig.apiKey,
      model: options.model || options.configOverrides?.model || globalClaudeConfig.model || 'claude-3-5-sonnet-20241022',
      maxTokens: options.maxTokens || options.configOverrides?.maxTokens || globalClaudeConfig.maxTokens || 4096,
      temperature: options.temperature ?? options.configOverrides?.temperature ?? globalClaudeConfig.temperature ?? 0.7,
      baseURL: options.configOverrides?.baseUrl || globalClaudeConfig.baseUrl || 'https://api.anthropic.com',
    };

    // 验证必要配置
    if (!claudeConfig.apiKey) {
      throw new Error('Claude API key is required. Please set ANTHROPIC_API_KEY environment variable or configure it in ~/.code-agent/config.json');
    }

    // 创建 Claude 客户端
    this.claudeClient = new ClaudeClient({
      apiKey: claudeConfig.apiKey,
      model: claudeConfig.model,
      maxTokens: claudeConfig.maxTokens,
      temperature: claudeConfig.temperature,
      baseURL: claudeConfig.baseURL,
    });

    this.toolRegistry = toolRegistry;
    this.toolScheduler = toolScheduler;

    this.config = {
      model: claudeConfig.model,
      maxTokens: claudeConfig.maxTokens,
      temperature: claudeConfig.temperature,
      tools: toolRegistry.list().map(tool => tool.name),
      systemPrompt: options.systemPrompt || this.getDefaultSystemPrompt(),
    };

    this.context = {
      sessionId: this.generateSessionId(),
      messages: [],
      toolRegistry,
      config: this.config,
      state: {
        status: 'idle',
        currentTurn: 0,
        maxTurns: options.maxTurns || 20,
        tokensUsed: 0,
        lastActivity: Date.now(),
      },
    };

    console.log(`🤖 Created Agent with model: ${claudeConfig.model}, scheduler: enabled`);
  }

  /**
   * 处理用户消息（非流式）
   * 参考 qwen-code 的消息处理流程
   */
  async processMessage(userMessage: string): Promise<AgentResponse> {
    try {
      this.context.state.status = 'thinking';
      this.context.state.lastActivity = Date.now();

      // 添加用户消息到上下文
      const userMsg: Message = {
        id: this.generateMessageId(),
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
      };
      this.context.messages.push(userMsg);

      // 执行 Agent Loop
      const result = await this.executeAgentLoop();
      
      this.context.state.status = 'idle';
      
      return {
        message: result,
        context: this.context,
        completed: this.isConversationComplete(),
      };

    } catch (error) {
      this.context.state.status = 'error';
      throw this.createAgentError(error);
    }
  }

  /**
   * 流式处理用户消息
   * 参考 qwen-code 的流式响应机制
   */
  async *processMessageStream(userMessage: string): AsyncGenerator<StreamEvent, void, unknown> {
    try {
      this.abortController = new AbortController();
      this.context.state.status = 'thinking';
      this.context.state.lastActivity = Date.now();

      yield {
        type: 'thinking',
        data: { content: 'Processing your request...' },
      };

      // 添加用户消息
      const userMsg: Message = {
        id: this.generateMessageId(),
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
      };
      this.context.messages.push(userMsg);

      // 流式执行 Agent Loop
      yield* this.executeAgentLoopStream();

      this.context.state.status = 'idle';

    } catch (error) {
      this.context.state.status = 'error';
      yield {
        type: 'error',
        data: { error: this.createAgentError(error) },
      };
    }
  }

  /**
   * 执行 Agent Loop
   * 参考 qwen-code 的 Turn-based 循环机制
   */
  private async executeAgentLoop(): Promise<Message> {
    let attempts = 0;
    
    while (attempts < this.context.state.maxTurns) {
      this.context.state.currentTurn = attempts + 1;
      
      try {
        // 构建 Claude 消息
        const claudeMessages = this.buildClaudeMessages();
        
        // 调用 Claude API
        const response = await this.claudeClient.generateContent(
          claudeMessages,
          this.getAvailableTools(),
          this.config.systemPrompt
        );

        // 处理响应
        const result = await this.processClaudeResponse(response);
        
        if (result) {
          return result;
        }

        attempts++;
      } catch (error) {
        if (attempts >= this.context.state.maxTurns - 1) {
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
  private async *executeAgentLoopStream(): AsyncGenerator<StreamEvent, void, unknown> {
    let attempts = 0;
    
    while (attempts < this.context.state.maxTurns) {
      this.context.state.currentTurn = attempts + 1;
      
      try {
        // 构建 Claude 消息
        const claudeMessages = this.buildClaudeMessages();
        
        yield {
          type: 'thinking',
          data: { content: `Turn ${attempts + 1}: Analyzing your request...` },
        };

        // 流式调用 Claude API
        const responseStream = this.claudeClient.generateContentStream(
          claudeMessages,
          this.getAvailableTools(),
          this.config.systemPrompt
        );

        // 处理流式响应
        let accumulatedContent = '';
        let pendingToolCalls: ToolCall[] = [];

        for await (const event of responseStream) {
          if (this.abortController?.signal.aborted) {
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
          yield* this.executeToolsStream(pendingToolCalls);
        }

        // 如果没有工具调用，返回最终响应
        if (pendingToolCalls.length === 0 && accumulatedContent) {
          const finalMessage: Message = {
            id: this.generateMessageId(),
            role: 'assistant',
            content: accumulatedContent,
            timestamp: Date.now(),
          };

          this.context.messages.push(finalMessage);

          yield {
            type: 'complete',
            data: { message: finalMessage },
          };
          return;
        }

        attempts++;
      } catch (error) {
        if (attempts >= this.context.state.maxTurns - 1) {
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
  private async processClaudeResponse(response: any): Promise<Message | null> {
    const content = response.content || [];
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    // 解析响应内容
    for (const block of content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          tool: block.name,
          params: block.input,
          status: 'pending',
        });
      }
    }

    // 如果有工具调用，执行它们
    if (toolCalls.length > 0) {
      await this.executeTools(toolCalls);
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

      this.context.messages.push(assistantMessage);
      this.context.state.tokensUsed += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

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
   * 执行工具调用 - 重构后通过 ToolScheduler
   * 🎯 核心改进：使用 ToolScheduler 而非直接调用工具
   */
  private async executeTools(toolCalls: ToolCall[]): Promise<void> {
    const toolResults: ClaudeMessage[] = [];

    for (const toolCall of toolCalls) {
      try {
        toolCall.status = 'executing';
        toolCall.startTime = Date.now();

        // ✅ 通过 ToolScheduler 执行，享受所有策略控制
        const executionOptions: ExecutionOptions = {
          signal: this.abortController?.signal,
          timeout: 30000, // 30秒超时
        };

        const result = await this.toolScheduler.scheduleTool(
          toolCall.tool as any,
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

    this.context.messages.push(toolResultMessage);
  }

  /**
   * 流式执行工具调用 - 重构后通过 ToolScheduler
   */
  private async *executeToolsStream(toolCalls: ToolCall[]): AsyncGenerator<StreamEvent, void, unknown> {
    for (const toolCall of toolCalls) {
      yield {
        type: 'tool_start',
        data: { toolCall },
      };

      try {
        toolCall.status = 'executing';
        toolCall.startTime = Date.now();

        // ✅ 通过 ToolScheduler 执行工具
        const executionOptions: ExecutionOptions = {
          signal: this.abortController?.signal,
          timeout: 30000,
        };

        const result = await this.toolScheduler.scheduleTool(
          toolCall.tool as any,
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
          data: { error: this.createAgentError(error) },
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

    this.context.messages.push(toolResultMessage);
  }

  /**
   * 构建 Claude 消息格式
   */
  private buildClaudeMessages(): ClaudeMessage[] {
    return this.context.messages
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
          return { type: 'text', text: item };
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
    return this.toolRegistry.getAvailableTools();
  }

  /**
   * 检查对话是否完成
   */
  private isConversationComplete(): boolean {
    return this.context.state.currentTurn >= this.context.state.maxTurns ||
           this.context.state.status === 'error';
  }

  /**
   * 取消当前操作
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.context.state.status = 'idle';
  }

  /**
   * 重置 Agent 状态
   */
  reset(): void {
    this.context.messages = [];
    this.context.state = {
      status: 'idle',
      currentTurn: 0,
      maxTurns: this.context.state.maxTurns,
      tokensUsed: 0,
      lastActivity: Date.now(),
    };
  }

  /**
   * 获取当前上下文
   */
  getContext(): AgentContext {
    return { ...this.context };
  }

  /**
   * 获取工具执行统计
   */
  getToolStats() {
    return this.toolScheduler.getExecutionStats();
  }

  /**
   * 获取默认系统提示词
   */
  private getDefaultSystemPrompt(): string {
    return `You are a professional code review assistant specializing in frontend development with React and TypeScript. Your role is to:

1. **Analyze code quality** - Review code for best practices, potential bugs, performance issues, and maintainability
2. **Provide constructive feedback** - Offer specific, actionable suggestions for improvement
3. **Focus on frontend technologies** - Particularly React, TypeScript, JavaScript, CSS, and modern web development practices
4. **Use available tools** - Leverage file reading and code analysis tools to thoroughly examine the codebase
5. **Maintain professionalism** - Provide helpful, respectful feedback that educates and improves code quality

When reviewing code:
- Start by understanding the context and purpose of the code
- Check for common issues: security vulnerabilities, performance problems, code style inconsistencies
- Look for opportunities to improve readability, maintainability, and scalability
- Provide specific examples and explanations for your recommendations
- Suggest concrete improvements with code examples when appropriate

Always use the available tools to read and analyze files before providing feedback.`;
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成消息 ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 创建标准化错误
   */
  private createAgentError(error: unknown): AgentError {
    return {
      code: 'AGENT_ERROR',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
      details: error instanceof Error ? { stack: error.stack } : { error },
    };
  }
}

/**
 * 创建代码审查 Agent 实例 - 重构后的构造函数
 */
export function createCodeReviewAgent(
  options: AgentOptions,
  toolRegistry: ToolRegistry,
  toolScheduler: ToolScheduler
): CodeReviewAgent {
  return new CodeReviewAgent(options, toolRegistry, toolScheduler);
} 