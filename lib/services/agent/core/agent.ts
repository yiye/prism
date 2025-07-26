/**
 * Code Review Agent - 重构后的简化版本
 * 基于 qwen-code 的 GeminiClient 架构设计
 * 主要负责协调各个组件的工作
 */

import {
  AgentConfig,
  AgentContext,
  AgentError,
  AgentOptions,
  AgentResponse,
  AgentStats,
  Message,
  StreamEvent,
} from '../../../../types';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolScheduler } from '../tools/tool-scheduler';
import {
  createAgentConfig,
  createAgentLoopExecutor,
  createClaudeClient,
  createDefaultToolStats,
  DEFAULT_SYSTEM_PROMPT,
  generateMessageId,
  generateSessionId,
} from './agent-factory';
import { AgentLoopExecutor } from './agent-loop';
import { ClaudeClient } from './claude-client';

/**
 * 代码审查 Agent 主类 - 重构后版本
 * 🎯 核心改进：专注于协调和状态管理，具体执行委托给专门的执行器
 */
export class CodeReviewAgent {
  private claudeClient: ClaudeClient;
  private toolRegistry: ToolRegistry;
  private toolScheduler: ToolScheduler;
  private agentLoopExecutor: AgentLoopExecutor;
  private config: AgentConfig;
  private context: AgentContext;
  private abortController?: AbortController;

  constructor(
    options: AgentOptions, 
    toolRegistry: ToolRegistry,
    toolScheduler: ToolScheduler
  ) {
    // 创建 Claude 客户端
    this.claudeClient = createClaudeClient(options);
    this.toolRegistry = toolRegistry;
    this.toolScheduler = toolScheduler;

    // 创建 Agent Loop 执行器
    this.agentLoopExecutor = createAgentLoopExecutor(
      this.claudeClient,
      toolRegistry,
      toolScheduler
    );

    // 构建 Agent 配置
    const claudeConfig = createAgentConfig(options);
    const systemPrompt = options.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    this.config = {
      model: claudeConfig.model!,
      maxTokens: claudeConfig.maxTokens!,
      temperature: claudeConfig.temperature!,
      tools: toolRegistry.list().map(tool => tool.name),
      systemPrompt,
    };

    // 初始化上下文
    this.context = {
      sessionId: generateSessionId(),
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
        id: generateMessageId(),
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
      };
      this.context.messages.push(userMsg);

      // 委托给 Agent Loop 执行器
      const result = await this.agentLoopExecutor.executeLoop(
        this.context,
        this.config.systemPrompt as string,
        this.abortController
      );
      
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
        id: generateMessageId(),
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
      };
      this.context.messages.push(userMsg);

      // 委托给 Agent Loop 执行器进行流式执行
      yield* this.agentLoopExecutor.executeLoopStream(
        this.context,
        this.config.systemPrompt as string,
        this.abortController
      );

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
  getToolStats(): AgentStats {
    return createDefaultToolStats(this.toolRegistry);
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
 * 重新导出工厂函数以保持向后兼容
 */
export function createCodeReviewAgent(
  options: AgentOptions,
  toolRegistry: ToolRegistry,
  toolScheduler: ToolScheduler
): CodeReviewAgent {
  return new CodeReviewAgent(options, toolRegistry, toolScheduler);
} 