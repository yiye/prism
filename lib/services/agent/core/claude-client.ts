/**
 * Claude 4 API Client
 * 基于 @anthropic-ai/sdk 重构
 * 参考 Anthropic 官方文档实现
 */

import {
  AgentError,
  ClaudeContent,
  ClaudeMessage,
  ClaudeResponse,
  ClaudeStreamEvent,
  Message,
  MessageContent,
  Tool,
  ToolCall,
} from "@/types";
import Anthropic from "@anthropic-ai/sdk";
import { IdGenerator } from "../utils/agent-utils";

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
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

export class ClaudeClient {
  private anthropic: Anthropic;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config: ClaudeConfig) {
    if (!config.apiKey) {
      throw new Error("Claude API key is required");
    }

    this.anthropic = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });

    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature ?? 0.3;
  }

  /**
   * 流式生成内容
   * 使用官方 SDK 简化流式处理
   */
  async *generateContentStream(
    messages: ClaudeMessage[],
    tools?: Tool[],
    systemPrompt?: string
  ): AsyncGenerator<ClaudeStreamEvent, void, unknown> {
    try {
      // 转换工具格式
      const claudeTools = tools?.map((tool) =>
        this.convertToolToClaudeFormat(tool)
      );

      // 使用官方 SDK 的流式 API
      const stream = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemPrompt,
        messages: messages as Anthropic.Messages.MessageParam[],
        tools: claudeTools,
        stream: true,
      });

      // 处理流式响应
      for await (const chunk of stream) {
        const event = this.convertChunkToEvent(chunk);
        if (event) {
          yield event;
        }
      }
    } catch (error) {
      throw this.createAPIError(error);
    }
  }

  /**
   * 将 SDK chunk 转换为内部事件格式
   */
  private convertChunkToEvent(
    chunk: Anthropic.Messages.MessageStreamEvent
  ): ClaudeStreamEvent | null {
    switch (chunk.type) {
      case "message_start":
        return {
          type: "message_start",
          message: chunk.message as Partial<ClaudeResponse>,
        };

      case "content_block_start":
        return {
          type: "content_block_start",
          content_block: chunk.content_block as unknown as Record<
            string,
            unknown
          >,
          index: chunk.index,
        };

      case "content_block_delta":
        return {
          type: "content_block_delta",
          delta: chunk.delta as unknown as Record<string, unknown>,
          index: chunk.index,
        };

      case "content_block_stop":
        return {
          type: "content_block_stop",
          index: chunk.index,
        };

      case "message_delta":
        return {
          type: "message_delta",
          delta: chunk.delta as unknown as Record<string, unknown>,
        };

      case "message_stop":
        return {
          type: "message_stop",
        };

      default:
        console.debug("Unknown chunk type:", (chunk as { type: string }).type);
        return null;
    }
  }

  /**
   * 将内部工具格式转换为 Claude API 格式
   */
  private convertToolToClaudeFormat(tool: Tool): ClaudeToolDefinition {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: "object",
        properties: this.convertSchemaProperties(tool.schema.properties),
        required: tool.schema.required,
      },
    };
  }

  /**
   * 转换 schema 属性格式
   */
  private convertSchemaProperties(
    properties: Record<string, unknown>
  ): Record<string, unknown> {
    const converted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(properties)) {
      if (typeof value === "object" && value !== null) {
        converted[key] = value;
      }
    }

    return converted;
  }

  /**
   * 创建 API 错误
   */
  private createAPIError(error: unknown): AgentError {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const status = (error as { status?: number })?.status || 500;

    const agentError: AgentError = {
      code: `CLAUDE_API_ERROR_${status}`,
      message: "Claude API request failed",
      timestamp: Date.now(),
      details: { error: errorMessage },
    };

    if (status === 401) {
      agentError.message = "Invalid API key";
      agentError.code = "CLAUDE_AUTH_ERROR";
    } else if (status === 429) {
      agentError.message = "Rate limit exceeded";
      agentError.code = "CLAUDE_RATE_LIMIT";
    } else if (status >= 500) {
      agentError.message = "Claude API server error";
      agentError.code = "CLAUDE_SERVER_ERROR";
    }

    return agentError;
  }

  /**
   * 将工具调用结果转换为 Claude 消息格式
   */
  convertToolCallToUserMessage(toolCalls: ToolCall[]): Message {
    const toolResults: ClaudeContent[] = [];

    for (const toolCall of toolCalls) {
      if (toolCall.status === "completed" && toolCall.result) {
        // 成功的结果
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: toolCall.result.output,
          is_error: false,
        });
      } else if (toolCall.status === "failed") {
        // 失败的结果
        const errorMessage = toolCall.error || "Tool execution failed";
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: `Error: ${errorMessage}`,
          is_error: true,
        });
      }
    }

    return {
      id: IdGenerator.generateToolResultId(),
      role: "user",
      content: toolResults as string | MessageContent[],
      timestamp: Date.now(),
    };
  }

  buildAssistantMessage(content: string): Message {
    return {
      id: IdGenerator.generateMessageId(),
      role: "assistant",
      content,
      timestamp: Date.now(),
    };
  }

  /**
   * 计算消息 tokens 数量估算
   */
  estimateTokens(messages: ClaudeMessage[]): number {
    let totalChars = 0;

    for (const message of messages) {
      if (typeof message.content === "string") {
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
   */
  supportsTools(): boolean {
    return this.model.includes("claude-3") || this.model.includes("claude-4");
  }

  /**
   * 获取模型的上下文长度限制
   */
  getContextLimit(): number {
    if (this.model.includes("claude-4")) {
      return 200000; // Claude 4 的上下文长度
    } else if (this.model.includes("claude-3-5-sonnet")) {
      return 200000;
    } else if (this.model.includes("claude-3")) {
      return 200000;
    }
    return 100000; // 默认值
  }
}
