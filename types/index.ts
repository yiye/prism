// Core Agent Types - 基于 qwen-code 架构设计
export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string | MessageContent[];
  timestamp: number;
  metadata?: MessageMetadata;
}

export interface MessageContent {
  type: "text" | "code" | "file_reference" | "tool_result";
  text?: string;
  code?: CodeBlock;
  file_reference?: FileReference;
  tool_result?: ToolResult;
}

export interface CodeBlock {
  language: string;
  code: string;
  filename?: string;
  startLine?: number;
  endLine?: number;
}

export interface FileReference {
  path: string;
  type: "file" | "directory";
  language?: string;
  size?: number;
}

export interface MessageMetadata {
  tokens?: {
    input: number;
    output: number;
  };
  model?: string;
  processing_time?: number;
  tool_calls?: ToolCall[];
}

// Tool System Types - 参考 qwen-code 工具架构
export interface Tool<TParams = Record<string, unknown>, TResult = ToolResult> {
  name: string;
  displayName: string;
  description: string;
  schema: ToolSchema;
  isOutputMarkdown: boolean;
  canUpdateOutput: boolean;
  validateParams(params: TParams): ValidationResult;
  shouldConfirm(params: TParams): Promise<boolean>;
  execute(
    params: TParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void
  ): Promise<TResult>;
}

export interface ToolSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolSchemaProperty;
  properties?: Record<string, ToolSchemaProperty>;
  default?: unknown;
}

export interface ToolSchema {
  type: "object";
  properties: Record<string, ToolSchemaProperty>;
  required: string[];
  description: string;
}

export interface BaseToolConfig {
  name: string;
  displayName: string;
  description: string;
  schema: ToolSchema;
  isOutputMarkdown?: boolean;
  canUpdateOutput?: boolean;
  projectRoot?: string;
  [key: string]: unknown; // 允许扩展配置
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ToolCall {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  status: ToolCallStatus;
  result?: ToolResult;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export type ToolCallStatus =
  | "pending"
  | "validating"
  | "awaiting_confirmation"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export interface ToolResult {
  output: string;
  metadata?: Record<string, unknown>;
  artifacts?: Artifact[];
}

export interface Artifact {
  type: "file" | "diff" | "report" | "suggestion";
  content: string;
  metadata?: Record<string, unknown>;
}

// Agent Core Types - 基于 qwen-code Agent Loop 设计
export interface AgentConfig {
  model: string;
  maxTokens: number;
  temperature?: number;
  tools: string[];
  systemPrompt?: string;
  reviewConfig?: CodeReviewConfig;
}

export interface CodeReviewConfig {
  focusAreas: string[];
  severity: "low" | "medium" | "high";
  frameworks: string[];
  rules: ReviewRule[];
}

export interface ReviewRule {
  id: string;
  name: string;
  description: string;
  category: "performance" | "security" | "maintainability" | "style" | "logic";
  enabled: boolean;
}

export interface AgentContext {
  sessionId: string;
  messages: Message[];
  toolRegistry: ToolRegistry;
  config: AgentConfig;
  state: AgentState;
}

export interface AgentState {
  status: "idle" | "thinking" | "tool_calling" | "responding" | "error";
  currentTurn: number;
  maxTurns: number;
  tokensUsed: number;
  lastActivity: number;
}

// Agent Configuration and Options
export interface ClaudeConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

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

export interface AgentResponse {
  message: Message;
  context: AgentContext;
  completed: boolean;
}

export interface AgentStats {
  totalTools: number;
  enabledTools: number;
  lastExecution: number;
}

// Tool Execution Types
export interface ToolExecutionOptions {
  signal?: AbortSignal;
  timeout?: number;
}

export interface StreamEventResult {
  content: string;
  toolCalls: ToolCall[];
  events?: StreamEvent[];
}

export interface ToolRegistry {
  tools: Map<string, Tool>;
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  getAvailableTools?(): Tool[];
}

// Code Review Specific Types
export interface ReviewRequest {
  target: string; // file path or directory
  type: "file" | "directory" | "diff";
  context?: string;
  focusAreas?: string[];
}

export interface ReviewResult {
  summary: string;
  issues: ReviewIssue[];
  suggestions: ReviewSuggestion[];
  metrics: ReviewMetrics;
}

export interface ReviewIssue {
  id: string;
  severity: "info" | "warning" | "error" | "critical";
  category: string;
  title: string;
  description: string;
  file: string;
  line?: number;
  column?: number;
  code?: string;
  suggestion?: string;
}

export interface ReviewSuggestion {
  id: string;
  type: "improvement" | "refactor" | "optimize";
  title: string;
  description: string;
  file: string;
  originalCode?: string;
  suggestedCode?: string;
  benefits: string[];
}

export interface ReviewMetrics {
  filesAnalyzed: number;
  linesOfCode: number;
  issuesFound: number;
  complexityScore: number;
  maintainabilityIndex: number;
  testCoverage?: number;
}

// Claude API Types - 基于官方文档
export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContent[];
}

export interface ClaudeContent {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | Record<string, unknown>;
  is_error?: boolean;
  tool_use_id?: string; // 新增：支持 tool_use_id
}

export interface ClaudeResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: ClaudeContent[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ClaudeStreamEvent {
  type:
    | "message_start"
    | "content_block_start"
    | "content_block_delta"
    | "content_block_stop"
    | "message_delta"
    | "message_stop";
  message?: Partial<ClaudeResponse>;
  content_block?: Record<string, unknown>;
  delta?: Record<string, unknown>;
  index?: number;
}

export interface StreamEvent {
  type:
    | "thinking"
    | "tool_start"
    | "tool_progress"
    | "tool_complete"
    | "response"
    | "complete"
    | "error";
  data: {
    content?: string;
    toolCall?: ToolCall;
    progress?: number;
    message?: Message;
    error?: AgentError;
  };
}

// Error Types
export interface AgentError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

export class ToolExecutionError extends Error {
  constructor(
    public toolName: string,
    public originalError: Error,
    message?: string
  ) {
    super(
      message || `Tool ${toolName} execution failed: ${originalError.message}`
    );
    this.name = "ToolExecutionError";
  }
}

export class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(`Validation error for ${field}: ${message}`);
    this.name = "ValidationError";
  }
}

// Utility Types
export type Awaitable<T> = T | Promise<T>;
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
