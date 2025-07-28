/**
 * Main Chat Hook
 * 💬 聊天主逻辑 Hook
 * 整合所有聊天相关的逻辑，提供统一的接口
 */

import { useCallback } from "react";

import { useChatSSE } from "./use-chat-sse";
import { type Message, useChatState } from "./use-chat-state";

interface UseChatProps {
  sessionId?: string;
  onSessionChange?: (sessionId: string) => void;
}

export function useChat({ sessionId, onSessionChange }: UseChatProps = {}) {
  // State management
  const {
    messages,
    inputValue,
    isLoading,
    currentSessionId,
    error,
    streamingMessage,
    abortController,
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
  } = useChatState(sessionId);

  // SSE handling
  const { processSSEStream } = useChatSSE({
    currentSessionId,
    onSessionChange,
    updateStreamingMessage,
    setError,
    updateSessionId,
    addMessage,
  });

  // Send message with streaming
  const handleStreamingResponse = useCallback(
    async (userMessage: Message) => {
      startLoading();

      const controller = new AbortController();
      setLoadingController(controller);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: userMessage.content,
            sessionId: currentSessionId,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to send message");
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response stream available");
        }

        await processSSEStream(reader);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          console.log("Stream aborted by user");
        } else {
          console.error("Streaming error:", error);
          setError(error instanceof Error ? error.message : "Unknown error");
        }
      } finally {
        stopLoading();
        finalizeStreamingMessage();
      }
    },
    [
      currentSessionId,
      startLoading,
      setLoadingController,
      processSSEStream,
      stopLoading,
      finalizeStreamingMessage,
      setError,
    ]
  );

  // Send message
  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      content: inputValue.trim(),
      timestamp: Date.now(),
    };

    addMessage(userMessage);
    setInputValue("");
    await handleStreamingResponse(userMessage);
  }, [
    inputValue,
    isLoading,
    addMessage,
    setInputValue,
    handleStreamingResponse,
  ]);

  // Stop generation
  const stopGeneration = useCallback(() => {
    if (abortController) {
      abortController.abort();
    }
  }, [abortController]);

  // Handle keyboard events
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  return {
    // State
    messages,
    inputValue,
    isLoading,
    currentSessionId,
    error,
    streamingMessage,

    // Actions
    setInputValue,
    sendMessage,
    stopGeneration,
    clearChat,
    handleKeyPress,
  };
}
