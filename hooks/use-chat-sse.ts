/**
 * Chat SSE (Server-Sent Events) Hook
 * 🌊 流式响应处理逻辑
 * 专门处理 SSE 连接和事件处理
 */

import { useCallback } from "react";

import type { Message, StreamingMessage, ToolCall } from "./use-chat-state";

// SSE Event Types
export interface SSEEvent {
  type: string;
  data: {
    sessionId?: string;
    content?: string;
    error?: string;
    toolCall?: {
      id: string;
      name?: string;
      tool?: string;
      status?: string;
      output?: string;
      error?: string;
      params?: Record<string, unknown>; // Added for tool_start
      result?: {
        // Added for tool_complete
        output?: string;
        error?: string;
      };
    };
    message?: Message; // Added for complete
    [key: string]: unknown;
  };
}

interface UseChatSSEProps {
  currentSessionId?: string;
  onSessionChange?: (sessionId: string) => void;
  updateStreamingMessage: (
    updater: (prev: StreamingMessage | null) => StreamingMessage | null
  ) => void;
  setError: (error: string | null) => void;
  updateSessionId: (sessionId: string) => void;
  addMessage?: (message: Message) => void; // 添加 addMessage 支持
}

export function useChatSSE({
  currentSessionId,
  onSessionChange,
  updateStreamingMessage,
  setError,
  updateSessionId,
  addMessage,
}: UseChatSSEProps) {
  // Handle individual SSE events
  const handleSSEEvent = useCallback(
    (event: SSEEvent) => {
      switch (event.type) {
        case "connected":
          if (
            event.data.sessionId &&
            event.data.sessionId !== currentSessionId
          ) {
            updateSessionId(event.data.sessionId);
            if (onSessionChange) {
              onSessionChange(event.data.sessionId);
            }
          }
          break;

        case "thinking":
          updateStreamingMessage(
            (prev) =>
              prev || {
                content: "",
                toolCalls: new Map(),
                segments: [],
              }
          );
          break;

        case "response":
          if (event.data.content && typeof event.data.content === "string") {
            updateStreamingMessage((prev) => {
              if (!prev) {
                return {
                  content: event.data.content as string,
                  toolCalls: new Map(),
                  segments: [
                    {
                      id: `claude_${Date.now()}`,
                      type: "claude_response",
                      content: event.data.content as string,
                      timestamp: Date.now(),
                    },
                  ],
                };
              }
              // 累积增量内容，实现打字机效果
              const newContent = prev.content + event.data.content;

              // 更新最后一个 Claude 响应分段，或创建新的分段
              const newSegments = [...prev.segments];
              const lastSegment = newSegments[newSegments.length - 1];

              if (lastSegment && lastSegment.type === "claude_response") {
                // 更新现有分段
                lastSegment.content = newContent;
              } else {
                // 创建新的 Claude 响应分段
                newSegments.push({
                  id: `claude_${Date.now()}`,
                  type: "claude_response",
                  content: event.data.content as string,
                  timestamp: Date.now(),
                });
              }

              return {
                ...prev,
                content: newContent,
                segments: newSegments,
              };
            });
          }
          break;

        case "tool_start":
          if (event.data.toolCall) {
            updateStreamingMessage((prev) => {
              if (!prev)
                return {
                  content: "",
                  toolCalls: new Map(),
                  segments: [],
                };

              const newToolCalls = new Map(prev.toolCalls);
              const toolName =
                event.data.toolCall!.name ||
                event.data.toolCall!.tool ||
                "unknown";
              const toolCall: ToolCall = {
                id: event.data.toolCall!.id,
                name: toolName,
                status: "running" as const,
                input: event.data.toolCall!.params || {},
              };

              newToolCalls.set(event.data.toolCall!.id, toolCall);

              // 添加工具调用分段
              const newSegments = [...prev.segments];
              newSegments.push({
                id: `tool_${event.data.toolCall!.id}`,
                type: "tool_call",
                toolCall: toolCall,
                timestamp: Date.now(),
              });

              return {
                ...prev,
                toolCalls: newToolCalls,
                segments: newSegments,
              };
            });
          }
          break;

        case "tool_complete":
          if (event.data.toolCall) {
            updateStreamingMessage((prev) => {
              if (!prev)
                return {
                  content: "",
                  toolCalls: new Map(),
                  segments: [],
                };

              const newToolCalls = new Map(prev.toolCalls);
              const existingTool = newToolCalls.get(event.data.toolCall!.id);

              // 获取工具结果
              const result = event.data.toolCall!.result;
              const output = result?.output || event.data.toolCall!.output;
              const error = event.data.toolCall!.error || result?.error;
              const toolName =
                event.data.toolCall!.name ||
                event.data.toolCall!.tool ||
                "unknown";

              const updatedToolCall: ToolCall = {
                ...existingTool,
                id: event.data.toolCall!.id,
                name: toolName,
                status: error ? ("error" as const) : ("complete" as const),
                output: output,
                error: error,
                input: event.data.toolCall!.params || existingTool?.input || {},
              };

              newToolCalls.set(event.data.toolCall!.id, updatedToolCall);

              // 🎯 关键修复：更新现有工具调用分段，而不是创建新分段
              const newSegments = [...prev.segments];
              const toolSegmentIndex = newSegments.findIndex(
                (seg) =>
                  seg.type === "tool_call" &&
                  seg.toolCall?.id === event.data.toolCall!.id
              );

              if (toolSegmentIndex !== -1) {
                // 🎯 更新现有分段的状态，保持相同的ID
                newSegments[toolSegmentIndex] = {
                  ...newSegments[toolSegmentIndex],
                  toolCall: updatedToolCall,
                };
              } else {
                // 🎯 如果没找到现有分段，创建新的分段（这种情况不应该发生，但为了健壮性）
                console.warn(
                  `Tool segment not found for ID: ${event.data.toolCall!.id}`
                );
                newSegments.push({
                  id: `tool_${event.data.toolCall!.id}`,
                  type: "tool_call",
                  toolCall: updatedToolCall,
                  timestamp: Date.now(),
                });
              }

              return {
                ...prev,
                toolCalls: newToolCalls,
                segments: newSegments,
              };
            });
          }
          break;

        case "complete":
          console.log("Stream complete:", event.data);
          // 如果有完整消息，直接保存到历史记录
          if (event.data.message && addMessage) {
            // 检查是否已经添加过相同的消息，避免重复
            const messageId = (event.data.message as Message).id;
            // 这里可以添加重复检查逻辑，暂时直接添加
            addMessage(event.data.message as Message);
            // 清空流式消息，避免重复处理
            updateStreamingMessage(() => null);
          }
          break;

        case "error":
          if (event.data.error) {
            setError(event.data.error as string);
          }
          break;

        default:
          console.log("Unknown SSE event type:", event.type);
      }
    },
    [
      currentSessionId,
      onSessionChange,
      updateSessionId,
      updateStreamingMessage,
      setError,
      addMessage,
    ]
  );

  // Process SSE stream
  const processSSEStream = useCallback(
    async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const eventData = JSON.parse(line.slice(6)) as SSEEvent;
              handleSSEEvent(eventData);
            } catch (error) {
              console.warn("Failed to parse SSE event:", line, error);
            }
          }
        }
      }
    },
    [handleSSEEvent]
  );

  return {
    handleSSEEvent,
    processSSEStream,
  };
}
