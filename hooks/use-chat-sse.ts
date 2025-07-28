/**
 * Chat SSE (Server-Sent Events) Hook
 * 🌊 流式响应处理逻辑
 * 专门处理 SSE 连接和事件处理
 */

import { useCallback } from "react";

import type { Message, StreamingMessage } from "./use-chat-state";

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
            (prev) => prev || { content: "", toolCalls: new Map() }
          );
          break;

        case "tool_start":
          if (event.data.toolCall) {
            updateStreamingMessage((prev) => {
              if (!prev) return { content: "", toolCalls: new Map() };
              const newToolCalls = new Map(prev.toolCalls);
              const toolName =
                event.data.toolCall!.name ||
                event.data.toolCall!.tool ||
                "unknown";
              newToolCalls.set(event.data.toolCall!.id, {
                id: event.data.toolCall!.id,
                name: toolName,
                status: "running" as const,
                input: event.data.toolCall!.params || {},
              });
              return { ...prev, toolCalls: newToolCalls };
            });
          }
          break;

        case "tool_complete":
          if (event.data.toolCall) {
            updateStreamingMessage((prev) => {
              if (!prev) return { content: "", toolCalls: new Map() };
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

              newToolCalls.set(event.data.toolCall!.id, {
                ...existingTool,
                id: event.data.toolCall!.id,
                name: toolName,
                status: error ? ("error" as const) : ("complete" as const),
                output: output,
                error: error,
                input: event.data.toolCall!.params || existingTool?.input || {},
              });
              return { ...prev, toolCalls: newToolCalls };
            });
          }
          break;

        case "response":
          if (event.data.content && typeof event.data.content === "string") {
            updateStreamingMessage((prev) => {
              if (!prev)
                return {
                  content: event.data.content as string,
                  toolCalls: new Map(),
                };
              // 累积增量内容，实现打字机效果
              return { ...prev, content: prev.content + event.data.content };
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
          setError(
            typeof event.data.error === "string"
              ? event.data.error
              : "Unknown streaming error"
          );
          break;
      }
    },
    [
      currentSessionId,
      onSessionChange,
      updateStreamingMessage,
      setError,
      updateSessionId,
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
