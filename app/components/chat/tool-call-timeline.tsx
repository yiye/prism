/**
 * Tool Call Timeline Component
 * 🔧 工具调用时间线组件
 * 专门展示工具调用的详细信息和执行状态
 */

import type { ToolCall } from "../../../hooks/use-chat-state";

interface ToolCallTimelineProps {
  toolCalls: Map<string, ToolCall>;
}

/**
 * 工具调用时间线组件
 * 展示工具调用的详细信息，包括参数、状态、结果等
 */
export function ToolCallTimeline({ toolCalls }: ToolCallTimelineProps) {
  if (toolCalls.size === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {Array.from(toolCalls.values()).map((toolCall) => (
        <div
          key={toolCall.id}
          className="bg-blue-50 border border-blue-200 rounded-lg p-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-blue-700">
              🔧 {toolCall.name}
            </span>
            <span className="text-xs text-blue-600">
              {toolCall.status === "running"
                ? "执行中..."
                : toolCall.status === "complete"
                ? "已完成"
                : toolCall.status === "error"
                ? "执行失败"
                : "等待中"}
            </span>
          </div>

          {/* 工具参数 */}
          {toolCall.input && Object.keys(toolCall.input).length > 0 && (
            <div className="text-xs text-blue-600 bg-white p-2 rounded border mb-2">
              <div className="font-medium mb-1">参数:</div>
              <pre className="whitespace-pre-wrap text-xs">
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </div>
          )}

          {/* 工具输出 */}
          {toolCall.output && (
            <div className="text-xs text-blue-600 bg-white p-2 rounded border mb-2">
              <div className="font-medium mb-1">输出:</div>
              <pre className="whitespace-pre-wrap text-xs max-h-32 overflow-y-auto">
                {toolCall.output}
              </pre>
            </div>
          )}

          {/* 错误信息 */}
          {toolCall.error && (
            <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
              <div className="font-medium mb-1">错误:</div>
              <pre className="whitespace-pre-wrap text-xs">
                {toolCall.error}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
