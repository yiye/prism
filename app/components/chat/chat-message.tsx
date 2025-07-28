/**
 * Chat Message Component
 * 💬 聊天消息UI组件
 * 分离消息显示逻辑，提高组件复用性
 */

import {
  AlertCircle,
  Bot,
  CheckCircle,
  Loader2,
  User,
  Wrench,
  Zap,
} from "lucide-react";

import type { Message, ToolCall } from "../../../hooks/use-chat-state";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
}

// Tool Call Component
function ToolCallDisplay({ toolCall }: { toolCall: ToolCall }) {
  const getStatusIcon = () => {
    switch (toolCall.status) {
      case "running":
        return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />;
      case "complete":
        return <CheckCircle className="w-3 h-3 text-green-500" />;
      case "error":
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      default:
        return <Loader2 className="w-3 h-3 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (toolCall.status) {
      case "running":
        return "执行中...";
      case "complete":
        return "已完成";
      case "error":
        return "执行失败";
      default:
        return "等待中";
    }
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2">
      <div className="flex items-center gap-2 mb-2">
        <Wrench className="w-4 h-4 text-purple-500" />
        <span className="text-sm font-medium text-gray-700">
          {toolCall.name}
        </span>
        {getStatusIcon()}
        <span className="text-xs text-gray-500">{getStatusText()}</span>
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
          <pre className="whitespace-pre-wrap text-xs">{toolCall.error}</pre>
        </div>
      )}
    </div>
  );
}

// Message Content Renderer
function MessageContent({ content }: { content: string }) {
  if (!content) return null;

  // Check for code blocks
  if (content.includes("```")) {
    const parts = content.split(/(```[\s\S]*?```)/g);
    return (
      <>
        {parts.map((part, index) => {
          if (part.startsWith("```")) {
            const codeContent = part.slice(3, -3);
            const [language, ...code] = codeContent.split("\n");
            return (
              <pre
                key={index}
                className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto my-2"
              >
                {language && (
                  <div className="text-xs text-gray-400 mb-2">{language}</div>
                )}
                <code>{code.join("\n")}</code>
              </pre>
            );
          }
          return (
            <span key={index} className="whitespace-pre-wrap">
              {part}
            </span>
          );
        })}
      </>
    );
  }

  return <span className="whitespace-pre-wrap">{content}</span>;
}

// Message Metadata
function MessageMetadata({ message }: { message: Message }) {
  return (
    <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-200/30">
      <span className="text-xs opacity-75">
        {new Date(message.timestamp).toLocaleTimeString()}
      </span>
      {message.metadata?.tokens && (
        <span className="text-xs opacity-75 flex items-center gap-1">
          <Zap className="w-3 h-3" />
          {message.metadata.tokens.input + message.metadata.tokens.output}{" "}
          tokens
        </span>
      )}
    </div>
  );
}

// Main Message Component
export function ChatMessage({
  message,
  isStreaming = false,
}: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-3xl p-4 rounded-2xl shadow-sm ${
          isUser
            ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white"
            : "bg-white border border-gray-200 text-gray-900"
        }`}
      >
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 mt-1">
            {isUser ? (
              <User className="w-4 h-4" />
            ) : (
              <Bot className="w-4 h-4 text-blue-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            {/* Tool calls display */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="mb-3">
                {message.toolCalls.map((toolCall) => (
                  <ToolCallDisplay key={toolCall.id} toolCall={toolCall} />
                ))}
              </div>
            )}

            {/* Message content */}
            <div className="prose prose-sm max-w-none">
              <MessageContent content={message.content} />
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1" />
              )}
            </div>

            {/* Message metadata */}
            <MessageMetadata message={message} />
          </div>
        </div>
      </div>
    </div>
  );
}
