/**
 * Code Review Agent V2 - 重构版本
 * 🎯 基于高内聚低耦合原则重新设计
 * 🎯 使用分离的组件：AgentExecutor + MessageProcessor + ToolOrchestrator + AgentConfigBuilder
 */

import {
  AgentContext,
  AgentError,
  Message,
  StreamEvent,
  ToolCall,
} from '../../../../types';
import {
  ConfigDrivenToolLoader,
  LoadResult,
  ToolSystemConfig,
} from '../tools/config-driven-loader';
import {
  AgentConfigBuilder,
  AgentOptions,
  BuiltConfig,
} from './agent-config-builder';
import { AgentExecutor } from './agent-executor';
import { ClaudeClient } from './claude-client';
import { MessageProcessor } from './message-processor';
import {
  ToolExecutionContext,
  ToolOrchestrator,
} from './tool-orchestrator';

export interface AgentResponse {
  message: Message;
  context: AgentContext;
  completed: boolean;
}

export interface AgentV2Options extends AgentOptions {
  toolSystemConfig?: Partial<ToolSystemConfig>;
  scenario?: 'development' | 'production' | 'testing';
}

/**
 * 重构后的代码审查 Agent
 * 🎯 遵循 SOLID 原则的新架构设计
 */
export class CodeReviewAgentV2 {
  // 核心组件
  private claudeClient: ClaudeClient;
  private agentExecutor: AgentExecutor;
  private messageProcessor: MessageProcessor;
  private toolOrchestrator: ToolOrchestrator;
  private configBuilder: AgentConfigBuilder;
  
  // 工具系统
  private toolSystemLoader: ConfigDrivenToolLoader;
  private toolSystem?: LoadResult;
  
  // 配置和上下文
  private config: BuiltConfig;
  private context: AgentContext;
  private abortController?: AbortController;

  /**
   * 构造函数 - 使用依赖注入
   * 🎯 所有依赖通过构造函数注入，符合 DIP 原则
   */
  constructor(
    options: AgentV2Options,
    claudeClient?: ClaudeClient,
    agentExecutor?: AgentExecutor,
    messageProcessor?: MessageProcessor,
    toolOrchestrator?: ToolOrchestrator,
    configBuilder?: AgentConfigBuilder,
    toolSystemLoader?: ConfigDrivenToolLoader
  ) {
    // 初始化组件
    this.configBuilder = configBuilder || new AgentConfigBuilder();
    this.messageProcessor = messageProcessor || new MessageProcessor();
    this.toolSystemLoader = toolSystemLoader || new ConfigDrivenToolLoader();
    
    // 初始化配置（此时工具还未加载）
    this.config = this.initializeConfig(options);
    
    // 初始化 Claude 客户端
    this.claudeClient = claudeClient || new ClaudeClient(this.config.claudeConfig);
    
    // 初始化执行器
    this.agentExecutor = agentExecutor || new AgentExecutor(this.config.executorConfig);
    
    // 初始化工具协调器（临时配置，待工具系统加载后更新）
    this.toolOrchestrator = toolOrchestrator || new ToolOrchestrator(
      this.config.orchestratorConfig,
      this.messageProcessor
    );

    // 初始化上下文（临时，待工具系统加载后更新）
    this.context = this.createInitialContext(options);

    console.log(`🤖 CodeReviewAgent V2 initialized with new architecture`);
  }

  /**
   * 异步初始化工具系统
   * 🎯 分离初始化逻辑，支持异步工具加载
   */
  async initialize(options: AgentV2Options): Promise<void> {
    console.log('🔧 Initializing tool system...');
    
    try {
      // 构建工具系统配置
      const toolSystemConfig: ToolSystemConfig = {
        projectRoot: options.projectRoot || process.cwd(),
        ...this.toolSystemLoader.getDefaultConfig(options.scenario || 'development'),
        ...options.toolSystemConfig,
      };

      // 加载工具系统
      this.toolSystem = await this.toolSystemLoader.loadFromConfig(toolSystemConfig);

      // 重新构建配置（现在有工具信息了）
      this.config = this.configBuilder.buildConfig(
        options,
        this.toolSystem.toolRegistry.list()
      );

      // 更新上下文
      this.context = {
        ...this.context,
        toolRegistry: this.toolSystem.toolRegistry,
        config: this.config.agentConfig,
      };

      console.log(`✅ Tool system initialized with ${this.toolSystem.stats.enabledTools} tools`);
      
    } catch (error) {
      console.error('❌ Failed to initialize tool system:', error);
      throw new Error(`Agent initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理用户消息 - 非流式
   * 🎯 委托给 AgentExecutor 处理执行逻辑
   */
  async processMessage(userMessage: string): Promise<AgentResponse> {
    this.ensureInitialized();
    
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

      // 通过 AgentExecutor 执行 Agent Loop
      const result = await this.agentExecutor.executeLoop(
        this.context,
        this.claudeClient,
        this.handleToolCallsNeeded.bind(this)
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
   * 🎯 委托给 AgentExecutor 处理流式执行逻辑
   */
  async *processMessageStream(userMessage: string): AsyncGenerator<StreamEvent, void, unknown> {
    this.ensureInitialized();
    
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

      // 通过 AgentExecutor 流式执行 Agent Loop
      yield* this.agentExecutor.executeLoopStream(
        this.context,
        this.claudeClient,
        this.handleToolCallsNeededStream.bind(this)
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
   * 取消当前操作
   */
  abort(): void {
    this.abortController?.abort();
    this.agentExecutor.abort();
  }

  /**
   * 获取工具使用统计
   */
  getToolStats() {
    return this.toolSystem?.pluginManager.getToolStats();
  }

  /**
   * 获取上下文信息
   */
  getContext(): AgentContext {
    return this.context;
  }

  /**
   * 获取配置信息
   */
  getConfig(): BuiltConfig {
    return this.config;
  }

  // ========== 私有方法 ==========

  /**
   * 初始化配置（工具加载前）
   */
  private initializeConfig(options: AgentV2Options): BuiltConfig {
    // 使用空工具列表初始化配置
    return this.configBuilder.buildConfig(options, []);
  }

  /**
   * 创建初始上下文
   */
  private createInitialContext(options: AgentV2Options): AgentContext {
    return {
      sessionId: this.generateSessionId(),
      messages: [],
      toolRegistry: undefined as any, // 将在初始化后设置
      config: undefined as any, // 将在初始化后设置
      state: {
        status: 'idle',
        currentTurn: 0,
        maxTurns: options.maxTurns || 20,
        tokensUsed: 0,
        lastActivity: Date.now(),
      },
    };
  }

  /**
   * 处理工具调用需求 - 非流式
   * 🎯 委托给 ToolOrchestrator 处理工具执行
   */
  private async handleToolCallsNeeded(toolCalls: ToolCall[]): Promise<void> {
    this.ensureInitialized();

    const executionContext: ToolExecutionContext = {
      sessionId: this.context.sessionId,
      currentTurn: this.context.state.currentTurn,
      abortSignal: this.abortController?.signal,
    };

    await this.toolOrchestrator.executeTools(
      toolCalls,
      this.toolSystem!.toolScheduler,
      this.context,
      executionContext
    );
  }

  /**
   * 处理工具调用需求 - 流式
   * 🎯 委托给 ToolOrchestrator 处理流式工具执行
   */
  private async *handleToolCallsNeededStream(
    toolCalls: ToolCall[]
  ): AsyncGenerator<StreamEvent, void, unknown> {
    this.ensureInitialized();

    const executionContext: ToolExecutionContext = {
      sessionId: this.context.sessionId,
      currentTurn: this.context.state.currentTurn,
      abortSignal: this.abortController?.signal,
    };

    yield* this.toolOrchestrator.executeToolsStream(
      toolCalls,
      this.toolSystem!.toolScheduler,
      this.context,
      executionContext
    );
  }

  /**
   * 确保工具系统已初始化
   */
  private ensureInitialized(): void {
    if (!this.toolSystem) {
      throw new Error('Agent not initialized. Call initialize() first.');
    }
  }

  /**
   * 判断对话是否完成
   */
  private isConversationComplete(): boolean {
    return this.context.state.currentTurn >= this.context.state.maxTurns;
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
   * 创建 Agent 错误
   */
  private createAgentError(error: unknown): AgentError {
    return {
      code: 'AGENT_ERROR',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
      details: error instanceof Error ? { stack: error.stack } : undefined,
    };
  }
}

/**
 * 创建 CodeReviewAgent V2 实例的便捷函数
 * 🎯 简化 Agent 创建和初始化过程
 */
export async function createCodeReviewAgentV2(
  options: AgentV2Options
): Promise<CodeReviewAgentV2> {
  const agent = new CodeReviewAgentV2(options);
  await agent.initialize(options);
  return agent;
}

/**
 * 向后兼容的工厂函数
 * 🎯 兼容原有的 createCodeReviewAgent 接口
 */
export async function createCodeReviewAgent(
  options: AgentOptions,
  // 这些参数在新架构中不再需要，但保留以兼容性
  toolRegistry?: any,
  toolScheduler?: any
): Promise<CodeReviewAgentV2> {
  console.log('ℹ️  Using legacy createCodeReviewAgent interface. Consider migrating to createCodeReviewAgentV2.');
  
  const v2Options: AgentV2Options = {
    ...options,
    scenario: 'development', // 默认开发场景
  };
  
  return await createCodeReviewAgentV2(v2Options);
} 