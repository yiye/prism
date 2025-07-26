/**
 * Agent Service - 统一的 Agent 服务接口
 * 🎯 整合会话管理、工具调度、流式通信的完整服务
 * 重构后架构：提供 route.ts 需要的统一 API
 */

import type {
  AgentOptions,
  StreamEvent,
} from '@/types';

import { FIXED_AGENT_CONFIG } from '../../config/agent-config';
import {
  CodeReviewAgent,
  createCodeReviewAgent,
} from './core/agent';
import { buildContextualPrompt } from './prompt';
// Tool System Imports
import { createEnhancedCodeReviewToolRegistry } from './tools/tool-registry';
import { createDefaultToolScheduler } from './tools/tool-scheduler';
import {
  IdGenerator,
  TimeUtils,
} from './utils/agent-utils';

// === 会话管理相关类型 ===
export interface SessionConfig {
  apiKey?: string;
  baseUrl?: string;
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
 * 会话管理器 - 单一职责：管理 Agent 会话生命周期
 * 🎯 从 AgentService 中提取，符合单一职责原则
 */
class SessionManager {
  private sessions = new Map<string, AgentSession>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, FIXED_AGENT_CONFIG.cleanupInterval);
  }

  /**
   * 创建新的 Agent 会话
   */
  async createSession(config: SessionConfig): Promise<string> {
    const sessionId = this.generateSessionId();
    const projectPath = config.projectPath || process.cwd();

    try {
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
        configOverrides: {
          baseUrl: config.baseUrl,
        },
        systemPrompt,
        projectRoot: projectPath,
        maxTurns: 50,
      };

      const agent = createCodeReviewAgent(agentOptions, toolRegistry, toolScheduler);

      // 创建会话对象
      const session: AgentSession = {
        id: sessionId,
        agent,
        createdAt: TimeUtils.now(),
        lastActivity: TimeUtils.now(),
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
  getSession(sessionId: string): AgentSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = TimeUtils.now();
    }
    return session;
  }

  /**
   * 设置 SSE 控制器
   */
  setSSEController(sessionId: string, controller: ReadableStreamDefaultController): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.sseController = controller;
    }
  }

  /**
   * 获取所有活跃会话
   */
  getActiveSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 删除会话
   */
  deleteSession(sessionId: string): boolean {
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
   * 清理过期会话
   */
  private cleanupExpiredSessions(): void {
    const sessionTimeout = FIXED_AGENT_CONFIG.sessionTimeout;
    
    for (const [sessionId, session] of this.sessions) {
      if (TimeUtils.isExpired(session.lastActivity, sessionTimeout)) {
        console.log(`🧹 Cleaning up expired session: ${sessionId}`);
        this.deleteSession(sessionId);
      }
    }
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return IdGenerator.generateAgentServiceSessionId();
  }

  /**
   * 关闭会话管理器
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    for (const sessionId of this.sessions.keys()) {
      this.deleteSession(sessionId);
    }
  }
}

/**
 * 统一的 Agent 服务类
 * 🎯 重构后：专注于 API 层面的协调
 */
export class AgentService {
  private sessionManager: SessionManager;

  constructor() {
    this.sessionManager = new SessionManager();
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
        const session = this.sessionManager.getSession(existingSessionId);
        if (session) {
          return {
            success: true,
            sessionId: existingSessionId,
            data: { sessionId: existingSessionId }
          };
        }
      }

      // 创建新会话
      const sessionId = await this.sessionManager.createSession(config);
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
    const session = this.sessionManager.getSession(sessionId);
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
            model: FIXED_AGENT_CONFIG.model,
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
    const session = this.sessionManager.getSession(sessionId);
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
        data: { sessionId, timestamp: TimeUtils.now() },
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
              timestamp: TimeUtils.now(),
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
    this.sessionManager.setSSEController(sessionId, controller);
  }

  /**
   * 健康检查 - route.ts 使用的 API
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const checks = [];
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // 检查会话管理器状态
    const activeSessions = this.sessionManager.getActiveSessions().length;
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

  /**
   * 转换 Agent 事件为 SSE 事件
   */
  private convertAgentEventToSSE(event: StreamEvent, sessionId: string): SSEEvent {
    return {
      type: event.type as SSEEvent['type'],
      data: {
        ...event.data,
        sessionId,
        timestamp: TimeUtils.now(),
      },
    };
  }

  /**
   * 关闭服务
   */
  shutdown(): void {
    this.sessionManager.shutdown();
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