/**
 * 性能监控器 - Agent 系统性能追踪
 * 🎯 提供性能指标收集和分析能力
 */

import { TimeUtils } from '../utils/agent-utils';

export interface PerformanceMetrics {
  sessionCount: number;
  avgResponseTime: number;
  totalRequests: number;
  errorRate: number;
  memoryUsage: NodeJS.MemoryUsage;
  uptime: number;
}

export interface RequestMetrics {
  sessionId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: string;
}

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private requests: Map<string, RequestMetrics> = new Map();
  private completedRequests: RequestMetrics[] = [];
  private startTime = TimeUtils.now();

  static getInstance(): PerformanceMonitor {
    if (!this.instance) {
      this.instance = new PerformanceMonitor();
    }
    return this.instance;
  }

  /**
   * 开始追踪请求
   */
  startRequest(sessionId: string, requestId: string): void {
    this.requests.set(requestId, {
      sessionId,
      startTime: TimeUtils.now(),
      success: false,
    });
  }

  /**
   * 结束追踪请求
   */
  endRequest(requestId: string, success: boolean = true, error?: string): void {
    const request = this.requests.get(requestId);
    if (!request) return;

    const endTime = TimeUtils.now();
    const completedRequest: RequestMetrics = {
      ...request,
      endTime,
      duration: endTime - request.startTime,
      success,
      error,
    };

    this.completedRequests.push(completedRequest);
    this.requests.delete(requestId);

    // 保持最近1000条记录
    if (this.completedRequests.length > 1000) {
      this.completedRequests.shift();
    }
  }

  /**
   * 获取性能指标
   */
  getMetrics(activeSessions: number): PerformanceMetrics {
    const totalRequests = this.completedRequests.length;
    const successfulRequests = this.completedRequests.filter(r => r.success).length;
    const avgResponseTime = totalRequests > 0 
      ? this.completedRequests.reduce((sum, r) => sum + (r.duration || 0), 0) / totalRequests
      : 0;

    return {
      sessionCount: activeSessions,
      avgResponseTime: Math.round(avgResponseTime),
      totalRequests,
      errorRate: totalRequests > 0 ? (totalRequests - successfulRequests) / totalRequests : 0,
      memoryUsage: process.memoryUsage(),
      uptime: TimeUtils.now() - this.startTime,
    };
  }

  /**
   * 重置统计数据
   */
  reset(): void {
    this.requests.clear();
    this.completedRequests = [];
    this.startTime = TimeUtils.now();
  }
} 