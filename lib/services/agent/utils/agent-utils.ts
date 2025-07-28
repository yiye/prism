/**
 * Agent 工具类 - 统一公共操作
 * 🎯 消除重复代码，提高代码复用性
 */

import { AgentError } from '@/types';

/**
 * ID 生成器 - 统一 ID 生成逻辑
 */
export class IdGenerator {
  /**
   * 生成唯一ID
   */
  static generate(prefix: string = 'id'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成会话ID
   */
  static generateSessionId(): string {
    return this.generate('session');
  }

  /**
   * 生成 Agent 服务会话ID
   */
  static generateAgentServiceSessionId(): string {
    return this.generate('agent');
  }
}

/**
 * 错误处理器 - 统一错误处理逻辑
 */
export class ErrorHandler {
  /**
   * 创建标准化的 Agent 错误
   */
  static createAgentError(error: unknown, code: string = 'AGENT_ERROR'): AgentError {
    return {
      code,
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
      details: error instanceof Error ? { stack: error.stack } : { error },
    };
  }

  /**
   * 安全的资源清理
   */
  static safeCleanup(cleanupFn: () => void, context: string): void {
    try {
      cleanupFn();
    } catch (error) {
      console.warn(`Failed to cleanup ${context}:`, error);
    }
  }

  /**
   * 包装异步操作并提供统一错误处理
   */
  static async wrapAsync<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.createAgentError(error, 'OPERATION_ERROR');
    }
  }
}

/**
 * 时间工具 - 统一时间相关操作
 */
export class TimeUtils {
  /**
   * 获取当前时间戳
   */
  static now(): number {
    return Date.now();
  }

  /**
   * 检查是否超时
   */
  static isExpired(timestamp: number, timeout: number): boolean {
    return this.now() - timestamp > timeout;
  }

  /**
   * 格式化时间差
   */
  static formatDuration(startTime: number, endTime: number = this.now()): string {
    const duration = endTime - startTime;
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
    return `${(duration / 60000).toFixed(1)}m`;
  }
} 