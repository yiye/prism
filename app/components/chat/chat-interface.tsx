'use client';

/**
 * 🌟 Enhanced Chat Interface Component - 璇玑专属版
 * 现代化聊天界面，重构后版本
 * 使用自定义hooks分离逻辑，遵循Next.js最佳实践
 */

import React from 'react';

// Custom Hooks
import { useApiHealth } from '../../../hooks/use-api-health';
import { useChat } from '../../../hooks/use-chat';
import { useScrollToBottom } from '../../../hooks/use-scroll-to-bottom';
// UI Components (通用组件)
import { ErrorDisplay } from '../ui/error-display';
// Chat Sub-components (聊天模块内部组件)
import { ChatEmptyState } from './chat-empty-state';
import { ChatHeader } from './chat-header';
import { ChatInput } from './chat-input';
import { ChatMessage } from './chat-message';

interface ChatInterfaceProps {
  sessionId?: string;
  onSessionChange?: (sessionId: string) => void;
}

export function ChatInterface({ sessionId, onSessionChange }: ChatInterfaceProps) {
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
    <div className="flex flex-col h-[600px] max-w-4xl mx-auto bg-white shadow-xl rounded-xl border border-gray-200">
      {/* 头部 */}
      <ChatHeader
        apiStatus={apiStatus}
        onClearChat={clearChat}
      />

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30">
        {messages.length === 0 && !streamingMessage && (
          <ChatEmptyState onExampleClick={handleExampleClick} />
        )}

        {/* 历史消息 */}
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {/* 流式消息 */}
        {streamingMessage && (
          <ChatMessage 
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingMessage.content,
              timestamp: Date.now(),
              toolCalls: Array.from(streamingMessage.toolCalls.values()),
            }}
            isStreaming={true}
          />
        )}

        {/* 错误显示 */}
        {error && (
          <ErrorDisplay 
            error={error} 
            onRetry={handleRetry}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={sendMessage}
        onKeyPress={handleKeyPress}
        isLoading={isLoading}
        isDisabled={apiStatus !== 'healthy'}
        onStop={stopGeneration}
        currentSessionId={currentSessionId}
      />
    </div>
  );
} 