/**
 * Tool Registry
 * 基于 qwen-code 的 tool-registry 架构设计
 * 负责工具的注册、管理和调度
 */

import {
  Tool,
  ToolRegistry as IToolRegistry,
} from '../../../../types';
import { createFileEditTool } from './file-edit';
// 导入现有工具的创建函数
import { createFileReaderTool } from './file-reader';
import { createGlobSearchTool } from './glob-search';
import { createGrepSearchTool } from './grep-search';
import { createListDirectoryTool } from './list-directory';
import { createMemoryTool } from './memory-tool';
import { createReadManyFilesTool } from './read-many-files';
import { createShellCommandTool } from './shell-command';
// 导入新工具的创建函数
import { createWebFetchTool } from './web-fetch';
import { createWebSearchTool } from './web-search';
import { createWriteFileTool } from './write-file';

/**
 * 工具注册表实现
 * 参考 qwen-code 的工具管理机制
 */
export class ToolRegistry implements IToolRegistry {
  public readonly tools: Map<string, Tool> = new Map();
  private toolCategories: Map<string, Set<string>> = new Map();
  private toolDependencies: Map<string, Set<string>> = new Map();

  /**
   * 注册工具
   * 参考 qwen-code 的工具注册流程
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name '${tool.name}' already exists`);
    }

    // 验证工具的基本要求
    this.validateTool(tool);

    // 注册工具
    this.tools.set(tool.name, tool);

    console.log(`Registered tool: ${tool.name} (${tool.displayName})`);
  }

  /**
   * 批量注册工具
   */
  registerMultiple(tools: Tool[]): void {
    const errors: string[] = [];
    
    for (const tool of tools) {
      try {
        this.register(tool);
      } catch (error) {
        errors.push(`Failed to register ${tool.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Tool registration failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * 获取工具
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有工具
   */
  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 移除工具
   */
  unregister(name: string): boolean {
    if (!this.tools.has(name)) {
      return false;
    }

    this.tools.delete(name);
    
    // 清理分类信息
    for (const [category, toolNames] of this.toolCategories) {
      toolNames.delete(name);
      if (toolNames.size === 0) {
        this.toolCategories.delete(category);
      }
    }

    // 清理依赖信息
    this.toolDependencies.delete(name);

    console.log(`Unregistered tool: ${name}`);
    return true;
  }

  /**
   * 设置工具分类
   */
  setToolCategory(toolName: string, category: string): void {
    if (!this.tools.has(toolName)) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    if (!this.toolCategories.has(category)) {
      this.toolCategories.set(category, new Set());
    }

    this.toolCategories.get(category)!.add(toolName);
  }

  /**
   * 获取分类中的工具
   */
  getToolsByCategory(category: string): Tool[] {
    const toolNames = this.toolCategories.get(category);
    if (!toolNames) {
      return [];
    }

    return Array.from(toolNames)
      .map(name => this.tools.get(name))
      .filter((tool): tool is Tool => tool !== undefined);
  }

  /**
   * 设置工具依赖关系
   */
  setToolDependency(toolName: string, dependsOn: string): void {
    if (!this.tools.has(toolName) || !this.tools.has(dependsOn)) {
      throw new Error('Both tools must be registered before setting dependency');
    }

    if (!this.toolDependencies.has(toolName)) {
      this.toolDependencies.set(toolName, new Set());
    }

    this.toolDependencies.get(toolName)!.add(dependsOn);
  }

  /**
   * 获取工具依赖
   */
  getToolDependencies(toolName: string): string[] {
    const dependencies = this.toolDependencies.get(toolName);
    return dependencies ? Array.from(dependencies) : [];
  }

  /**
   * 获取所有分类
   */
  getCategories(): string[] {
    return Array.from(this.toolCategories.keys());
  }

  /**
   * 获取工具统计信息
   */
  getStats(): {
    totalTools: number;
    categories: number;
    toolsPerCategory: Record<string, number>;
  } {
    const toolsPerCategory: Record<string, number> = {};
    
    for (const [category, tools] of this.toolCategories) {
      toolsPerCategory[category] = tools.size;
    }

    return {
      totalTools: this.tools.size,
      categories: this.toolCategories.size,
      toolsPerCategory,
    };
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
    this.toolCategories.clear();
    this.toolDependencies.clear();
  }

  /**
   * 验证工具的基本要求
   */
  private validateTool(tool: Tool): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool must have a valid name');
    }

    if (!tool.displayName || typeof tool.displayName !== 'string') {
      throw new Error('Tool must have a valid display name');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error('Tool must have a valid description');
    }

    if (!tool.schema || typeof tool.schema !== 'object') {
      throw new Error('Tool must have a valid schema');
    }

    if (typeof tool.execute !== 'function') {
      throw new Error('Tool must have an execute method');
    }

    if (typeof tool.validateParams !== 'function') {
      throw new Error('Tool must have a validateParams method');
    }
  }

  /**
   * 导出工具配置（用于序列化）
   */
  exportConfig(): {
    tools: Array<{
      name: string;
      displayName: string;
      description: string;
      category?: string;
      dependencies: string[];
    }>;
    categories: string[];
  } {
    const tools = this.list().map(tool => ({
      name: tool.name,
      displayName: tool.displayName,
      description: tool.description,
      category: this.findToolCategory(tool.name),
      dependencies: this.getToolDependencies(tool.name),
    }));

    return {
      tools,
      categories: this.getCategories(),
    };
  }

  /**
   * 查找工具所属分类
   */
  private findToolCategory(toolName: string): string | undefined {
    for (const [category, tools] of this.toolCategories) {
      if (tools.has(toolName)) {
        return category;
      }
    }
    return undefined;
  }
}

/**
 * 创建工具注册表
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

/**
 * 全局工具注册表实例
 */
let globalRegistry: ToolRegistry | null = null;

/**
 * 获取全局工具注册表
 */
export function getGlobalToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = createToolRegistry();
  }
  return globalRegistry;
}

/**
 * 重置全局工具注册表
 */
export function resetGlobalToolRegistry(): void {
  globalRegistry = null;
}

/**
 * 创建增强的代码审查工具注册表
 * 包含所有新工具的完整版本
 */
export function createEnhancedCodeReviewToolRegistry(
  projectRoot?: string,
  options?: {
    webSearchApiKeys?: {
      googleApiKey?: string;
      googleCseId?: string;
      bingApiKey?: string;
    };
    allowedDomains?: string[];
  }
): ToolRegistry {
  const registry = createToolRegistry();
  
  try {
    // 注册基础文件操作工具
    const fileReader = createFileReaderTool(projectRoot);
    const fileWriter = createWriteFileTool(projectRoot);
    const dirLister = createListDirectoryTool(projectRoot);
    
    registry.register(fileReader as unknown as Tool);
    registry.register(fileWriter as unknown as Tool);
    registry.register(dirLister as unknown as Tool);
    
    registry.setToolCategory(fileReader.name, 'file_operations');
    registry.setToolCategory(fileWriter.name, 'file_operations');
    registry.setToolCategory(dirLister.name, 'file_operations');

    // 注册搜索工具
    const grepSearch = createGrepSearchTool(projectRoot);
    const globSearch = createGlobSearchTool(projectRoot);
    
    registry.register(grepSearch as unknown as Tool);
    registry.register(globSearch as unknown as Tool);
    
    registry.setToolCategory(grepSearch.name, 'search_tools');
    registry.setToolCategory(globSearch.name, 'search_tools');

    // 注册系统工具
    const shellCommand = createShellCommandTool(projectRoot);
    registry.register(shellCommand as unknown as Tool);
    registry.setToolCategory(shellCommand.name, 'system_tools');

    // 注册新工具 - Web 功能
    const webFetch = createWebFetchTool(options?.allowedDomains);
    const webSearch = createWebSearchTool(options?.webSearchApiKeys);
    
    registry.register(webFetch as unknown as Tool);
    registry.register(webSearch as unknown as Tool);
    
    registry.setToolCategory(webFetch.name, 'web_tools');
    registry.setToolCategory(webSearch.name, 'web_tools');

    // 注册新工具 - 内存和数据处理
    const memory = createMemoryTool(projectRoot);
    const readManyFiles = createReadManyFilesTool(projectRoot);
    
    registry.register(memory as unknown as Tool);
    registry.register(readManyFiles as unknown as Tool);
    
    registry.setToolCategory(memory.name, 'data_tools');
    registry.setToolCategory(readManyFiles.name, 'file_operations');

    // 注册新工具 - 文件编辑
    const fileEdit = createFileEditTool(projectRoot);
    
    registry.register(fileEdit as unknown as Tool);
    registry.setToolCategory(fileEdit.name, 'file_operations');

    // 设置工具依赖关系
    registry.setToolDependency(fileEdit.name, fileReader.name); // 编辑需要先读取
    registry.setToolDependency(readManyFiles.name, fileReader.name); // 批量读取基于单文件读取

    console.log(`🛠️ Enhanced tool registry created with ${registry.list().length} tools`);
    console.log(`📊 Categories: ${registry.getCategories().join(', ')}`);

    return registry;

  } catch (error) {
    console.error('Failed to create enhanced tool registry:', error);
    throw new Error(`Tool registry initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
} 