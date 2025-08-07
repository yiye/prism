/**
 * Agent 简化配置服务
 * 🌟 只支持 apiKey 和 baseUrl 配置，其他使用固定默认值
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// 配置文件路径
export const PRISM_CONFIG_DIR = path.join(os.homedir(), ".prism");
export const PRISM_CONFIG_FILE = path.join(PRISM_CONFIG_DIR, "config.json");

// 简化的 Claude 配置，只保留 apiKey 和 baseUrl
export interface ClaudeConfig {
  apiKey: string;
  baseUrl?: string;
}

// 固定的默认配置
export const FIXED_AGENT_CONFIG = {
  model: "claude_sonnet4",
  maxTokens: 16000,
  temperature: 0.7,
  sessionTimeout: 30 * 60 * 1000, // 30分钟
  maxSessions: 50,
  cleanupInterval: 5 * 60 * 1000, // 5分钟
};

// 默认配置
const DEFAULT_CONFIG: ClaudeConfig = {
  apiKey: "",
  baseUrl: "https://api.anthropic.com",
};

/**
 * 简化的 Agent 配置管理器
 */
export class AgentConfigManager {
  private config: ClaudeConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || PRISM_CONFIG_FILE;
    this.config = this.loadConfig();
  }

  /**
   * 加载配置
   * 优先级：环境变量 > 配置文件 > 默认配置
   */
  private loadConfig(): ClaudeConfig {
    // 1. 从默认配置开始
    const config = { ...DEFAULT_CONFIG };

    // 2. 尝试加载配置文件
    if (fs.existsSync(this.configPath)) {
      try {
        const fileConfig = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
        if (fileConfig.apiKey) config.apiKey = fileConfig.apiKey;
        if (fileConfig.baseUrl) config.baseUrl = fileConfig.baseUrl;
        console.log(`📄 Loaded config from: ${this.configPath}`);
      } catch (error) {
        console.warn(`⚠️ Failed to load config file: ${error}`);
      }
    }

    // 3. 环境变量覆盖
    if (process.env.ANTHROPIC_API_KEY) {
      config.apiKey = process.env.ANTHROPIC_API_KEY;
    }
    if (process.env.CLAUDE_BASE_URL) {
      config.baseUrl = process.env.CLAUDE_BASE_URL;
    }

    // 4. 验证配置
    this.validateConfig(config);

    return config;
  }

  /**
   * 验证配置
   */
  private validateConfig(config: ClaudeConfig): void {
    const errors: string[] = [];

    if (!config.apiKey) {
      errors.push(
        "Claude API key is required (set ANTHROPIC_API_KEY or configure in config file)"
      );
    }

    if (config.baseUrl) {
      try {
        new URL(config.baseUrl);
      } catch {
        errors.push("Invalid base URL format");
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join("\n")}`);
    }
  }

  /**
   * 获取 Claude 配置
   */
  getClaudeConfig(): ClaudeConfig {
    return { ...this.config };
  }

  /**
   * 获取完整配置（包含固定配置）
   */
  getAllConfig() {
    return {
      ...this.config,
      ...FIXED_AGENT_CONFIG,
    };
  }

  /**
   * 保存配置到文件
   */
  saveConfig(config: Partial<ClaudeConfig>): void {
    // 确保配置目录存在
    if (!fs.existsSync(PRISM_CONFIG_DIR)) {
      fs.mkdirSync(PRISM_CONFIG_DIR, { recursive: true });
    }

    // 合并配置
    const newConfig = { ...this.config };
    if (config.apiKey !== undefined) newConfig.apiKey = config.apiKey;
    if (config.baseUrl !== undefined) newConfig.baseUrl = config.baseUrl;

    // 验证新配置
    this.validateConfig(newConfig);

    // 保存到文件
    fs.writeFileSync(
      this.configPath,
      JSON.stringify(newConfig, null, 2),
      "utf8"
    );

    // 更新内存中的配置
    this.config = newConfig;

    console.log(`💾 Saved config to: ${this.configPath}`);
  }

  /**
   * 重新加载配置
   */
  reloadConfig(): void {
    this.config = this.loadConfig();
    console.log("🔄 Configuration reloaded");
  }

  /**
   * 检查配置健康状态
   */
  healthCheck(): {
    status: "healthy" | "warning" | "error";
    checks: Array<{
      name: string;
      status: "ok" | "warning" | "error";
      message: string;
    }>;
  } {
    const checks = [];
    let overallStatus: "healthy" | "warning" | "error" = "healthy";

    // 检查 API Key
    if (this.config.apiKey) {
      checks.push({
        name: "Claude API Key",
        status: "ok" as const,
        message: "API key is configured",
      });
    } else {
      checks.push({
        name: "Claude API Key",
        status: "error" as const,
        message: "API key is missing",
      });
      overallStatus = "error";
    }

    // 检查配置文件
    if (fs.existsSync(this.configPath)) {
      checks.push({
        name: "Config File",
        status: "ok" as const,
        message: `Found at ${this.configPath}`,
      });
    } else {
      checks.push({
        name: "Config File",
        status: "warning" as const,
        message: "Using environment variables and defaults",
      });
      if (overallStatus === "healthy") overallStatus = "warning";
    }

    // 检查网络配置
    try {
      new URL(this.config.baseUrl || "");
      checks.push({
        name: "Base URL",
        status: "ok" as const,
        message: `Valid URL: ${this.config.baseUrl}`,
      });
    } catch {
      checks.push({
        name: "Base URL",
        status: "error" as const,
        message: "Invalid base URL",
      });
      overallStatus = "error";
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
