/**
 * Code Review Agent - 重构后的简化版本
 * 基于 qwen-code 的 GeminiClient 架构设计
 * 主要负责协调各个组件的工作
 */

import {
  AgentConfig,
  AgentContext,
  AgentOptions,
  AgentResponse,
  AgentStats,
  Message,
  StreamEvent,
} from '@/types';

import {
  FIXED_AGENT_CONFIG,
  getClaudeConfig,
} from '../../../config/agent-config';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolScheduler } from '../tools/tool-scheduler';
import {
  ErrorHandler,
  IdGenerator,
  TimeUtils,
} from '../utils/agent-utils';
import { AgentLoopExecutor } from './agent-loop';
import { ClaudeClient } from './claude-client';

/**
 * 配置工厂 - 统一配置创建和验证逻辑
 * 🎯 提高配置管理的一致性和可维护性
 */
class ConfigFactory {
  /**
   * 创建 Claude 客户端配置
   */
  static createClaudeConfig(options: AgentOptions) {
    const claudeConfig = getClaudeConfig();
    
    const finalConfig = {
      apiKey: options.apiKey || claudeConfig.apiKey,
      baseURL: options.configOverrides?.baseUrl || claudeConfig.baseUrl || 'https://api.anthropic.com',
      model: FIXED_AGENT_CONFIG.model,
      maxTokens: FIXED_AGENT_CONFIG.maxTokens,
      temperature: FIXED_AGENT_CONFIG.temperature,
    };

    // 验证必要配置
    if (!finalConfig.apiKey) {
      throw new Error('Claude API key is required. Please set ANTHROPIC_API_KEY environment variable or configure it in ~/.prism/config.json');
    }

    return finalConfig;
  }

  /**
   * 创建 Agent 配置
   */
  static createAgentConfig(options: AgentOptions, toolRegistry: ToolRegistry): AgentConfig {
    const claudeConfig = this.createClaudeConfig(options);
    
    return {
      model: claudeConfig.model!,
      maxTokens: claudeConfig.maxTokens!,
      temperature: claudeConfig.temperature!,
      tools: toolRegistry.list().map(tool => tool.name),
      systemPrompt: options.systemPrompt,
    };
  }

  /**
   * 创建 Agent 上下文
   */
  static createAgentContext(
    config: AgentConfig, 
    toolRegistry: ToolRegistry,
    options: AgentOptions
  ): AgentContext {
    return {
      sessionId: IdGenerator.generateSessionId(),
      messages: [],
      toolRegistry,
      config,
      state: {
        status: 'idle',
        currentTurn: 0,
        maxTurns: options.maxTurns || 20,
        tokensUsed: 0,
        lastActivity: TimeUtils.now(),
      },
    };
  }
}



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
    // 使用配置工厂创建配置
    const claudeConfig = ConfigFactory.createClaudeConfig(options);
    
    // 创建 Claude 客户端
    this.claudeClient = new ClaudeClient({
      apiKey: claudeConfig.apiKey!,
      model: claudeConfig.model!,
      maxTokens: claudeConfig.maxTokens!,
      temperature: claudeConfig.temperature!,
      baseURL: claudeConfig.baseURL!,
    });
    
    this.toolRegistry = toolRegistry;
    this.toolScheduler = toolScheduler;

    // 创建 Agent Loop 执行器
    this.agentLoopExecutor = new AgentLoopExecutor(
      this.claudeClient,
      toolRegistry,
      toolScheduler
    );

    // 使用配置工厂创建 Agent 配置和上下文
    this.config = ConfigFactory.createAgentConfig(options, toolRegistry);
    this.context = ConfigFactory.createAgentContext(this.config, toolRegistry, options);

    console.log(`🤖 Created Agent with model: ${claudeConfig.model}, scheduler: enabled`);
  }

  /**
   * 处理用户消息（非流式）
   * 参考 qwen-code 的消息处理流程
   */
  async processMessage(userMessage: string): Promise<AgentResponse> {
    try {
      this.context.state.status = 'thinking';
      this.context.state.lastActivity = TimeUtils.now();

      // 添加用户消息到上下文
      const userMsg: Message = {
        id: IdGenerator.generate(),
        role: 'user',
        content: userMessage,
        timestamp: TimeUtils.now(),
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
      throw ErrorHandler.createAgentError(error);
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
        id: IdGenerator.generate(),
        role: 'user',
        content: userMessage,
        timestamp: TimeUtils.now(),
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
        data: { error: ErrorHandler.createAgentError(error) },
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
    return {
      totalTools: this.toolRegistry.list().length,
      enabledTools: this.toolRegistry.list().length,
      lastExecution: Date.now(),
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