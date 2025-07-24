/**
 * Tool Plugin Manager - 工具插件管理器
 * 🎯 解决依赖倒置原则 (DIP) 违反问题
 * 实现配置驱动的工具动态加载和管理
 */

import {
  Tool,
  ToolRegistry as IToolRegistry,
  ValidationResult,
} from '../../../../types';
import {
  getGlobalToolFactoryRegistry,
  ToolConfig,
  ToolMetadata,
} from './tool-factory';

export interface ToolManifest {
  version: string;
  tools: ToolDefinition[];
  categories: CategoryDefinition[];
  dependencies: DependencyDefinition[];
}

export interface ToolDefinition {
  name: string;
  factory: string;
  config: ToolConfig;
  enabled: boolean;
  priority?: number;
}

export interface CategoryDefinition {
  name: string;
  displayName: string;
  description: string;
  tools: string[];
}

export interface DependencyDefinition {
  tool: string;
  dependsOn: string[];
  optional: boolean;
}

export interface PluginLoadResult {
  success: boolean;
  loadedTools: string[];
  skippedTools: string[];
  errors: Array<{
    tool: string;
    error: string;
  }>;
}

/**
 * 工具插件管理器
 * 🎯 专注于工具的动态加载和生命周期管理
 */
export class ToolPluginManager {
  private readonly factoryRegistry = getGlobalToolFactoryRegistry();
  private loadedTools = new Map<string, Tool>();
  private toolConfigs = new Map<string, ToolConfig>();
  private dependencies = new Map<string, string[]>();

  /**
   * 从配置清单加载工具
   */
  async loadFromManifest(manifest: ToolManifest): Promise<PluginLoadResult> {
    console.log(`🚀 Loading tools from manifest (version: ${manifest.version})`);

    const result: PluginLoadResult = {
      success: true,
      loadedTools: [],
      skippedTools: [],
      errors: [],
    };

    try {
      // 1. 验证清单
      const manifestValidation = this.validateManifest(manifest);
      if (!manifestValidation.valid) {
        throw new Error(`Manifest validation failed: ${manifestValidation.error}`);
      }

      // 2. 构建依赖图
      this.buildDependencyGraph(manifest.dependencies);

      // 3. 解析加载顺序
      const loadOrder = this.resolveDependencies(manifest.tools);

      // 4. 按顺序加载工具
      for (const toolDef of loadOrder) {
        if (!toolDef.enabled) {
          result.skippedTools.push(toolDef.name);
          continue;
        }

        try {
          const tool = await this.loadSingleTool(toolDef);
          this.loadedTools.set(toolDef.name, tool);
          this.toolConfigs.set(toolDef.name, toolDef.config);
          result.loadedTools.push(toolDef.name);

          console.log(`✅ Loaded tool: ${toolDef.name}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          result.errors.push({
            tool: toolDef.name,
            error: errorMsg,
          });
          
          console.error(`❌ Failed to load tool: ${toolDef.name} - ${errorMsg}`);
        }
      }

      // 5. 检查是否有加载失败
      if (result.errors.length > 0) {
        result.success = false;
      }

      console.log(`📊 Tool loading summary: ${result.loadedTools.length} loaded, ${result.skippedTools.length} skipped, ${result.errors.length} errors`);

    } catch (error) {
      result.success = false;
      result.errors.push({
        tool: 'manifest',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return result;
  }

  /**
   * 从目录动态发现并加载工具
   */
  async loadFromDirectory(directoryPath: string): Promise<PluginLoadResult> {
    console.log(`🔍 Discovering tools from directory: ${directoryPath}`);

    const result: PluginLoadResult = {
      success: true,
      loadedTools: [],
      skippedTools: [],
      errors: [],
    };

    try {
      // TODO: 实现目录扫描逻辑
      // 1. 扫描目录中的工具定义文件
      // 2. 解析每个工具的配置
      // 3. 动态加载工具

      console.log('Directory-based tool loading not yet implemented');
      
    } catch (error) {
      result.success = false;
      result.errors.push({
        tool: 'directory_scan',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return result;
  }

  /**
   * 注册工具到注册表
   */
  registerToToolRegistry(toolRegistry: IToolRegistry): void {
    console.log(`📝 Registering ${this.loadedTools.size} tools to registry`);

    for (const [name, tool] of this.loadedTools) {
      try {
        toolRegistry.register(tool);
        console.log(`✅ Registered tool: ${name}`);
      } catch (error) {
        console.error(`❌ Failed to register tool: ${name} - ${error}`);
      }
    }
  }

  /**
   * 获取已加载的工具
   */
  getLoadedTools(): Tool[] {
    return Array.from(this.loadedTools.values());
  }

  /**
   * 获取工具配置
   */
  getToolConfig(toolName: string): ToolConfig | undefined {
    return this.toolConfigs.get(toolName);
  }

  /**
   * 获取工具元数据
   */
  getToolMetadata(): ToolMetadata[] {
    return this.factoryRegistry.getAllFactories().map(f => f.metadata);
  }

  /**
   * 重新加载工具
   */
  async reloadTool(toolName: string): Promise<boolean> {
    console.log(`🔄 Reloading tool: ${toolName}`);

    const config = this.toolConfigs.get(toolName);
    if (!config) {
      console.error(`❌ Tool config not found: ${toolName}`);
      return false;
    }

    try {
      // 卸载现有工具
      this.loadedTools.delete(toolName);

      // 重新加载
      const toolDef: ToolDefinition = {
        name: toolName,
        factory: toolName, // 假设工厂名与工具名相同
        config,
        enabled: true,
      };

      const tool = await this.loadSingleTool(toolDef);
      this.loadedTools.set(toolName, tool);

      console.log(`✅ Successfully reloaded tool: ${toolName}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to reload tool: ${toolName} - ${error}`);
      return false;
    }
  }

  /**
   * 卸载工具
   */
  unloadTool(toolName: string): boolean {
    if (this.loadedTools.has(toolName)) {
      this.loadedTools.delete(toolName);
      this.toolConfigs.delete(toolName);
      console.log(`🗑️ Unloaded tool: ${toolName}`);
      return true;
    }
    return false;
  }

  /**
   * 获取加载状态
   */
  getLoadStatus(): {
    totalTools: number;
    loadedTools: number;
    availableFactories: number;
    loadedToolNames: string[];
  } {
    return {
      totalTools: this.loadedTools.size,
      loadedTools: this.loadedTools.size,
      availableFactories: this.factoryRegistry.getAllFactories().length,
      loadedToolNames: Array.from(this.loadedTools.keys()),
    };
  }

  // ========== 私有辅助方法 ==========

  /**
   * 验证清单格式
   */
  private validateManifest(manifest: ToolManifest): ValidationResult {
    const errors: string[] = [];

    if (!manifest.version) {
      errors.push('Manifest version is required');
    }

    if (!Array.isArray(manifest.tools)) {
      errors.push('Tools must be an array');
    }

    if (!Array.isArray(manifest.categories)) {
      errors.push('Categories must be an array');
    }

    if (!Array.isArray(manifest.dependencies)) {
      errors.push('Dependencies must be an array');
    }

    // 验证工具定义
    for (const tool of manifest.tools) {
      if (!tool.name || !tool.factory) {
        errors.push(`Tool definition missing name or factory: ${JSON.stringify(tool)}`);
      }
    }

    if (errors.length > 0) {
      return { valid: false, error: errors.join('; ') };
    }

    return { valid: true };
  }

  /**
   * 构建依赖图
   */
  private buildDependencyGraph(dependencies: DependencyDefinition[]): void {
    this.dependencies.clear();

    for (const dep of dependencies) {
      this.dependencies.set(dep.tool, dep.dependsOn);
    }
  }

  /**
   * 解析依赖关系，返回正确的加载顺序
   */
  private resolveDependencies(tools: ToolDefinition[]): ToolDefinition[] {
    const resolved: ToolDefinition[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const toolMap = new Map(tools.map(t => [t.name, t]));

    const visit = (toolName: string) => {
      if (visited.has(toolName)) return;
      if (visiting.has(toolName)) {
        throw new Error(`Circular dependency detected: ${toolName}`);
      }

      visiting.add(toolName);

      // 访问依赖
      const deps = this.dependencies.get(toolName) || [];
      for (const dep of deps) {
        visit(dep);
      }

      visiting.delete(toolName);
      visited.add(toolName);

      // 添加到解析列表
      const tool = toolMap.get(toolName);
      if (tool) {
        resolved.push(tool);
      }
    };

    // 按优先级排序
    const sortedTools = [...tools].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const tool of sortedTools) {
      visit(tool.name);
    }

    return resolved;
  }

  /**
   * 加载单个工具
   */
  private async loadSingleTool(toolDef: ToolDefinition): Promise<Tool> {
    // 获取工厂
    const factory = this.factoryRegistry.getFactory(toolDef.factory);
    if (!factory) {
      throw new Error(`Factory not found: ${toolDef.factory}`);
    }

    // 验证配置
    const validation = factory.validateConfig(toolDef.config);
    if (!validation.valid) {
      throw new Error(`Tool configuration invalid: ${validation.error}`);
    }

    // 创建工具
    const tool = factory.create(toolDef.config);

    return tool;
  }
}

/**
 * 创建默认工具清单
 */
export function createDefaultToolManifest(projectRoot: string): ToolManifest {
  return {
    version: '1.0.0',
    tools: [
      {
        name: 'read_file',
        factory: 'file_operations',
        config: {
          projectRoot,
          enabled: true,
          timeout: 30000,
          rateLimitPerMinute: 100,
        },
        enabled: true,
        priority: 10,
      },
      {
        name: 'write_file',
        factory: 'file_operations',
        config: {
          projectRoot,
          enabled: true,
          timeout: 30000,
          rateLimitPerMinute: 50,
        },
        enabled: true,
        priority: 9,
      },
      {
        name: 'web_search',
        factory: 'web_tools',
        config: {
          enabled: true,
          timeout: 30000,
          rateLimitPerMinute: 10,
          customOptions: {
            allowedDomains: ['google.com', 'stackoverflow.com', 'github.com'],
          },
        },
        enabled: true,
        priority: 5,
      },
      {
        name: 'shell_command',
        factory: 'system_tools',
        config: {
          enabled: true,
          timeout: 60000,
          rateLimitPerMinute: 20,
          customOptions: {
            workingDirectory: projectRoot,
            allowedCommands: ['ls', 'cat', 'grep', 'find'],
          },
        },
        enabled: true,
        priority: 3,
      },
    ],
    categories: [
      {
        name: 'file_system',
        displayName: 'File System',
        description: 'Tools for file operations',
        tools: ['read_file', 'write_file'],
      },
      {
        name: 'web',
        displayName: 'Web Tools',
        description: 'Tools for web operations',
        tools: ['web_search'],
      },
      {
        name: 'system',
        displayName: 'System Tools',
        description: 'Tools for system operations',
        tools: ['shell_command'],
      },
    ],
    dependencies: [
      {
        tool: 'write_file',
        dependsOn: ['read_file'],
        optional: false,
      },
    ],
  };
}

/**
 * 从文件加载工具清单
 */
export async function loadToolManifestFromFile(filePath: string): Promise<ToolManifest> {
  try {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(filePath, 'utf8');
    const manifest = JSON.parse(content) as ToolManifest;
    
    console.log(`📄 Loaded tool manifest from: ${filePath}`);
    return manifest;
  } catch (error) {
    throw new Error(`Failed to load tool manifest from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 保存工具清单到文件
 */
export async function saveToolManifestToFile(manifest: ToolManifest, filePath: string): Promise<void> {
  try {
    const fs = await import('node:fs/promises');
    await fs.writeFile(filePath, JSON.stringify(manifest, null, 2), 'utf8');
    
    console.log(`💾 Saved tool manifest to: ${filePath}`);
  } catch (error) {
    throw new Error(`Failed to save tool manifest to ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 全局插件管理器
let globalPluginManager: ToolPluginManager | null = null;

/**
 * 获取全局插件管理器
 */
export function getGlobalPluginManager(): ToolPluginManager {
  if (!globalPluginManager) {
    globalPluginManager = new ToolPluginManager();
  }
  return globalPluginManager;
}

/**
 * 重置全局插件管理器
 */
export function resetGlobalPluginManager(): void {
  globalPluginManager = null;
} 