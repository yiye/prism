/**
 * Tool Registry
 * 基于 qwen-code 的 tool-registry 架构设计
 * 负责工具的注册、管理和调度
 */

import {
  Tool,
  ToolRegistry as IToolRegistry,
} from '../../../../types';

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
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
    this.toolCategories.clear();
    this.toolDependencies.clear();
  }

  /**
   * 按分类获取工具
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
   * 为工具设置分类
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
   * 获取所有分类
   */
  getCategories(): string[] {
    return Array.from(this.toolCategories.keys());
  }

  /**
   * 设置工具依赖关系
   */
  setToolDependency(toolName: string, dependsOn: string): void {
    if (!this.tools.has(toolName)) {
      throw new Error(`Tool '${toolName}' not found`);
    }
    
    if (!this.tools.has(dependsOn)) {
      throw new Error(`Dependency tool '${dependsOn}' not found`);
    }

    if (!this.toolDependencies.has(toolName)) {
      this.toolDependencies.set(toolName, new Set());
    }

    this.toolDependencies.get(toolName)!.add(dependsOn);
  }

  /**
   * 获取工具的依赖
   */
  getToolDependencies(toolName: string): string[] {
    const dependencies = this.toolDependencies.get(toolName);
    return dependencies ? Array.from(dependencies) : [];
  }

  /**
   * 检查工具依赖是否满足
   */
  checkDependencies(toolName: string): { satisfied: boolean; missing: string[] } {
    const dependencies = this.getToolDependencies(toolName);
    const missing = dependencies.filter(dep => !this.tools.has(dep));
    
    return {
      satisfied: missing.length === 0,
      missing,
    };
  }

  /**
   * 获取可用的工具（满足依赖条件）
   */
  getAvailableTools(): Tool[] {
    return this.list().filter(tool => {
      const depCheck = this.checkDependencies(tool.name);
      return depCheck.satisfied;
    });
  }

  /**
   * 按能力过滤工具
   */
  getToolsByCapability(capability: 'readonly' | 'modifying' | 'streaming'): Tool[] {
    return this.list().filter(tool => {
      switch (capability) {
        case 'readonly':
          return !tool.canUpdateOutput; // 只读工具通常不支持流式输出
        case 'modifying':
          return tool.canUpdateOutput; // 修改性工具通常支持流式输出
        case 'streaming':
          return tool.canUpdateOutput;
        default:
          return false;
      }
    });
  }

  /**
   * 搜索工具
   */
  searchTools(query: string): Tool[] {
    const lowercaseQuery = query.toLowerCase();
    
    return this.list().filter(tool => 
      tool.name.toLowerCase().includes(lowercaseQuery) ||
      tool.displayName.toLowerCase().includes(lowercaseQuery) ||
      tool.description.toLowerCase().includes(lowercaseQuery)
    );
  }

  /**
   * 获取工具统计信息
   */
  getStats(): {
    totalTools: number;
    categoryCounts: Record<string, number>;
    capabilityCounts: {
      readonly: number;
      modifying: number;
      streaming: number;
      markdown: number;
    };
  } {
    const tools = this.list();
    
    return {
      totalTools: tools.length,
      categoryCounts: Object.fromEntries(
        Array.from(this.toolCategories.entries()).map(([cat, tools]) => [cat, tools.size])
      ),
      capabilityCounts: {
        readonly: tools.filter(t => !t.canUpdateOutput).length,
        modifying: tools.filter(t => t.canUpdateOutput).length,
        streaming: tools.filter(t => t.canUpdateOutput).length,
        markdown: tools.filter(t => t.isOutputMarkdown).length,
      },
    };
  }

  /**
   * 验证工具的有效性
   */
  private validateTool(tool: Tool): void {
    // 检查必需字段
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool name is required and must be a string');
    }

    if (!tool.displayName || typeof tool.displayName !== 'string') {
      throw new Error('Tool displayName is required and must be a string');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error('Tool description is required and must be a string');
    }

    if (!tool.schema || typeof tool.schema !== 'object') {
      throw new Error('Tool schema is required and must be an object');
    }

    // 检查方法
    if (typeof tool.validateParams !== 'function') {
      throw new Error('Tool must have a validateParams method');
    }

    if (typeof tool.shouldConfirm !== 'function') {
      throw new Error('Tool must have a shouldConfirm method');
    }

    if (typeof tool.execute !== 'function') {
      throw new Error('Tool must have an execute method');
    }

    // 检查 schema 格式
    this.validateSchema(tool.schema);
  }

  /**
   * 验证工具 schema
   */
  private validateSchema(schema: Tool['schema']): void {
    if (schema.type !== 'object') {
      throw new Error('Tool schema type must be "object"');
    }

    if (!schema.properties || typeof schema.properties !== 'object') {
      throw new Error('Tool schema must have properties');
    }

    if (!Array.isArray(schema.required)) {
      throw new Error('Tool schema required must be an array');
    }

    // 检查必需字段是否都在 properties 中定义
    for (const required of schema.required) {
      if (!(required in schema.properties)) {
        throw new Error(`Required field '${required}' not found in properties`);
      }
    }
  }

  /**
   * 导出工具定义（用于 Claude API）
   */
  exportForClaude(): Array<{
    name: string;
    description: string;
    input_schema: Tool['schema'];
  }> {
    return this.getAvailableTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.schema,
    }));
  }

  /**
   * 从配置文件加载工具
   */
  async loadFromConfig(config: {
    tools: Array<{
      name: string;
      enabled: boolean;
      category?: string;
      dependencies?: string[];
      options?: Record<string, unknown>;
    }>;
  }): Promise<void> {
    // 这里可以根据配置动态加载工具
    // 实际实现中可能需要工具工厂或动态导入
    console.log('Loading tools from config:', config);
  }

  /**
   * 保存工具配置
   */
  saveConfig(): {
    tools: Array<{
      name: string;
      displayName: string;
      description: string;
      category: string;
      dependencies: string[];
      capabilities: {
        readonly: boolean;
        streaming: boolean;
        markdown: boolean;
      };
    }>;
  } {
    return {
      tools: this.list().map(tool => ({
        name: tool.name,
        displayName: tool.displayName,
        description: tool.description,
        category: this.getToolCategory(tool.name),
        dependencies: this.getToolDependencies(tool.name),
        capabilities: {
          readonly: !tool.canUpdateOutput,
          streaming: tool.canUpdateOutput,
          markdown: tool.isOutputMarkdown,
        },
      })),
    };
  }

  /**
   * 获取工具的分类
   */
  private getToolCategory(toolName: string): string {
    for (const [category, tools] of this.toolCategories) {
      if (tools.has(toolName)) {
        return category;
      }
    }
    return 'uncategorized';
  }
}

/**
 * 创建默认的工具注册表
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

/**
 * 全局工具注册表实例
 * 参考 qwen-code 的单例模式
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