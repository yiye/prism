'use client';

/**
 * Chat Context - 聊天状态管理
 * 提供全局聊天状态管理，支持快速操作和消息传递
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ChatContextType {
  // 快速操作相关
  triggerQuickAction: (prompt: string) => void;
  // 聊天状态
  isQuickActionTriggered: boolean;
  clearQuickAction: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

interface ChatProviderProps {
  children: ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
  const [isQuickActionTriggered, setIsQuickActionTriggered] = useState(false);

  const triggerQuickAction = (prompt: string) => {
    // 这里可以触发快速操作
    console.log('Quick action triggered:', prompt);
    setIsQuickActionTriggered(true);
    
    // 可以通过事件或其他方式将prompt传递给ChatInterface
    // 这里可以触发一个自定义事件
    window.dispatchEvent(new CustomEvent('quick-action', { detail: { prompt } }));
  };

  const clearQuickAction = () => {
    setIsQuickActionTriggered(false);
  };

  const value: ChatContextType = {
    triggerQuickAction,
    isQuickActionTriggered,
    clearQuickAction,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
} 