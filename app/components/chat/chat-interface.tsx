"use client";

/**
 * 🌟 Enhanced Chat Interface Component - 璇玑专属版
 * 现代化聊天界面，重构后版本
 * 使用自定义hooks分离逻辑，遵循Next.js最佳实践
 */

import { useEffect } from "react";

import { useApiHealth } from "../../../hooks/use-api-health";
import { useChat } from "../../../hooks/use-chat";
import { useScrollToBottom } from "../../../hooks/use-scroll-to-bottom";
import { ErrorDisplay } from "../ui/error-display";

import { ChatEmptyState } from "./chat-empty-state";
import { ChatHeader } from "./chat-header";
import { ChatInput } from "./chat-input";
import { ChatMessage } from "./chat-message";
import { ToolCallTimeline } from "./tool-call-timeline";

interface ChatInterfaceProps {
  sessionId?: string;
  onSessionChange?: (sessionId: string) => void;
}

export function ChatInterface({
  sessionId,
  onSessionChange,
}: ChatInterfaceProps) {
  // 聊天逻辑
  const {
    messages,
    inputValue,
    isLoading,
    currentSessionId,
    error,
    streamingMessage,
    setInputValue,
    sendMessage,
    stopGeneration,
    clearChat,
    handleKeyPress,
  } = useChat({ sessionId, onSessionChange });

  // API健康检查
  const { apiStatus } = useApiHealth();

  // 自动滚动到底部
  const messagesEndRef = useScrollToBottom([messages, streamingMessage]);

  // 监听快速操作事件
  useEffect(() => {
    const handleQuickAction = (event: CustomEvent) => {
      const { prompt } = event.detail;
      setInputValue(prompt);
    };

    window.addEventListener("quick-action", handleQuickAction as EventListener);

    return () => {
      window.removeEventListener(
        "quick-action",
        handleQuickAction as EventListener
      );
    };
  }, [setInputValue]);

  // 处理示例点击
  const handleExampleClick = (example: string) => {
    setInputValue(example);
  };

  // 重试错误操作
  const handleRetry = () => {
    if (inputValue.trim()) {
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full max-w-none bg-white shadow-xl">
      {/* 固定头部 */}
      <div className="flex-shrink-0">
        <ChatHeader apiStatus={apiStatus} onClearChat={clearChat} />
      </div>

      {/* 滚动消息区域 */}
      <div className="flex-1 overflow-y-auto bg-gray-50/30 scroll-smooth">
        <div className="p-2 sm:p-4 space-y-3 sm:space-y-4 min-h-full">
          {messages.length === 0 && !streamingMessage && (
            <ChatEmptyState onExampleClick={handleExampleClick} />
          )}

          {/* 历史消息 */}
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {/* 流式消息 */}
          {streamingMessage && (
            <div>
              {/* 工具调用时间线 */}
              {streamingMessage.toolCalls &&
                streamingMessage.toolCalls.size > 0 && (
                  <ToolCallTimeline toolCalls={streamingMessage.toolCalls} />
                )}

              {/* Claude 响应 */}
              {streamingMessage.content && (
                <ChatMessage
                  message={{
                    id: "streaming",
                    role: "assistant",
                    content: streamingMessage.content,
                    timestamp: Date.now(),
                  }}
                  isStreaming={true}
                />
              )}
            </div>
          )}

          {/* 错误显示 */}
          {error && <ErrorDisplay error={error} onRetry={handleRetry} />}

          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      {/* 固定输入框 */}
      <div className="flex-shrink-0">
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={sendMessage}
          onKeyPress={handleKeyPress}
          isLoading={isLoading}
          isDisabled={apiStatus !== "healthy"}
          onStop={stopGeneration}
          currentSessionId={currentSessionId}
        />
      </div>
    </div>
  );
}
