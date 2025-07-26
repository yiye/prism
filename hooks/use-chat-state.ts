/**
 * Chat State Management Hook
 * 🧠 聊天状态管理逻辑
 * 分离状态管理逻辑，提高组件可维护性
 */

import {
  useCallback,
  useState,
} from 'react';

// Types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  metadata?: {
    sessionId?: string;
    model?: string;
    tokens?: {
      input: number;
      output: number;
    };
    processingTime?: number;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  status: 'running' | 'complete' | 'error';
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
}

export interface StreamingMessage {
  content: string;
  toolCalls: Map<string, ToolCall>;
}

// Hook
export function useChatState(initialSessionId?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(initialSessionId);
  const [error, setError] = useState<string | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<StreamingMessage | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Actions
  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const updateStreamingMessage = useCallback((updater: (prev: StreamingMessage | null) => StreamingMessage | null) => {
    setStreamingMessage(updater);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setCurrentSessionId(undefined);
    setError(null);
    setStreamingMessage(null);
  }, []);

  const updateSessionId = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
  }, []);

  const startLoading = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setStreamingMessage({ content: '', toolCalls: new Map() });
  }, []);

  const stopLoading = useCallback(() => {
    setIsLoading(false);
    setAbortController(null);
  }, []);

  const setLoadingController = useCallback((controller: AbortController) => {
    setAbortController(controller);
  }, []);

  const finalizeStreamingMessage = useCallback(() => {
    if (streamingMessage && (streamingMessage.content || streamingMessage.toolCalls.size > 0)) {
      const finalMessage: Message = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: streamingMessage.content || 'Task completed',
        timestamp: Date.now(),
        toolCalls: Array.from(streamingMessage.toolCalls.values()),
      };
      addMessage(finalMessage);
    }
    setStreamingMessage(null);
  }, [streamingMessage, addMessage]);

  return {
    // State
    messages,
    inputValue,
    isLoading,
    currentSessionId,
    error,
    streamingMessage,
    abortController,
    
    // Actions
    setInputValue,
    setError,
    addMessage,
    updateStreamingMessage,
    clearChat,
    updateSessionId,
    startLoading,
    stopLoading,
    setLoadingController,
    finalizeStreamingMessage,
  };
} 