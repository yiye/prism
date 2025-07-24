/**
 * Claude 4 API Client
 * 基于 qwen-code contentGenerator 架构设计
 * 参考 Anthropic 官方文档实现
 */

import {
  AgentError,
  ClaudeMessage,
  ClaudeResponse,
  ClaudeStreamEvent,
  Tool,
  ToolResult,
} from '../../../../types';

export interface ClaudeConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature?: number;
  baseURL?: string;
}

export interface ClaudeToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export class ClaudeClient {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private baseURL: string;

  constructor(config: ClaudeConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature ?? 0.3;
    this.baseURL = config.baseURL ?? 'https://api.anthropic.com';

    if (!this.apiKey) {
      throw new Error('Claude API key is required');
    }
  }

  /**
   * 发送消息并获取完整响应
   * 参考 qwen-code 的 GeminiClient.generateContent 设计
   */
  async generateContent(
    messages: ClaudeMessage[],
    tools?: Tool[],
    systemPrompt?: string
  ): Promise<ClaudeResponse> {
    const requestBody = this.buildRequestBody(messages, tools, systemPrompt);
    
    try {
      const response = await fetch(`${this.baseURL}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw this.createAPIError(response.status, errorData);
      }

      const data = await response.json();
      return this.normalizeResponse(data);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Unknown error: ${error}`);
    }
  }

  /**
   * 流式生成内容
   * 参考 qwen-code 的流式处理设计
   */
  async *generateContentStream(
    messages: ClaudeMessage[],
    tools?: Tool[],
    systemPrompt?: string
  ): AsyncGenerator<ClaudeStreamEvent, void, unknown> {
    const requestBody = {
      ...this.buildRequestBody(messages, tools, systemPrompt),
      stream: true,
    };

    try {
      const response = await fetch(`${this.baseURL}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw this.createAPIError(response.status, errorData);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              yield this.parseStreamEvent(line);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Stream error: ${error}`);
    }
  }

  /**
   * 构建请求体
   * 参考 qwen-code 的 prompts 和工具集成方式
   */
  private buildRequestBody(
    messages: ClaudeMessage[],
    tools?: Tool[],
    systemPrompt?: string
  ) {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: messages,
    };

    // 添加系统提示词
    if (systemPrompt) {
      body.system = systemPrompt;
    }

    // 添加工具定义
    if (tools && tools.length > 0) {
      body.tools = tools.map(tool => this.convertToolToClaudeFormat(tool));
    }

    return body;
  }

  /**
   * 将内部工具格式转换为 Claude API 格式
   * 参考 qwen-code 的工具 schema 转换
   */
  private convertToolToClaudeFormat(tool: Tool): ClaudeToolDefinition {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: this.convertSchemaProperties(tool.schema.properties),
        required: tool.schema.required,
      },
    };
  }

  /**
   * 转换 schema 属性格式
   */
  private convertSchemaProperties(properties: Record<string, unknown>): Record<string, unknown> {
    const converted: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(properties)) {
      if (typeof value === 'object' && value !== null) {
        converted[key] = value;
      }
    }
    
    return converted;
  }

  /**
   * 解析流式事件
   * 参考 qwen-code 的流式事件处理
   */
  private parseStreamEvent(line: string): ClaudeStreamEvent {
    try {
      // Claude API 返回的是 "data: {...}" 格式
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6);
        if (jsonStr.trim() === '[DONE]') {
          return { type: 'message_stop' };
        }
        return JSON.parse(jsonStr) as ClaudeStreamEvent;
      }
      
      // 处理其他格式的事件
      return JSON.parse(line) as ClaudeStreamEvent;
    } catch (error) {
      console.warn('Failed to parse stream event:', line, error);
      return { type: 'message_stop' };
    }
  }

  /**
   * 标准化响应格式
   * 确保响应符合内部类型定义
   */
  private normalizeResponse(data: unknown): ClaudeResponse {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Invalid response format');
    }

    const response = data as ClaudeResponse;
    
    // 验证必要字段
    if (!response.id || !response.content) {
      throw new Error('Missing required response fields');
    }

    return response;
  }

  /**
   * 创建 API 错误
   * 参考 qwen-code 的错误处理机制
   */
     private createAPIError(status: number, errorData: unknown): AgentError {
     const error: AgentError = {
       code: `CLAUDE_API_ERROR_${status}`,
       message: 'Claude API request failed',
       timestamp: Date.now(),
       details: typeof errorData === 'object' && errorData !== null 
         ? errorData as Record<string, unknown>
         : { error: String(errorData) },
     };

    if (status === 401) {
      error.message = 'Invalid API key';
      error.code = 'CLAUDE_AUTH_ERROR';
    } else if (status === 429) {
      error.message = 'Rate limit exceeded';
      error.code = 'CLAUDE_RATE_LIMIT';
    } else if (status >= 500) {
      error.message = 'Claude API server error';
      error.code = 'CLAUDE_SERVER_ERROR';
    }

    return error;
  }

  /**
   * 验证工具调用结果并转换为 Claude 格式
   * 参考 qwen-code 的工具结果处理
   */
  formatToolResult(toolCallId: string, result: ToolResult): ClaudeMessage {
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          id: toolCallId,
          content: result.output,
          is_error: false,
        },
      ],
    };
  }

  /**
   * 格式化工具调用错误
   */
  formatToolError(toolCallId: string, error: Error): ClaudeMessage {
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          id: toolCallId,
          content: `Error: ${error.message}`,
          is_error: true,
        },
      ],
    };
  }

  /**
   * 计算消息 tokens 数量估算
   * 简单的字符数估算，实际项目中可以使用更精确的 tokenizer
   */
  estimateTokens(messages: ClaudeMessage[]): number {
    let totalChars = 0;
    
    for (const message of messages) {
      if (typeof message.content === 'string') {
        totalChars += message.content.length;
      } else if (Array.isArray(message.content)) {
        for (const content of message.content) {
          if (content.text) {
            totalChars += content.text.length;
          }
        }
      }
    }
    
    // 粗略估算：4 个字符约等于 1 个 token
    return Math.ceil(totalChars / 4);
  }

  /**
   * 检查模型能力
   * 参考 qwen-code 的模型检查机制
   */
  supportsTools(): boolean {
    return this.model.includes('claude-3') || this.model.includes('claude-4');
  }

  /**
   * 获取模型的上下文长度限制
   */
  getContextLimit(): number {
    if (this.model.includes('claude-4')) {
      return 200000; // Claude 4 的上下文长度
    } else if (this.model.includes('claude-3-5-sonnet')) {
      return 200000;
    } else if (this.model.includes('claude-3')) {
      return 200000;
    }
    return 100000; // 默认值
  }
} 