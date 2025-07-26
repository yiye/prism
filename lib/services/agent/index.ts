/**
 * Agent Service - 统一的 Agent 服务接口
 * 🎯 整合会话管理、工具调度、流式通信的完整服务
 * 重构后架构：提供 route.ts 需要的统一 API
 */

import type {
  AgentOptions,
  StreamEvent,
} from '@/types';

import { getGlobalConfigManager } from '../../config/agent-config';
import {
  CodeReviewAgent,
  createCodeReviewAgent,
} from './core/agent';
import { buildContextualPrompt } from './prompt';
// Tool System Imports
import { createEnhancedCodeReviewToolRegistry } from './tools/tool-registry';
import { createDefaultToolScheduler } from './tools/tool-scheduler';

// === 会话管理相关类型 ===
export interface SessionConfig {
  apiKey?: string;
  model?: string;
  projectPath?: string;
  userMemory?: string;
  customInstructions?: string;
}

export interface AgentSession {
  id: string;
  agent: CodeReviewAgent;
  createdAt: number;
  lastActivity: number;
  projectPath: string;
  userMemory?: string;
  customInstructions?: string;
  sseController?: ReadableStreamDefaultController;
}

export interface SSEEvent {
  type: 'connected' | 'thinking' | 'tool_start' | 'tool_progress' | 'tool_complete' | 'response' | 'complete' | 'error';
  data: Record<string, unknown>;
}

// === API 响应类型 ===
export interface ServiceResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  sessionId?: string;
}

export interface ProcessMessageResponse {
  content: string;
  toolCalls: Record<string, unknown>[];
  metadata: {
    model: string;
    tokensUsed: number;
  };
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Array<{
    name: string;
    status: 'ok' | 'warning' | 'error';
    message: string;
  }>;
}

/**
 * 统一的 Agent 服务类
 * 🎯 提供 route.ts 需要的所有 API
 */
export class AgentService {
  private sessions = new Map<string, AgentSession>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // 每30分钟清理过期会话
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 30 * 60 * 1000);
  }

  /**
   * 创建或获取会话 - route.ts 使用的 API
   */
  async createOrGetSession(
    config: SessionConfig, 
    existingSessionId?: string
  ): Promise<ServiceResponse<{ sessionId: string }>> {
    try {
      // 如果提供了现有会话ID，尝试获取
      if (existingSessionId) {
        const session = this.getSession(existingSessionId);
        if (session) {
          return {
            success: true,
            sessionId: existingSessionId,
            data: { sessionId: existingSessionId }
          };
        }
      }

      // 创建新会话
      const sessionId = await this.createSession(config);
      return {
        success: true,
        sessionId,
        data: { sessionId }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create session'
      };
    }
  }

  /**
   * 处理单条消息 - route.ts 使用的 API
   */
  async processMessage(
    sessionId: string, 
    message: string
  ): Promise<ServiceResponse<ProcessMessageResponse>> {
    const session = this.getSession(sessionId);
    if (!session) {
      return {
        success: false,
        error: 'Session not found'
      };
    }

    try {
      // 收集流式响应为单个结果
      let finalContent = '';
      const toolCalls: Record<string, unknown>[] = [];
      let tokensUsed = 0;

      const agentStream = session.agent.processMessageStream(message);
      
      for await (const event of agentStream) {
        if (event.type === 'response' && event.data.content) {
          finalContent += event.data.content;
        }
        if (event.type === 'tool_complete' && event.data.toolCall) {
          toolCalls.push(event.data.toolCall as unknown as Record<string, unknown>);
        }
        if (event.type === 'complete') {
          // 获取最终统计信息
          const stats = session.agent.getToolStats();
          tokensUsed = stats.totalTools; // 暂时用工具数量代替
          break;
        }
      }

      return {
        success: true,
        data: {
          content: finalContent || 'Response completed',
          toolCalls,
          metadata: {
            model: 'claude-3-5-sonnet-20241022',
            tokensUsed
          }
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process message'
      };
    }
  }

  /**
   * 流式处理消息 - route.ts SSE 使用的 API
   */
  async *processMessageStream(
    sessionId: string,
    message: string
  ): AsyncGenerator<SSEEvent, void, unknown> {
    const session = this.getSession(sessionId);
    if (!session) {
      yield {
        type: 'error',
        data: { error: 'Session not found', sessionId },
      };
      return;
    }

    try {
      // 发送连接事件
      yield {
        type: 'connected',
        data: { sessionId, timestamp: Date.now() },
      };

      // 获取 Agent 流式响应
      const agentStream = session.agent.processMessageStream(message);
      
      for await (const event of agentStream) {
        // 转换 Agent 事件为 SSE 事件
        const sseEvent = this.convertAgentEventToSSE(event, sessionId);
        yield sseEvent;
        
        // 如果是完成事件，添加最终状态
        if (event.type === 'complete') {
          yield {
            type: 'complete',
            data: { 
              sessionId, 
              timestamp: Date.now(),
              toolStats: session.agent.getToolStats(),
            },
          };
          break;
        }
      }

    } catch (error) {
      console.error(`Error in session ${sessionId}:`, error);
      yield {
        type: 'error',
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
          sessionId,
        },
      };
    }
  }

  /**
   * 设置 SSE 控制器 - route.ts 使用的 API
   */
  setSSEController(
    sessionId: string,
    controller: ReadableStreamDefaultController
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.sseController = controller;
    }
  }

  /**
   * 健康检查 - route.ts 使用的 API
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const checks = [];
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // 检查会话管理器状态
    const activeSessions = this.getActiveSessions().length;
    checks.push({
      name: 'session_manager',
      status: 'ok' as const,
      message: `${activeSessions} active sessions`
    });

    // 检查工具注册表状态
    try {
      const toolRegistry = createEnhancedCodeReviewToolRegistry(process.cwd());
      const toolCount = toolRegistry.list().length;
      checks.push({
        name: 'tool_registry',
        status: 'ok' as const,
        message: `${toolCount} tools registered`
      });
    } catch (error) {
      overallStatus = 'degraded';
      checks.push({
        name: 'tool_registry',
        status: 'warning' as const,
        message: `Tool registry warning: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    return {
      status: overallStatus,
      checks
    };
  }

  // === 内部方法 ===

  /**
   * 创建新的 Agent 会话
   */
  private async createSession(config: SessionConfig): Promise<string> {
    const sessionId = this.generateSessionId();
    const projectPath = config.projectPath || process.cwd();

    try {
      // 获取配置管理器
      const configManager = getGlobalConfigManager();
      const globalConfig = configManager.getAllConfig();

      // 构建系统 Prompt
      const systemPrompt = await buildContextualPrompt(projectPath, {
        userMemory: config.userMemory,
        customInstructions: config.customInstructions,
      });

      // 创建工具注册表和调度器
      const toolRegistry = createEnhancedCodeReviewToolRegistry(projectPath);
      const toolScheduler = createDefaultToolScheduler(projectPath);

      // 创建 Agent 实例
      const agentOptions: AgentOptions = {
        apiKey: config.apiKey,
        model: config.model || globalConfig.claude.model,
        maxTokens: globalConfig.claude.maxTokens,
        temperature: globalConfig.claude.temperature,
        systemPrompt,
        projectRoot: projectPath,
        maxTurns: 50,
      };

      const agent = createCodeReviewAgent(agentOptions, toolRegistry, toolScheduler);

      // 创建会话对象
      const session: AgentSession = {
        id: sessionId,
        agent,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        projectPath,
        userMemory: config.userMemory,
        customInstructions: config.customInstructions,
      };

      this.sessions.set(sessionId, session);

      console.log(`📅 Created agent session: ${sessionId} with ToolScheduler`);
      return sessionId;

    } catch (error) {
      console.error('Failed to create agent session:', error);
      throw new Error(`Failed to create agent session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 获取会话
   */
  private getSession(sessionId: string): AgentSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session;
  }

  /**
   * 转换 Agent 事件为 SSE 事件
   */
  private convertAgentEventToSSE(event: StreamEvent, sessionId: string): SSEEvent {
    return {
      type: event.type as SSEEvent['type'],
      data: {
        ...event.data,
        sessionId,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * 获取所有活跃会话
   */
  private getActiveSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 清理过期会话（超过30分钟无活动）
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000;
    
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > thirtyMinutes) {
        console.log(`🧹 Cleaning up expired session: ${sessionId}`);
        this.deleteSession(sessionId);
      }
    }
  }

  /**
   * 删除会话
   */
  private deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      // 取消正在进行的操作
      session.agent.cancel();
      
      // 关闭 SSE 连接
      if (session.sseController) {
        try {
          session.sseController.close();
        } catch (error) {
          console.warn(`Failed to close SSE controller for session ${sessionId}:`, error);
        }
      }
      
      this.sessions.delete(sessionId);
      console.log(`🗑️ Deleted session: ${sessionId}`);
      return true;
    }
    return false;
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 关闭服务
   */
  shutdown(): void {
    // 清理定时器
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // 关闭所有会话
    for (const sessionId of this.sessions.keys()) {
      this.deleteSession(sessionId);
    }
    
    console.log('🔌 Agent Service shutdown complete');
  }
}

// 全局单例实例
let globalAgentService: AgentService | null = null;

/**
 * 获取全局 Agent 服务 - route.ts 使用的主要 API
 */
export function getGlobalAgentService(): AgentService {
  if (!globalAgentService) {
    globalAgentService = new AgentService();
  }
  return globalAgentService;
}

/**
 * 重置全局 Agent 服务
 */
export function resetGlobalAgentService(): void {
  if (globalAgentService) {
    globalAgentService.shutdown();
    globalAgentService = null;
  }
}