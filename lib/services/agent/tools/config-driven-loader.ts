/**
 * Config-Driven Tool Loader - 配置驱动的工具加载系统
 * 🎯 整合工具工厂、插件管理器等组件
 * 🎯 实现完整的配置驱动架构，消除硬编码依赖
 */

import { Tool } from '../../../../types';
import {
  ToolCategory,
  ToolConfig,
} from './tool-factory';
import {
  createDefaultToolPluginManager,
  getDefaultToolConfigs,
  PluginLoadOptions,
  PluginManifest,
  ToolPluginManager,
} from './tool-plugin-manager';
import { ToolRegistry } from './tool-registry';
import { ToolScheduler } from './tool-scheduler';

export interface ToolSystemConfig {
  projectRoot: string;
  tools: Record<string, ToolConfig>;
  plugins?: {
    enabled: boolean;
    directories?: string[];
    manifests?: PluginManifest[];
  };
  scheduler?: {
    globalTimeout?: number;
    maxConcurrentTools?: number;
    retryAttempts?: number;
  };
  features?: {
    autoDiscovery?: boolean;
    hotReload?: boolean;
    configValidation?: boolean;
  };
}

export interface LoadResult {
  toolRegistry: ToolRegistry;
  toolScheduler: ToolScheduler;
  pluginManager: ToolPluginManager;
  loadedTools: Tool[];
  stats: {
    totalTools: number;
    enabledTools: number;
    loadedPlugins: number;
    failedLoads: string[];
  };
}

/**
 * 配置驱动的工具加载器
 * 🎯 统一管理工具的加载、配置和调度
 */
export class ConfigDrivenToolLoader {
  private pluginManager: ToolPluginManager;
  private loadResult?: LoadResult;

  constructor(pluginManager?: ToolPluginManager) {
    this.pluginManager = pluginManager || createDefaultToolPluginManager();
  }

  /**
   * 从配置加载完整的工具系统
   * 🎯 核心方法：基于配置构建整个工具生态
   */
  async loadFromConfig(config: ToolSystemConfig): Promise<LoadResult> {
    console.log('🚀 Loading tool system from configuration...');
    
    const failedLoads: string[] = [];
    let loadedTools: Tool[] = [];

    try {
      // 1. 验证配置
      if (config.features?.configValidation !== false) {
        this.validateConfig(config);
      }

      // 2. 加载插件（如果启用）
      if (config.plugins?.enabled) {
        await this.loadPlugins(config.plugins, { projectRoot: config.projectRoot });
      }

      // 3. 从配置加载核心工具
      const toolLoadOptions: PluginLoadOptions = {
        projectRoot: config.projectRoot,
      };

      loadedTools = await this.pluginManager.loadFromConfig(
        config.tools,
        toolLoadOptions
      );

      // 4. 创建工具调度器
      const toolScheduler = this.createToolScheduler(config);

      // 5. 获取工具注册表
      const toolRegistry = this.pluginManager.getToolRegistry();

      // 6. 收集统计信息
      const pluginStats = this.pluginManager.getToolStats();
      const stats = {
        totalTools: pluginStats.totalTools,
        enabledTools: pluginStats.enabledTools,
        loadedPlugins: this.pluginManager.getLoadedPlugins().length,
        failedLoads,
      };

      this.loadResult = {
        toolRegistry,
        toolScheduler,
        pluginManager: this.pluginManager,
        loadedTools,
        stats,
      };

      console.log(`🎯 Tool system loaded successfully:`);
      console.log(`   - Total tools: ${stats.totalTools}`);
      console.log(`   - Enabled tools: ${stats.enabledTools}`);
      console.log(`   - Loaded plugins: ${stats.loadedPlugins}`);
      
      if (failedLoads.length > 0) {
        console.warn(`   - Failed loads: ${failedLoads.length}`);
      }

      return this.loadResult;

    } catch (error) {
      console.error('❌ Failed to load tool system:', error);
      throw new Error(`Tool system loading failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 从文件加载配置
   * 🎯 支持从 JSON/YAML 文件加载配置
   */
  async loadFromConfigFile(configPath: string): Promise<LoadResult> {
    console.log(`📄 Loading tool system from config file: ${configPath}`);
    
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      const configContent = await fs.readFile(configPath, 'utf-8');
      const ext = path.extname(configPath).toLowerCase();
      
      let config: ToolSystemConfig;
      
      if (ext === '.json') {
        config = JSON.parse(configContent);
      } else if (ext === '.yaml' || ext === '.yml') {
        // 如果需要 YAML 支持，可以添加 yaml 解析
        throw new Error('YAML configuration not yet supported');
      } else {
        throw new Error(`Unsupported config file format: ${ext}`);
      }

      return await this.loadFromConfig(config);
      
    } catch (error) {
      console.error(`❌ Failed to load config from file ${configPath}:`, error);
      throw error;
    }
  }

  /**
   * 获取默认配置
   * 🎯 为不同场景提供预设配置
   */
  getDefaultConfig(
    scenario: 'development' | 'production' | 'testing' = 'development',
    projectRoot?: string
  ): ToolSystemConfig {
    const root = projectRoot || process.cwd();
    const baseTools = getDefaultToolConfigs(root);
    
    const baseConfig: ToolSystemConfig = {
      projectRoot: root,
      tools: baseTools,
      plugins: {
        enabled: false,
        directories: [],
      },
      features: {
        autoDiscovery: false,
        hotReload: false,
        configValidation: true,
      },
    };

    switch (scenario) {
      case 'development':
        return {
          ...baseConfig,
          tools: {
            ...baseTools,
            web_search: {
              ...baseTools.web_search,
              enabled: true, // 开发时启用 web 搜索
            },
          },
          plugins: {
            enabled: true,
            directories: ['./plugins', './node_modules/@code-agent/plugins'],
          },
          features: {
            autoDiscovery: true,
            hotReload: true,
            configValidation: true,
          },
          scheduler: {
            globalTimeout: 120000,
            maxConcurrentTools: 5,
            retryAttempts: 2,
          },
        };

      case 'production':
        return {
          ...baseConfig,
          plugins: {
            enabled: true,
            directories: ['./node_modules/@code-agent/plugins'],
          },
          features: {
            autoDiscovery: false,
            hotReload: false,
            configValidation: true,
          },
          scheduler: {
            globalTimeout: 60000,
            maxConcurrentTools: 3,
            retryAttempts: 1,
          },
        };

      case 'testing':
        return {
          ...baseConfig,
          tools: {
            // 测试时只启用基础工具
            read_file: baseTools.read_file,
            write_file: { ...baseTools.write_file, enabled: false }, // 测试时禁用写入
            memory: baseTools.memory,
          },
          features: {
            autoDiscovery: false,
            hotReload: false,
            configValidation: false, // 测试时跳过验证以提高速度
          },
          scheduler: {
            globalTimeout: 30000,
            maxConcurrentTools: 2,
            retryAttempts: 0,
          },
        };

      default:
        return baseConfig;
    }
  }

  /**
   * 热重载配置
   * 🎯 支持运行时配置更新
   */
  async reloadConfig(newConfig: Partial<ToolSystemConfig>): Promise<LoadResult> {
    if (!this.loadResult) {
      throw new Error('No configuration loaded yet. Call loadFromConfig first.');
    }

    console.log('🔄 Hot reloading tool system configuration...');

    // 合并新配置
    const currentConfig = this.getCurrentConfig();
    const mergedConfig: ToolSystemConfig = {
      ...currentConfig,
      ...newConfig,
      tools: {
        ...currentConfig.tools,
        ...newConfig.tools,
      },
    };

    // 重新加载
    return await this.loadFromConfig(mergedConfig);
  }

  /**
   * 获取当前加载结果
   */
  getLoadResult(): LoadResult | undefined {
    return this.loadResult;
  }

  /**
   * 获取工具使用统计
   * 🎯 收集工具使用情况
   */
  getUsageStats(): {
    mostUsedTools: Array<{ name: string; usage: number }>;
    categoryBreakdown: Record<ToolCategory, number>;
    performanceMetrics: {
      averageExecutionTime: number;
      successRate: number;
    };
  } {
    // TODO: 实现统计逻辑
    return {
      mostUsedTools: [],
      categoryBreakdown: {} as Record<ToolCategory, number>,
      performanceMetrics: {
        averageExecutionTime: 0,
        successRate: 0,
      },
    };
  }

  // ========== 私有方法 ==========

  /**
   * 加载插件
   */
  private async loadPlugins(
    pluginConfig: NonNullable<ToolSystemConfig['plugins']>,
    options: PluginLoadOptions
  ): Promise<void> {
    // 加载指定的插件清单
    if (pluginConfig.manifests) {
      for (const manifest of pluginConfig.manifests) {
        try {
          await this.pluginManager.loadFromManifest(manifest, options);
        } catch (error) {
          console.error(`❌ Failed to load plugin ${manifest.name}:`, error);
        }
      }
    }

    // 从目录自动发现插件
    if (pluginConfig.directories) {
      for (const directory of pluginConfig.directories) {
        try {
          const manifests = await this.pluginManager.discoverPlugins(directory);
          for (const manifest of manifests) {
            try {
              await this.pluginManager.loadFromManifest(manifest, options);
            } catch (error) {
              console.error(`❌ Failed to load discovered plugin ${manifest.name}:`, error);
            }
          }
        } catch (error) {
          console.warn(`⚠️  Failed to discover plugins in ${directory}:`, error);
        }
      }
    }
  }

  /**
   * 创建工具调度器
   */
  private createToolScheduler(config: ToolSystemConfig): ToolScheduler {
    const schedulerConfig = {
      projectRoot: config.projectRoot,
      tools: {} as any, // 从加载的工具配置构建
      globalTimeout: config.scheduler?.globalTimeout || 60000,
      maxConcurrentTools: config.scheduler?.maxConcurrentTools || 5,
    };

    // 转换工具配置格式
    for (const [toolName, toolConfig] of Object.entries(config.tools)) {
      if (toolConfig.enabled) {
        schedulerConfig.tools[toolName] = {
          enabled: true,
          timeout: toolConfig.timeout,
          rateLimitPerMinute: toolConfig.rateLimitPerMinute,
        };
      }
    }

    return new ToolScheduler(schedulerConfig);
  }

  /**
   * 验证配置
   */
  private validateConfig(config: ToolSystemConfig): void {
    if (!config.projectRoot || typeof config.projectRoot !== 'string') {
      throw new Error('projectRoot is required and must be a string');
    }

    if (!config.tools || typeof config.tools !== 'object') {
      throw new Error('tools configuration is required and must be an object');
    }

    // 验证每个工具配置
    for (const [toolName, toolConfig] of Object.entries(config.tools)) {
      if (typeof toolConfig.enabled !== 'boolean') {
        throw new Error(`Tool '${toolName}' must have a boolean 'enabled' property`);
      }
    }
  }

  /**
   * 获取当前配置
   */
  private getCurrentConfig(): ToolSystemConfig {
    if (!this.loadResult) {
      throw new Error('No configuration loaded');
    }

    // 从当前状态重构配置对象
    // 这是一个简化实现，实际应用中可能需要更复杂的状态管理
    return {
      projectRoot: process.cwd(),
      tools: {},
    };
  }
}

/**
 * 便捷函数：创建并加载工具系统
 * 🎯 一步到位的工具系统初始化
 */
export async function createToolSystem(
  config?: Partial<ToolSystemConfig>,
  scenario: 'development' | 'production' | 'testing' = 'development'
): Promise<LoadResult> {
  const loader = new ConfigDrivenToolLoader();
  const finalConfig = {
    ...loader.getDefaultConfig(scenario),
    ...config,
  };
  
  return await loader.loadFromConfig(finalConfig);
}

/**
 * 便捷函数：从文件创建工具系统
 * 🎯 从配置文件一步创建工具系统
 */
export async function createToolSystemFromFile(configPath: string): Promise<LoadResult> {
  const loader = new ConfigDrivenToolLoader();
  return await loader.loadFromConfigFile(configPath);
} 