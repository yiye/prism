/**
 * Agent Config Builder - 配置构建器
 * 🎯 职责单一：专门负责 Agent 配置的构建和验证
 * 遵循 SRP 原则，从 CodeReviewAgent 中分离出来
 */

import {
  AgentConfig,
  ValidationResult,
} from '../../../../types';
import {
  type ClaudeConfig,
  getClaudeConfig,
} from '../../../config/agent-config';

export interface AgentOptions {
  apiKey?: string; // 可选，如果不提供则从配置服务读取
  model?: string;
  maxTokens?: number;
  temperature?: number;
  maxTurns?: number;
  systemPrompt?: string;
  projectRoot?: string;
  configOverrides?: Partial<ClaudeConfig>; // 允许覆盖配置
}

export interface BuiltConfig {
  agentConfig: AgentConfig;
  claudeConfig: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
    baseURL: string;
  };
}

/**
 * Agent 配置构建器 - 专注于配置管理
 */
export class AgentConfigBuilder {
  
  /**
   * 构建完整的 Agent 配置
   */
  buildConfig(options: AgentOptions, availableTools: string[]): BuiltConfig {
    // 获取统一配置
    const globalClaudeConfig = getClaudeConfig();
    
    // 构建最终的 Claude 配置（优先级：options > configOverrides > globalConfig）
    const claudeConfig: BuiltConfig['claudeConfig'] = {
      apiKey: options.apiKey || globalClaudeConfig.apiKey || '',
      model: options.model || globalClaudeConfig.model || 'claude-3-5-sonnet-20241022',
      maxTokens: options.maxTokens || globalClaudeConfig.maxTokens || 4096,
      temperature: options.temperature ?? globalClaudeConfig.temperature ?? 0.7,
      baseURL: globalClaudeConfig.baseUrl || 'https://api.anthropic.com',
    };

    // 构建 Agent 配置
    const agentConfig: AgentConfig = {
      model: claudeConfig.model,
      maxTokens: claudeConfig.maxTokens,
      temperature: claudeConfig.temperature,
      tools: availableTools,
      systemPrompt: options.systemPrompt || this.getDefaultSystemPrompt(),
    };

    return {
      agentConfig,
      claudeConfig,
    };
  }

  /**
   * 验证配置
   */
  validateConfig(claudeConfig: BuiltConfig['claudeConfig'], agentConfig: AgentConfig): ValidationResult {
    const errors: string[] = [];

    // 验证 Claude 配置
    if (!claudeConfig.apiKey) {
      errors.push('Claude API key is required. Please set ANTHROPIC_API_KEY environment variable or configure it in ~/.code-agent/config.json');
    }

    if (!claudeConfig.model) {
      errors.push('Model is required');
    }

    if (claudeConfig.maxTokens <= 0) {
      errors.push('Max tokens must be greater than 0');
    }

    if (claudeConfig.temperature < 0 || claudeConfig.temperature > 1) {
      errors.push('Temperature must be between 0 and 1');
    }

    // 验证 Agent 配置
    if (!agentConfig.tools || agentConfig.tools.length === 0) {
      errors.push('At least one tool must be available');
    }

    if (!agentConfig.systemPrompt || agentConfig.systemPrompt.trim().length === 0) {
      errors.push('System prompt is required');
    }

    if (errors.length > 0) {
      return {
        valid: false,
        error: errors.join('; '),
      };
    }

    return { valid: true };
  }

  /**
   * 合并配置选项
   */
  mergeConfigs(
    base: Partial<ClaudeConfig>, 
    override: Partial<ClaudeConfig>
  ): Partial<ClaudeConfig> {
    return {
      ...base,
      ...override,
    };
  }

  /**
   * 获取配置摘要（用于日志）
   */
  getConfigSummary(claudeConfig: BuiltConfig['claudeConfig'], agentConfig: AgentConfig): string {
    return `Model: ${agentConfig.model}, Tools: ${agentConfig.tools.length}, MaxTokens: ${agentConfig.maxTokens}`;
  }

  /**
   * 检查配置是否已更改
   */
  hasConfigChanged(
    current: BuiltConfig, 
    new_: BuiltConfig
  ): boolean {
    return (
      current.claudeConfig.model !== new_.claudeConfig.model ||
      current.claudeConfig.maxTokens !== new_.claudeConfig.maxTokens ||
      current.claudeConfig.temperature !== new_.claudeConfig.temperature ||
      current.agentConfig.tools.length !== new_.agentConfig.tools.length ||
      current.agentConfig.systemPrompt !== new_.agentConfig.systemPrompt
    );
  }

  /**
   * 创建默认选项
   */
  createDefaultOptions(projectRoot?: string): AgentOptions {
    return {
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 4096,
      temperature: 0.7,
      maxTurns: 20,
      projectRoot: projectRoot || process.cwd(),
      systemPrompt: this.getDefaultSystemPrompt(),
    };
  }

  /**
   * 从环境变量加载配置
   */
  loadFromEnvironment(): Partial<AgentOptions> {
    return {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.CLAUDE_MODEL,
      maxTokens: process.env.CLAUDE_MAX_TOKENS ? parseInt(process.env.CLAUDE_MAX_TOKENS) : undefined,
      temperature: process.env.CLAUDE_TEMPERATURE ? parseFloat(process.env.CLAUDE_TEMPERATURE) : undefined,
    };
  }

  /**
   * 获取默认系统提示词
   */
  private getDefaultSystemPrompt(): string {
    return `You are a professional code review assistant specializing in frontend development with React and TypeScript. Your role is to:

1. **Analyze code quality** - Review code for best practices, potential bugs, performance issues, and maintainability
2. **Provide constructive feedback** - Offer specific, actionable suggestions for improvement
3. **Focus on frontend technologies** - Particularly React, TypeScript, JavaScript, CSS, and modern web development practices
4. **Use available tools** - Leverage file reading and code analysis tools to thoroughly examine the codebase
5. **Maintain professionalism** - Provide helpful, respectful feedback that educates and improves code quality

When reviewing code:
- Start by understanding the context and purpose of the code
- Check for common issues: security vulnerabilities, performance problems, code style inconsistencies
- Look for opportunities to improve readability, maintainability, and scalability
- Provide specific examples and explanations for your recommendations
- Suggest concrete improvements with code examples when appropriate

Always use the available tools to read and analyze files before providing feedback.`;
  }
} 