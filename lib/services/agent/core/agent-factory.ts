/**
 * Agent 工厂函数
 * 负责创建和配置 Agent 实例
 */

import {
  AgentOptions,
  AgentStats,
} from '../../../../types';
import { getClaudeConfig } from '../../../config/agent-config';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolScheduler } from '../tools/tool-scheduler';
import { CodeReviewAgent } from './agent';
import { AgentLoopExecutor } from './agent-loop';
import { ClaudeClient } from './claude-client';

/**
 * 默认 Agent 配置
 */
export const DEFAULT_AGENT_OPTIONS: Partial<AgentOptions> = {
  model: 'claude-3-5-sonnet-20241022',
  maxTokens: 4096,
  temperature: 0.7,
  maxTurns: 20,
};

/**
 * 创建代码审查 Agent 实例
 */
export function createCodeReviewAgent(
  options: AgentOptions,
  toolRegistry: ToolRegistry,
  toolScheduler: ToolScheduler
): CodeReviewAgent {
  return new CodeReviewAgent(options, toolRegistry, toolScheduler);
}

/**
 * 创建 Agent 配置
 * 合并用户选项和默认配置
 */
export function createAgentConfig(options: AgentOptions) {
  // 获取统一配置
  const globalClaudeConfig = getClaudeConfig();
  
  // 构建最终的 Claude 配置（优先级：options > configOverrides > globalConfig > defaults）
  const claudeConfig = {
    apiKey: options.apiKey || globalClaudeConfig.apiKey,
    model: options.model || options.configOverrides?.model || globalClaudeConfig.model || DEFAULT_AGENT_OPTIONS.model,
    maxTokens: options.maxTokens || options.configOverrides?.maxTokens || globalClaudeConfig.maxTokens || DEFAULT_AGENT_OPTIONS.maxTokens,
    temperature: options.temperature ?? options.configOverrides?.temperature ?? globalClaudeConfig.temperature ?? DEFAULT_AGENT_OPTIONS.temperature,
    baseURL: options.configOverrides?.baseUrl || globalClaudeConfig.baseUrl || 'https://api.anthropic.com',
  };

  // 验证必要配置
  if (!claudeConfig.apiKey) {
    throw new Error('Claude API key is required. Please set ANTHROPIC_API_KEY environment variable or configure it in ~/.code-agent/config.json');
  }

  return claudeConfig;
}

/**
 * 创建 Claude 客户端实例
 */
export function createClaudeClient(options: AgentOptions): ClaudeClient {
  const config = createAgentConfig(options);
  
  return new ClaudeClient({
    apiKey: config.apiKey!,
    model: config.model!,
    maxTokens: config.maxTokens!,
    temperature: config.temperature!,
    baseURL: config.baseURL!,
  });
}

/**
 * 创建 Agent Loop 执行器
 */
export function createAgentLoopExecutor(
  claudeClient: ClaudeClient,
  toolRegistry: ToolRegistry,
  toolScheduler: ToolScheduler
): AgentLoopExecutor {
  return new AgentLoopExecutor(claudeClient, toolRegistry, toolScheduler);
}

/**
 * 生成会话 ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 生成消息 ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 创建默认工具统计信息
 */
export function createDefaultToolStats(toolRegistry: ToolRegistry): AgentStats {
  return {
    totalTools: toolRegistry.list().length,
    enabledTools: toolRegistry.list().length,
    lastExecution: Date.now(),
  };
} 