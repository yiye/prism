/**
 * Agent Session Manager
 * 🎯 管理 Agent 会话的生命周期和状态
 * 重构后支持 ToolRegistry + ToolScheduler 架构
 */

import type { StreamEvent } from '../../../types';
import { getGlobalConfigManager } from '../../config/agent-config';
import { buildContextualPrompt } from '../prompt-manager';
import {
  type AgentOptions,
  CodeReviewAgent,
  createCodeReviewAgent,
} from './core/agent';
import {
  createDefaultToolScheduler,
  createEnhancedCodeReviewToolRegistry,
} from './index';

export interface SessionConfig {
  apiKey?: string; // 可选，如果不提供则从配置服务读取
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

/**
 * Agent 会话管理器
 * 🎯 重构后的架构：分离工具发现和执行调度
 */
export class AgentSessionManager {
  private sessions = new Map<string, AgentSession>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // 每30分钟清理过期会话
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 30 * 60 * 1000);
  }

  /**
   * 创建新的 Agent 会话
   * 🎯 重构后：同时创建 ToolRegistry 和 ToolScheduler
   */
  async createSession(config: SessionConfig): Promise<string> {
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

      // 🎯 新架构：创建工具注册表和调度器
      const toolRegistry = createEnhancedCodeReviewToolRegistry(projectPath);
      const toolScheduler = createDefaultToolScheduler(projectPath);

      // 创建 Agent 实例（使用重构后的构造函数）
      const agentOptions: AgentOptions = {
        apiKey: config.apiKey, // 如果没有提供，Agent 会从配置服务读取
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
  getSession(sessionId: string): AgentSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session;
  }

  /**
   * 处理流式消息
   * 🌊 SSE 流式传输思考、工具调用、响应过程
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
              toolStats: session.agent.getToolStats(), // 新增：工具执行统计
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
   * 转换 Agent 事件为 SSE 事件
   */
  private convertAgentEventToSSE(event: StreamEvent, sessionId: string): SSEEvent {
    return {
      type: event.type as any,
      data: {
        ...event.data,
        sessionId,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * 设置 SSE 控制器
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
   * 获取所有活跃会话
   */
  getActiveSessions(): AgentSession[] {
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
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取会话统计信息
   */
  getStats() {
    const sessions = this.getActiveSessions();
    const now = Date.now();
    
    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => now - s.lastActivity < 5 * 60 * 1000).length, // 5分钟内活跃
      oldestSession: sessions.length > 0 ? Math.min(...sessions.map(s => s.createdAt)) : null,
      newestSession: sessions.length > 0 ? Math.max(...sessions.map(s => s.createdAt)) : null,
    };
  }

  /**
   * 关闭管理器
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
    
    console.log('🔌 Agent Session Manager shutdown complete');
  }
}

// 全局单例实例
let globalSessionManager: AgentSessionManager | null = null;

/**
 * 获取全局会话管理器
 */
export function getGlobalSessionManager(): AgentSessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new AgentSessionManager();
  }
  return globalSessionManager;
}

/**
 * 重置全局会话管理器
 */
export function resetGlobalSessionManager(): void {
  if (globalSessionManager) {
    globalSessionManager.shutdown();
    globalSessionManager = null;
  }
} 