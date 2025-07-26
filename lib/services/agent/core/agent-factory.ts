/**
 * Agent 工厂函数
 * 负责创建和配置 Agent 实例
 */

import {
  AgentOptions,
  AgentStats,
} from '../../../../types';
import { getClaudeConfig, FIXED_AGENT_CONFIG } from '../../../config/agent-config';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolScheduler } from '../tools/tool-scheduler';
import { CodeReviewAgent } from './agent';
import { AgentLoopExecutor } from './agent-loop';
import { ClaudeClient } from './claude-client';

/**
 * 默认系统提示
 */
export const DEFAULT_SYSTEM_PROMPT = `你是一个专业的代码审查助手。你可以帮助分析代码、提供改进建议、解释代码逻辑、查找潜在问题等。

请以友好和专业的方式回应用户的请求。当需要使用工具时，请合理选择并正确使用它们。`;

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
 * 使用简化的配置方式
 */
export function createAgentConfig(options: AgentOptions) {
  // 获取简化的配置
  const claudeConfig = getClaudeConfig();
  
  // 构建最终的 Claude 配置（优先级：options > globalConfig > defaults）
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