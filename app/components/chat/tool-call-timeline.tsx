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
 * 🎯 优化：添加状态变化动画和更好的视觉反馈
 */
export function ToolCallTimeline({ toolCalls }: ToolCallTimelineProps) {
  if (toolCalls.size === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {Array.from(toolCalls.values()).map((toolCall) => (
        <div
          key={toolCall.id}
          className={`border rounded-lg p-3 transition-all duration-300 ${
            toolCall.status === "running"
              ? "bg-blue-50 border-blue-200"
              : toolCall.status === "complete"
              ? "bg-green-50 border-green-200"
              : toolCall.status === "error"
              ? "bg-red-50 border-red-200"
              : "bg-gray-50 border-gray-200"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-gray-700">
              🔧 {toolCall.name}
            </span>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                toolCall.status === "running"
                  ? "bg-blue-100 text-blue-700 animate-pulse"
                  : toolCall.status === "complete"
                  ? "bg-green-100 text-green-700"
                  : toolCall.status === "error"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
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
            <div className="text-xs text-gray-600 bg-white p-2 rounded border mb-2">
              <div className="font-medium mb-1">参数:</div>
              <pre className="whitespace-pre-wrap text-xs">
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </div>
          )}

          {/* 工具输出 */}
          {toolCall.output && (
            <div className="text-xs text-gray-600 bg-white p-2 rounded border mb-2">
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
