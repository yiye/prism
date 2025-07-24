/**
 * Agent Services Index
 * 统一导出所有 Agent 相关的服务和组件
 */

// Core Agent Components - V2 Architecture
export {
  type AgentResponse,
  type AgentV2Options,
  type AgentV2Options as AgentOptions,
  CodeReviewAgentV2 as CodeReviewAgent,
  createCodeReviewAgent,
  createCodeReviewAgentV2,
} from './core/agent-v2';

// Legacy exports (for backward compatibility)
export { CodeReviewAgent as CodeReviewAgentV1 } from './core/agent';

// Import StreamEvent from types
export type { StreamEvent } from '../../../types';

export { ClaudeClient, type ClaudeConfig } from './core/claude-client';

// Session Management
export {
  type AgentSession,
  AgentSessionManager,
  getGlobalSessionManager,
  type SessionConfig,
} from './session-manager';

// Tool System - Updated Architecture
export {
  createEnhancedCodeReviewToolRegistry,
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

// Individual Tools - Original
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

// New Tools - Enhanced Capabilities
export { createWebFetchTool, type WebFetchTool } from './tools/web-fetch';

export { createWebSearchTool, type WebSearchTool } from './tools/web-search';

export { createMemoryTool, type MemoryTool } from './tools/memory-tool';

export {
  createReadManyFilesTool,
  type ReadManyFilesTool,
} from './tools/read-many-files';

export { createFileEditTool, type FileEditTool } from './tools/file-edit';

// Global Service Alias for API compatibility
export {
  getGlobalSessionManager as getGlobalAgentService,
} from './session-manager';