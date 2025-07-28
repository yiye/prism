/**
 * Agent Loop 执行器
 * 从 agent.ts 中提取的循环执行逻辑
 */

import {
  AgentContext,
  ClaudeContent,
  ClaudeMessage,
  ClaudeStreamEvent,
  Message,
  StreamEvent,
  ToolCall,
} from "@/types";

import { ToolRegistry } from "../tools/tool-registry";
import { ToolScheduler, type ExecutionOptions } from "../tools/tool-scheduler";
import { ClaudeClient } from "./claude-client";

/**
 * Agent Loop 执行器
 * 负责管理 Agent 的循环执行逻辑
 */
export class AgentLoopExecutor {
  constructor(
    private claudeClient: ClaudeClient,
    private toolRegistry: ToolRegistry,
    private toolScheduler: ToolScheduler
  ) {}

  /**
   * 流式执行 Agent Loop
   */
  async *executeLoopStream(
    context: AgentContext,
    systemPrompt: string,
    abortController?: AbortController
  ): AsyncGenerator<StreamEvent, void, unknown> {
    let attempts = 0;

    while (attempts < context.state.maxTurns) {
      context.state.currentTurn = attempts + 1;

      try {
        // 构建 Claude 消息
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const claudeMessages = this.buildClaudeMessages(context) as any;

        yield {
          type: "thinking",
          data: { content: `Turn ${attempts + 1}: Analyzing your request...` },
        };

        // 流式调用 Claude API
        const responseStream = this.claudeClient.generateContentStream(
          claudeMessages,
          this.getAvailableTools(),
          systemPrompt
        );

        // 处理流式响应
        let accumulatedContent = "";
        let pendingToolCalls: ToolCall[] = [];

        for await (const event of responseStream) {
          if (abortController?.signal.aborted) {
            return;
          }

          const streamResult = this.processStreamEvent(
            event,
            accumulatedContent,
            pendingToolCalls
          );

          if (streamResult.events) {
            for (const streamEvent of streamResult.events) {
              yield streamEvent;
            }
          }

          accumulatedContent = streamResult.content;
          pendingToolCalls = streamResult.toolCalls;
        }

        // 🎯 关键修复：保存 Claude 的响应内容到 context
        if (accumulatedContent.trim()) {
          const assistantMessage: Message = {
            id: this.generateMessageId(),
            role: "assistant",
            content: accumulatedContent,
            timestamp: Date.now(),
          };
          context.messages.push(assistantMessage);
        }

        // 如果有工具调用，执行它们
        if (pendingToolCalls.length > 0) {
          yield* this.executeToolsStream(
            pendingToolCalls,
            context,
            abortController
          );

          // 🎯 关键修复：工具执行后继续下一轮循环
          attempts++;
          continue;
        }

        // 🎯 关键修复：如果没有工具调用且有内容，返回最终响应
        if (pendingToolCalls.length === 0 && accumulatedContent.trim()) {
          yield {
            type: "complete",
            data: { message: context.messages[context.messages.length - 1] },
          };
          return;
        }

        // 🎯 关键修复：如果既没有工具调用也没有内容，可能是错误情况
        if (pendingToolCalls.length === 0 && !accumulatedContent.trim()) {
          console.warn(
            `Turn ${attempts + 1}: No content or tool calls generated`
          );
          attempts++;
          continue;
        }

        attempts++;
      } catch (error) {
        if (attempts >= context.state.maxTurns - 1) {
          throw error;
        }
        console.warn(`Stream attempt ${attempts + 1} failed:`, error);
        attempts++;
      }
    }

    throw new Error("Agent loop exceeded maximum turns");
  }

  /**
   * 处理流式事件
   */
  private processStreamEvent(
    event: ClaudeStreamEvent,
    currentContent: string,
    currentToolCalls: ToolCall[]
  ): {
    content: string;
    toolCalls: ToolCall[];
    events?: StreamEvent[];
  } {
    const events: StreamEvent[] = [];

    switch (event.type) {
      case "content_block_delta":
        if (event.delta?.text && typeof event.delta.text === "string") {
          // 累积内容用于内部状态管理
          currentContent += event.delta.text;
          // 发送增量内容给前端，实现打字机效果
          events.push({
            type: "response",
            data: { content: event.delta.text },
          });
        }
        break;

      case "content_block_start":
        if (event.content_block?.type === "tool_use") {
          const contentBlock = event.content_block as Record<string, unknown>;
          const toolCall: ToolCall = {
            id: String(contentBlock.id || ""),
            tool: String(contentBlock.name || ""),
            params: {},
            status: "pending",
          };
          currentToolCalls.push(toolCall);

          events.push({
            type: "tool_start",
            data: { toolCall },
          });
        }
        break;

      case "message_stop":
        // 消息结束
        break;
    }

    return {
      content: currentContent,
      toolCalls: currentToolCalls,
      events,
    };
  }

  /**
   * 流式执行工具调用
   */
  private async *executeToolsStream(
    toolCalls: ToolCall[],
    context: AgentContext,
    abortController?: AbortController
  ): AsyncGenerator<StreamEvent, void, unknown> {
    for (const toolCall of toolCalls) {
      yield {
        type: "tool_start",
        data: { toolCall },
      };

      try {
        toolCall.status = "executing";
        toolCall.startTime = Date.now();

        const executionOptions: ExecutionOptions = {
          signal: abortController?.signal,
          timeout: 30000,
        };

        const result = await this.toolScheduler.scheduleTool(
          toolCall.tool as never,
          toolCall.params,
          executionOptions
        );

        toolCall.status = result.success ? "completed" : "failed";
        toolCall.endTime = Date.now();
        toolCall.result = result;

        if (!result.success) {
          toolCall.error = result.error;
        }

        yield {
          type: "tool_complete",
          data: { toolCall },
        };
      } catch (error) {
        toolCall.status = "failed";
        toolCall.endTime = Date.now();
        toolCall.error = error instanceof Error ? error.message : String(error);

        yield {
          type: "error",
          data: {
            error: {
              code: "TOOL_ERROR",
              message: error instanceof Error ? error.message : String(error),
              timestamp: Date.now(),
            },
          },
        };
      }
    }

    // 🎯 关键修复：将工具结果作为独立的 assistant 消息展示
    // 这样工具调用结果会按时间顺序出现在对话中
    const toolResultMessage: Message = {
      id: this.generateMessageId(),
      role: "assistant", // 改为 assistant 角色
      content: "工具调用完成", // 简短的提示信息
      timestamp: Date.now(),
      metadata: { tool_calls: toolCalls },
    };

    context.messages.push(toolResultMessage);
  }

  /**
   * 构建 Claude 消息格式
   */
  private buildClaudeMessages(context: AgentContext): ClaudeMessage[] {
    return context.messages
      .filter((msg) => msg.role !== "system")
      .map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: this.convertMessageContent(msg.content),
      }));
  }

  /**
   * 转换消息内容格式
   */
  private convertMessageContent(
    content: string | unknown[]
  ): string | ClaudeContent[] {
    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content.map((item) => {
        if (typeof item === "string") {
          return { type: "text", text: item } as ClaudeContent;
        }
        return item as ClaudeContent;
      });
    }

    return String(content);
  }

  /**
   * 获取可用工具
   */
  private getAvailableTools() {
    return this.toolRegistry.list();
  }

  /**
   * 生成消息 ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
