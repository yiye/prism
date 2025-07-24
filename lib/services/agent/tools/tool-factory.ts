/**
 * Tool Factory - 工具工厂系统
 * 🎯 解决开闭原则 (OCP) 违反问题
 * 支持动态工具创建和插件化扩展
 */

import {
  Tool,
  ToolSchema,
  ValidationResult,
} from '../../../../types';

export interface ToolMetadata {
  name: string;
  displayName: string;
  description: string;
  category: string;
  version: string;
  author?: string;
  dependencies?: string[];
  schema: ToolSchema;
}

export interface ToolConfig {
  projectRoot?: string;
  enabled?: boolean;
  timeout?: number;
  rateLimitPerMinute?: number;
  customOptions?: Record<string, unknown>;
}

/**
 * 工具工厂接口
 * 🎯 每个工具类型实现一个工厂
 */
export interface ToolFactory {
  readonly metadata: ToolMetadata;
  
  /**
   * 创建工具实例
   */
  create(config: ToolConfig): Tool;
  
  /**
   * 验证配置
   */
  validateConfig(config: ToolConfig): ValidationResult;
  
  /**
   * 检查依赖
   */
  checkDependencies(): ValidationResult;
  
  /**
   * 获取默认配置
   */
  getDefaultConfig(): ToolConfig;
}

/**
 * 抽象工具工厂基类
 */
export abstract class BaseToolFactory implements ToolFactory {
  constructor(public readonly metadata: ToolMetadata) {}

  abstract create(config: ToolConfig): Tool;

  validateConfig(config: ToolConfig): ValidationResult {
    const errors: string[] = [];

    if (config.timeout && config.timeout < 1000) {
      errors.push('Timeout must be at least 1000ms');
    }

    if (config.rateLimitPerMinute && config.rateLimitPerMinute < 1) {
      errors.push('Rate limit must be at least 1 per minute');
    }

    if (errors.length > 0) {
      return { valid: false, error: errors.join('; ') };
    }

    return { valid: true };
  }

  checkDependencies(): ValidationResult {
    // 基础实现：检查是否有依赖
    if (this.metadata.dependencies && this.metadata.dependencies.length > 0) {
      // 这里可以添加更复杂的依赖检查逻辑
      return { valid: true };
    }
    return { valid: true };
  }

  getDefaultConfig(): ToolConfig {
    return {
      enabled: true,
      timeout: 30000,
      rateLimitPerMinute: 60,
    };
  }
}

/**
 * 文件操作工具工厂
 */
export class FileOperationToolFactory extends BaseToolFactory {
  constructor() {
    super({
      name: 'file_operations',
      displayName: 'File Operations',
      description: 'Tools for file reading, writing, and directory operations',
      category: 'file_system',
      version: '1.0.0',
      author: 'Agent System',
      schema: {
        type: 'object',
        properties: {
          projectRoot: {
            type: 'string',
            description: 'Project root directory path',
          },
        },
        required: ['projectRoot'],
        description: 'File operation tools configuration',
      },
    });
  }

  create(config: ToolConfig): Tool {
    // TODO: 实现文件工具创建逻辑
    console.log('Creating file operation tool with config:', config);
    throw new Error('File operation tool creation not yet implemented');
  }

  validateConfig(config: ToolConfig): ValidationResult {
    const baseValidation = super.validateConfig(config);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    if (!config.projectRoot) {
      return {
        valid: false,
        error: 'Project root is required for file operations',
      };
    }

    return { valid: true };
  }
}

/**
 * Web 工具工厂
 */
export class WebToolFactory extends BaseToolFactory {
  constructor() {
    super({
      name: 'web_tools',
      displayName: 'Web Tools',
      description: 'Tools for web scraping and API calls',
      category: 'web',
      version: '1.0.0',
      author: 'Agent System',
      schema: {
        type: 'object',
        properties: {
          allowedDomains: {
            type: 'array',
            items: { type: 'string' },
            description: 'Allowed domains for web requests',
          },
          apiKeys: {
            type: 'object',
            description: 'API keys for web services',
            properties: {
              googleApiKey: { type: 'string' },
              bingApiKey: { type: 'string' },
            },
          },
        },
        required: [],
        description: 'Web tools configuration',
      },
    });
  }

  create(config: ToolConfig): Tool {
    // TODO: 实现 Web 工具创建逻辑
    console.log('Creating web tool with config:', config);
    throw new Error('Web tool creation not yet implemented');
  }

  validateConfig(config: ToolConfig): ValidationResult {
    const baseValidation = super.validateConfig(config);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    // Web 工具特定验证
    const customOptions = config.customOptions as Record<string, unknown> || {};
    const allowedDomains = customOptions.allowedDomains as string[] || [];
    
    if (allowedDomains.length > 0) {
      for (const domain of allowedDomains) {
        try {
          new URL(`https://${domain}`);
        } catch {
          return {
            valid: false,
            error: `Invalid domain format: ${domain}`,
          };
        }
      }
    }

    return { valid: true };
  }
}

/**
 * 系统工具工厂
 */
export class SystemToolFactory extends BaseToolFactory {
  constructor() {
    super({
      name: 'system_tools',
      displayName: 'System Tools',
      description: 'Tools for system operations and shell commands',
      category: 'system',
      version: '1.0.0',
      author: 'Agent System',
      schema: {
        type: 'object',
        properties: {
          allowedCommands: {
            type: 'array',
            items: { type: 'string' },
            description: 'Allowed shell commands',
          },
          workingDirectory: {
            type: 'string',
            description: 'Working directory for commands',
          },
        },
        required: ['workingDirectory'],
        description: 'System tools configuration',
      },
    });
  }

  create(config: ToolConfig): Tool {
    // TODO: 实现系统工具创建逻辑
    console.log('Creating system tool with config:', config);
    throw new Error('System tool creation not yet implemented');
  }

  validateConfig(config: ToolConfig): ValidationResult {
    const baseValidation = super.validateConfig(config);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    const customOptions = config.customOptions as Record<string, unknown> || {};
    if (!customOptions.workingDirectory) {
      return {
        valid: false,
        error: 'Working directory is required for system tools',
      };
    }

    return { valid: true };
  }
}

/**
 * 工具工厂注册表
 */
export class ToolFactoryRegistry {
  private factories = new Map<string, ToolFactory>();

  /**
   * 注册工具工厂
   */
  register(factory: ToolFactory): void {
    if (this.factories.has(factory.metadata.name)) {
      throw new Error(`Tool factory '${factory.metadata.name}' already registered`);
    }

    // 检查依赖
    const dependencyCheck = factory.checkDependencies();
    if (!dependencyCheck.valid) {
      throw new Error(`Factory dependency check failed: ${dependencyCheck.error}`);
    }

    this.factories.set(factory.metadata.name, factory);
    console.log(`🏭 Registered tool factory: ${factory.metadata.displayName}`);
  }

  /**
   * 获取工具工厂
   */
  getFactory(name: string): ToolFactory | undefined {
    return this.factories.get(name);
  }

  /**
   * 获取所有工厂
   */
  getAllFactories(): ToolFactory[] {
    return Array.from(this.factories.values());
  }

  /**
   * 按类别获取工厂
   */
  getFactoriesByCategory(category: string): ToolFactory[] {
    return this.getAllFactories().filter(f => f.metadata.category === category);
  }

  /**
   * 创建工具
   */
  createTool(factoryName: string, config: ToolConfig): Tool {
    const factory = this.getFactory(factoryName);
    if (!factory) {
      throw new Error(`Tool factory '${factoryName}' not found`);
    }

    // 验证配置
    const validation = factory.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Tool configuration invalid: ${validation.error}`);
    }

    return factory.create(config);
  }

  /**
   * 批量创建工具
   */
  createTools(configs: Array<{ factory: string; config: ToolConfig }>): Tool[] {
    const tools: Tool[] = [];
    const errors: string[] = [];

    for (const { factory, config } of configs) {
      try {
        const tool = this.createTool(factory, config);
        tools.push(tool);
      } catch (error) {
        errors.push(`Failed to create tool from factory '${factory}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Tool creation errors:\n${errors.join('\n')}`);
    }

    return tools;
  }

  /**
   * 获取工厂摘要
   */
  getSummary(): {
    totalFactories: number;
    categories: Record<string, number>;
    factories: Array<{
      name: string;
      displayName: string;
      category: string;
      version: string;
    }>;
  } {
    const factories = this.getAllFactories();
    const categories: Record<string, number> = {};

    for (const factory of factories) {
      categories[factory.metadata.category] = (categories[factory.metadata.category] || 0) + 1;
    }

    return {
      totalFactories: factories.length,
      categories,
      factories: factories.map(f => ({
        name: f.metadata.name,
        displayName: f.metadata.displayName,
        category: f.metadata.category,
        version: f.metadata.version,
      })),
    };
  }
}

/**
 * 创建默认工具工厂注册表
 */
export function createDefaultToolFactoryRegistry(): ToolFactoryRegistry {
  const registry = new ToolFactoryRegistry();

  // 注册内置工厂
  registry.register(new FileOperationToolFactory());
  registry.register(new WebToolFactory());
  registry.register(new SystemToolFactory());

  return registry;
}

// 全局工厂注册表
let globalFactoryRegistry: ToolFactoryRegistry | null = null;

/**
 * 获取全局工厂注册表
 */
export function getGlobalToolFactoryRegistry(): ToolFactoryRegistry {
  if (!globalFactoryRegistry) {
    globalFactoryRegistry = createDefaultToolFactoryRegistry();
  }
  return globalFactoryRegistry;
}

/**
 * 重置全局工厂注册表
 */
export function resetGlobalToolFactoryRegistry(): void {
  globalFactoryRegistry = null;
} 