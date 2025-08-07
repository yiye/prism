/**
 * Agent Loop 执行器
 * 从 agent.ts 中提取的循环执行逻辑
 */

import {
  AgentContext,
  ClaudeContent,
  ClaudeMessage,
  StreamEvent,
  ToolCall,
} from "@/types";
import Anthropic from "@anthropic-ai/sdk";
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

        const availableTools = this.getAvailableTools();

        // 流式调用 Claude API
        const responseStream = this.claudeClient.generateContentStream(
          claudeMessages,
          availableTools,
          systemPrompt
        );

        // 处理流式响应
        let accumulatedContent = "";
        let pendingToolCalls: ToolCall[] = [];
        let messageId = "";

        console.log(`turn ${attempts + 1}, content: \n`);
        for await (const chunk of responseStream) {
          if (abortController?.signal.aborted) {
            return;
          }
          if (chunk.type === "message_start") {
            messageId = chunk.message.id;
          }
          const streamResult = this.processStreamChunk(
            chunk,
            accumulatedContent,
            pendingToolCalls
          );

          if (streamResult.events) {
            for (const streamEvent of streamResult.events) {
              if (streamEvent.type === "response") {
                // console.log(streamEvent.data.content);
              } else {
                // console.log(streamEvent);
              }
              // tool_start 的消息在 executeToolsStream 中返回，不需要在这里返回
              if (streamEvent.type !== "tool_start") {
                yield streamEvent;
              }
            }
          }

          accumulatedContent = streamResult.content;
          pendingToolCalls = streamResult.toolCalls;
        }
        console.log(
          `turn ${attempts + 1} , accumulatedContent: \n ${accumulatedContent}`
        );
        console.log(
          `turn ${attempts + 1} , pendingToolCalls: \n ${pendingToolCalls.map(
            (toolCall) => toolCall.tool
          )}`
        );
        // 保存 Claude 的响应内容到 context
        if (accumulatedContent.trim()) {
          // TODO: 需要添加 tool_use 信息，解决后边的报错 Each `tool_result` block must have a corresponding `tool_use` block in the previous message
          // TODO: message Id 使用 Message_start 消息里的
          const assistantMessage = this.claudeClient.buildAssistantMessage(
            messageId,
            accumulatedContent,
            pendingToolCalls
          );
          context.messages.push(assistantMessage);
        }

        // 如果有工具调用，执行它们
        if (pendingToolCalls.length > 0) {
          // 🎯 使用 for await 来同时处理流式事件和收集结果
          const toolStream = this.executeToolsStream(
            pendingToolCalls,
            abortController
          );

          const completedToolCalls: ToolCall[] = [];
          for await (const event of toolStream) {
            if (event.type === "tool_complete" && event.data.toolCall) {
              completedToolCalls.push(event.data.toolCall);
            }
            // 处理流式事件（给UI）
            yield event;
          }

          if (completedToolCalls.length > 0) {
            const userMessage =
              this.claudeClient.convertToolCallToUserMessage(
                completedToolCalls
              );

            // 添加到 context 中，这样下一轮循环时会被包含在 buildClaudeMessages 中
            context.messages.push(userMessage);
          }

          // 工具执行后继续下一轮循环
          attempts++;
          continue;
        }

        // 如果没有工具调用且有内容，返回最终响应
        if (pendingToolCalls.length === 0 && accumulatedContent.trim()) {
          yield {
            type: "complete",
            data: { message: context.messages[context.messages.length - 1] },
          };
          return;
        }

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
  private processStreamChunk(
    chunk: Anthropic.Messages.RawMessageStreamEvent,
    currentContent: string,
    currentToolCalls: ToolCall[]
  ): {
    content: string;
    toolCalls: ToolCall[];
    events?: StreamEvent[];
  } {
    const events: StreamEvent[] = [];

    switch (chunk.type) {
      case "content_block_delta":
        if (chunk.delta?.type === "text_delta" && chunk.delta.text) {
          // 累积内容用于内部状态管理
          currentContent += chunk.delta.text;
          // 发送增量内容给前端，实现打字机效果
          events.push({
            type: "response",
            data: { content: chunk.delta.text },
          });
        }
        break;

      case "content_block_start":
        if (chunk.content_block?.type === "tool_use") {
          const contentBlock =
            chunk.content_block as Anthropic.Messages.ToolUseBlock;
          const input = contentBlock.input as string;
          let params: Record<string, unknown> = {};
          if (typeof input === "string" && input?.startsWith("{")) {
            const parsedInput = JSON.parse(input);
            params = parsedInput;
          }
          const toolCall: ToolCall = {
            id: String(contentBlock.id || ""),
            tool: String(contentBlock.name || ""),
            params,
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
  }

  /**
   * 构建 Claude 消息格式
   */
  private buildClaudeMessages(context: AgentContext): ClaudeMessage[] {
    return context.messages.map((msg) => ({
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
}
