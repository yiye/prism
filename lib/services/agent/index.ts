/**
 * Agent Services Index
 * 统一导出所有 Agent 相关的服务和组件
 */

// Core Agent Components
export {
  type AgentOptions,
  type AgentResponse,
  CodeReviewAgent,
  createCodeReviewAgent,
  type StreamEvent,
} from './core/agent';

export {
  ClaudeClient,
  type ClaudeConfig,
  createClaudeClient,
} from './core/claude-client';

// Session Management
export {
  type AgentSession,
  AgentSessionManager,
  getGlobalSessionManager,
  type SessionConfig,
} from './session-manager';

// Tool System - Updated Architecture
export {
  createToolRegistry,
  getGlobalToolRegistry,
  resetGlobalToolRegistry,
  ToolRegistry,
} from './tools/tool-registry';

// Tool Scheduler (renamed from ToolManager)
export {
  createDefaultToolScheduler,
  type ExecutionOptions,
  type ToolExecutionResult,
  type ToolName,
  ToolScheduler,
  type ToolSchedulerConfig,
} from './tools/tool-scheduler';

// Individual Tools
export { createFileReaderTool, type FileReaderTool } from './tools/file-reader';

export { createWriteFileTool, type WriteFileTool } from './tools/write-file';

export {
  createListDirectoryTool,
  type ListDirectoryTool,
} from './tools/list-directory';

export { createGrepSearchTool, type GrepSearchTool } from './tools/grep-search';

export { createGlobSearchTool, type GlobSearchTool } from './tools/glob-search';

export {
  createShellCommandTool,
  type ShellCommandTool,
} from './tools/shell-command';

export {
  BaseTool,
  createTool,
  ModifyingTool,
  ReadOnlyTool,
  type ToolParams,
  type ToolResult,
} from './tools/base-tool';

// Agent Service - 统一入口
export {
  AgentService,
  type AgentServiceConfig,
  type AgentServiceResult,
} from '../agent-service';

/**
 * 创建代码审查工具注册表
 * 🎯 专注于工具发现和元数据管理
 */
export function createCodeReviewToolRegistry(projectRoot?: string): ToolRegistry {
  const registry = createToolRegistry();
  
  // 注册基础工具
  const fileReader = createFileReaderTool(projectRoot);
  registry.register(fileReader);
  registry.setToolCategory('read_file', 'file_operations');

  return registry;
}

/**
 * 创建增强工具调度器
 * 🎯 专注于工具执行调度和策略控制
 */
export function createEnhancedToolScheduler(projectRoot?: string): ToolScheduler {
  return createDefaultToolScheduler(projectRoot);
} 