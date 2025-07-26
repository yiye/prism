/**
 * Agent 服务专用类型定义
 * 🎯 提高类型安全性，减少类型转换
 */

import { StreamEvent } from '@/types';

/**
 * 强类型的 SSE 事件
 */
export interface TypedSSEEvent {
  type: 'connected' | 'thinking' | 'tool_start' | 'tool_progress' | 'tool_complete' | 'response' | 'complete' | 'error';
  data: {
    sessionId: string;
    timestamp: number;
    content?: string;
    error?: string;
    toolCall?: Record<string, unknown>;
    toolStats?: Record<string, unknown>;
  };
}

/**
 * 会话状态类型
 */
export type SessionStatus = 'creating' | 'active' | 'idle' | 'error' | 'terminated';

/**
 * 服务响应的泛型工厂
 */
export class ServiceResponseFactory {
  static success<T>(data: T, sessionId?: string) {
    return {
      success: true as const,
      data,
      sessionId,
    };
  }

  static error(error: string, sessionId?: string) {
    return {
      success: false as const,
      error,
      sessionId,
    };
  }
}

/**
 * 事件转换器 - 类型安全的事件转换
 */
export class EventConverter {
  static agentToSSE(event: StreamEvent, sessionId: string): TypedSSEEvent {
    return {
      type: event.type as TypedSSEEvent['type'],
      data: {
        sessionId,
        timestamp: Date.now(),
        ...event.data,
      },
    };
  }
} 