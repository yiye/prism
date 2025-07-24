/**
 * Agent 统一配置服务
 * 🌟 支持配置文件 + 环境变量的灵活配置方式
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 配置文件路径
export const PRISM_CONFIG_DIR = path.join(os.homedir(), '.prism');
export const PRISM_CONFIG_FILE = path.join(PRISM_CONFIG_DIR, 'config.json');

export interface ClaudeConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AgentGlobalConfig {
  claude: ClaudeConfig;
  session: {
    timeout?: number; // 会话超时时间（毫秒）
    maxSessions?: number; // 最大会话数
    cleanupInterval?: number; // 清理间隔（毫秒）
  };
  tools: {
    enabled?: string[]; // 启用的工具列表
    projectRoot?: string; // 默认项目根目录
  };
  logging: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    enableConsole?: boolean;
  };
}

// 默认配置
const DEFAULT_CONFIG: AgentGlobalConfig = {
  claude: {
    apiKey: '',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 4096,
    temperature: 0.7,
  },
  session: {
    timeout: 30 * 60 * 1000, // 30分钟
    maxSessions: 50,
    cleanupInterval: 5 * 60 * 1000, // 5分钟
  },
  tools: {
    enabled: ['file_reader', 'code_analyzer'],
    projectRoot: process.cwd(),
  },
  logging: {
    level: 'info',
    enableConsole: true,
  },
};

/**
 * Agent 配置管理器
 */
export class AgentConfigManager {
  private config: AgentGlobalConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || PRISM_CONFIG_FILE;
    this.config = this.loadConfig();
  }

  /**
   * 加载配置
   * 优先级：环境变量 > 配置文件 > 默认配置
   */
  private loadConfig(): AgentGlobalConfig {
    // 1. 从默认配置开始
    let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AgentGlobalConfig;

    // 2. 尝试加载配置文件
    if (fs.existsSync(this.configPath)) {
      try {
        const fileConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        config = this.mergeConfigs(config, fileConfig);
        console.log(`📄 Loaded config from: ${this.configPath}`);
      } catch (error) {
        console.warn(`⚠️ Failed to load config file: ${error}`);
      }
    }

    // 3. 环境变量覆盖
    config = this.applyEnvironmentVariables(config);

    // 4. 验证配置
    this.validateConfig(config);

    return config;
  }

  /**
   * 应用环境变量
   */
  private applyEnvironmentVariables(config: AgentGlobalConfig): AgentGlobalConfig {
    const env = process.env;

    // Claude 配置
    if (env.ANTHROPIC_API_KEY) {
      config.claude.apiKey = env.ANTHROPIC_API_KEY;
    }
    if (env.CLAUDE_BASE_URL) {
      config.claude.baseUrl = env.CLAUDE_BASE_URL;
    }
    if (env.CLAUDE_MODEL) {
      config.claude.model = env.CLAUDE_MODEL;
    }
    if (env.CLAUDE_MAX_TOKENS) {
      const maxTokens = parseInt(env.CLAUDE_MAX_TOKENS, 10);
      if (!isNaN(maxTokens)) {
        config.claude.maxTokens = maxTokens;
      }
    }
    if (env.CLAUDE_TEMPERATURE) {
      const temperature = parseFloat(env.CLAUDE_TEMPERATURE);
      if (!isNaN(temperature)) {
        config.claude.temperature = temperature;
      }
    }

    // 会话配置
    if (env.AGENT_SESSION_TIMEOUT) {
      const timeout = parseInt(env.AGENT_SESSION_TIMEOUT, 10);
      if (!isNaN(timeout)) {
        config.session.timeout = timeout;
      }
    }
    if (env.AGENT_MAX_SESSIONS) {
      const maxSessions = parseInt(env.AGENT_MAX_SESSIONS, 10);
      if (!isNaN(maxSessions)) {
        config.session.maxSessions = maxSessions;
      }
    }

    // 工具配置
    if (env.AGENT_PROJECT_ROOT) {
      config.tools.projectRoot = env.AGENT_PROJECT_ROOT;
    }

    // 日志配置
    if (env.AGENT_LOG_LEVEL) {
      const level = env.AGENT_LOG_LEVEL.toLowerCase();
      if (['debug', 'info', 'warn', 'error'].includes(level)) {
        config.logging.level = level as 'debug' | 'info' | 'warn' | 'error';
      }
    }

    return config;
  }

  /**
   * 合并配置对象
   */
  private mergeConfigs(base: AgentGlobalConfig, override: Partial<AgentGlobalConfig>): AgentGlobalConfig {
    return {
      claude: { ...base.claude, ...override.claude },
      session: { ...base.session, ...override.session },
      tools: { ...base.tools, ...override.tools },
      logging: { ...base.logging, ...override.logging },
    };
  }

  /**
   * 验证配置
   */
  private validateConfig(config: AgentGlobalConfig): void {
    const errors: string[] = [];

    // 验证 Claude 配置
    if (!config.claude.apiKey) {
      errors.push('Claude API key is required (set ANTHROPIC_API_KEY or configure in config file)');
    }

    if (config.claude.temperature !== undefined && 
        (config.claude.temperature < 0 || config.claude.temperature > 1)) {
      errors.push('Claude temperature must be between 0 and 1');
    }

    if (config.claude.maxTokens !== undefined && config.claude.maxTokens < 1) {
      errors.push('Claude maxTokens must be greater than 0');
    }

    // 验证会话配置
    if (config.session.timeout !== undefined && config.session.timeout < 1000) {
      errors.push('Session timeout must be at least 1000ms');
    }

    if (config.session.maxSessions !== undefined && config.session.maxSessions < 1) {
      errors.push('Max sessions must be greater than 0');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * 获取 Claude 配置
   */
  getClaudeConfig(): ClaudeConfig {
    return { ...this.config.claude };
  }

  /**
   * 获取会话配置
   */
  getSessionConfig() {
    return { ...this.config.session };
  }

  /**
   * 获取工具配置
   */
  getToolsConfig() {
    return { ...this.config.tools };
  }

  /**
   * 获取日志配置
   */
  getLoggingConfig() {
    return { ...this.config.logging };
  }

  /**
   * 获取完整配置
   */
  getAllConfig(): AgentGlobalConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * 保存配置到文件
   */
  saveConfig(config: Partial<AgentGlobalConfig>): void {
    // 确保配置目录存在
    if (!fs.existsSync(PRISM_CONFIG_DIR)) {
      fs.mkdirSync(PRISM_CONFIG_DIR, { recursive: true });
    }

    // 合并配置
    const newConfig = this.mergeConfigs(this.config, config);
    
    // 验证新配置
    this.validateConfig(newConfig);

    // 保存到文件
    fs.writeFileSync(this.configPath, JSON.stringify(newConfig, null, 2), 'utf8');
    
    // 更新内存中的配置
    this.config = newConfig;

    console.log(`💾 Saved config to: ${this.configPath}`);
  }

  /**
   * 重新加载配置
   */
  reloadConfig(): void {
    this.config = this.loadConfig();
    console.log('🔄 Configuration reloaded');
  }

  /**
   * 检查配置健康状态
   */
  healthCheck(): {
    status: 'healthy' | 'warning' | 'error';
    checks: Array<{
      name: string;
      status: 'ok' | 'warning' | 'error';
      message: string;
    }>;
  } {
    const checks = [];
    let overallStatus: 'healthy' | 'warning' | 'error' = 'healthy';

    // 检查 API Key
    if (this.config.claude.apiKey) {
      checks.push({
        name: 'Claude API Key',
        status: 'ok' as const,
        message: 'API key is configured'
      });
    } else {
      checks.push({
        name: 'Claude API Key',
        status: 'error' as const,
        message: 'API key is missing'
      });
      overallStatus = 'error';
    }

    // 检查配置文件
    if (fs.existsSync(this.configPath)) {
      checks.push({
        name: 'Config File',
        status: 'ok' as const,
        message: `Found at ${this.configPath}`
      });
    } else {
      checks.push({
        name: 'Config File',
        status: 'warning' as const,
        message: 'Using environment variables and defaults'
      });
      if (overallStatus === 'healthy') overallStatus = 'warning';
    }

    // 检查网络配置
    try {
      new URL(this.config.claude.baseUrl || '');
      checks.push({
        name: 'Base URL',
        status: 'ok' as const,
        message: `Valid URL: ${this.config.claude.baseUrl}`
      });
    } catch {
      checks.push({
        name: 'Base URL',
        status: 'error' as const,
        message: 'Invalid base URL'
      });
      overallStatus = 'error';
    }

    return { status: overallStatus, checks };
  }
}

// 全局单例实例
let globalConfigManager: AgentConfigManager | null = null;

/**
 * 获取全局配置管理器
 */
export function getGlobalConfigManager(): AgentConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new AgentConfigManager();
  }
  return globalConfigManager;
}

/**
 * 重置全局配置管理器
 */
export function resetGlobalConfigManager(): void {
  globalConfigManager = null;
}

/**
 * 快捷方法：获取 Claude 配置
 */
export function getClaudeConfig(): ClaudeConfig {
  return getGlobalConfigManager().getClaudeConfig();
} 