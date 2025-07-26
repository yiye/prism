/**
 * Chat SSE (Server-Sent Events) Hook
 * 🌊 流式响应处理逻辑
 * 专门处理 SSE 连接和事件处理
 */

import { useCallback } from 'react';

import type { StreamingMessage } from './use-chat-state';

// SSE Event Types
export interface SSEEvent {
  type: string;
  data: {
    sessionId?: string;
    content?: string;
    error?: string;
    toolCall?: {
      id: string;
      name: string;
      status?: string;
      output?: string;
      error?: string;
    };
    [key: string]: unknown;
  };
}

interface UseChatSSEProps {
  currentSessionId?: string;
  onSessionChange?: (sessionId: string) => void;
  updateStreamingMessage: (updater: (prev: StreamingMessage | null) => StreamingMessage | null) => void;
  setError: (error: string | null) => void;
  updateSessionId: (sessionId: string) => void;
}

export function useChatSSE({
  currentSessionId,
  onSessionChange,
  updateStreamingMessage,
  setError,
  updateSessionId,
}: UseChatSSEProps) {
  
  // Handle individual SSE events
  const handleSSEEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case 'connected':
        if (event.data.sessionId && event.data.sessionId !== currentSessionId) {
          updateSessionId(event.data.sessionId);
          if (onSessionChange) {
            onSessionChange(event.data.sessionId);
          }
        }
        break;

      case 'thinking':
        updateStreamingMessage(prev => prev || { content: '', toolCalls: new Map() });
        break;

      case 'tool_start':
        if (event.data.toolCall) {
          updateStreamingMessage(prev => {
            if (!prev) return { content: '', toolCalls: new Map() };
            const newToolCalls = new Map(prev.toolCalls);
            newToolCalls.set(event.data.toolCall!.id, {
              id: event.data.toolCall!.id,
              name: event.data.toolCall!.name,
              status: 'running' as const
            });
            return { ...prev, toolCalls: newToolCalls };
          });
        }
        break;

      case 'tool_complete':
        if (event.data.toolCall) {
          updateStreamingMessage(prev => {
            if (!prev) return { content: '', toolCalls: new Map() };
            const newToolCalls = new Map(prev.toolCalls);
            const existingTool = newToolCalls.get(event.data.toolCall!.id);
            newToolCalls.set(event.data.toolCall!.id, {
              ...existingTool,
              id: event.data.toolCall!.id,
              name: event.data.toolCall!.name,
              status: 'complete' as const,
              output: event.data.toolCall!.output
            });
            return { ...prev, toolCalls: newToolCalls };
          });
        }
        break;

      case 'response':
        if (event.data.content && typeof event.data.content === 'string') {
          updateStreamingMessage(prev => {
            if (!prev) return { content: event.data.content as string, toolCalls: new Map() };
            return { ...prev, content: prev.content + event.data.content };
          });
        }
        break;

      case 'complete':
        console.log('Stream complete:', event.data);
        break;

      case 'error':
        setError(typeof event.data.error === 'string' ? event.data.error : 'Unknown streaming error');
        break;
    }
  }, [currentSessionId, onSessionChange, updateStreamingMessage, setError, updateSessionId]);

  // Process SSE stream
  const processSSEStream = useCallback(async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const eventData = JSON.parse(line.slice(6)) as SSEEvent;
            handleSSEEvent(eventData);
          } catch (error) {
            console.warn('Failed to parse SSE event:', line, error);
          }
        }
      }
    }
  }, [handleSSEEvent]);

  return {
    handleSSEEvent,
    processSSEStream,
  };
} 