/**
 * Streaming Message Component
 * 🌊 流式消息组件
 * 专门处理 Claude 响应和工具调用的交错展示
 */

import type {
  StreamingMessage,
  StreamingSegment,
} from "../../../hooks/use-chat-state";

import { ChatMessage } from "./chat-message";
import { ToolCallTimeline } from "./tool-call-timeline";

interface StreamingMessageProps {
  streamingMessage: StreamingMessage;
}

/**
 * 流式消息组件
 * 按时间顺序交错展示 Claude 响应和工具调用
 * 🎯 优化：避免重复渲染相同ID的工具调用
 */
export function StreamingMessage({ streamingMessage }: StreamingMessageProps) {
  const { segments } = streamingMessage;

  // 🎯 优化：使用Map跟踪工具调用的最新状态，避免重复渲染
  const toolCallMap = new Map<string, StreamingSegment>();
  const renderItems: Array<{
    type: "claude_response" | "tool_call";
    id: string;
    data: StreamingSegment;
  }> = [];

  // 按时间顺序处理分段，工具调用只保留最新状态
  segments.forEach((segment) => {
    if (segment.type === "claude_response") {
      // Claude 响应直接添加
      renderItems.push({
        type: "claude_response",
        id: segment.id,
        data: segment,
      });
    } else if (segment.type === "tool_call" || segment.type === "tool_result") {
      if (segment.toolCall) {
        const toolId = segment.toolCall.id;

        // 🎯 关键优化：更新工具调用的最新状态
        toolCallMap.set(toolId, segment);

        // 检查是否已经在渲染列表中
        const existingIndex = renderItems.findIndex(
          (item) => item.type === "tool_call" && item.id === toolId
        );

        if (existingIndex === -1) {
          // 首次出现，添加到渲染列表
          renderItems.push({
            type: "tool_call",
            id: toolId,
            data: segment,
          });
        } else {
          // 🎯 已存在，更新为最新状态（这会触发React重新渲染该组件）
          renderItems[existingIndex] = {
            type: "tool_call",
            id: toolId,
            data: segment,
          };
        }
      }
    }
  });

  return (
    <div className="space-y-3">
      {renderItems.map((item) => {
        switch (item.type) {
          case "claude_response":
            return (
              <ChatMessage
                key={item.id}
                message={{
                  id: item.id,
                  role: "assistant",
                  content: item.data.content || "",
                  timestamp: item.data.timestamp,
                }}
                isStreaming={true}
              />
            );

          case "tool_call":
            if (item.data.toolCall) {
              // 🎯 使用工具调用ID作为key，确保状态更新时能正确重新渲染
              return (
                <ToolCallTimeline
                  key={`tool_${item.data.toolCall.id}`}
                  toolCalls={
                    new Map([[item.data.toolCall.id, item.data.toolCall]])
                  }
                />
              );
            }
            return null;

          default:
            return null;
        }
      })}
    </div>
  );
}
