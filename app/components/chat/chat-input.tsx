/**
 * Chat Input Component
 * ⌨️ 聊天输入框UI组件
 * 分离输入逻辑，提高复用性
 */

import React, {
  useEffect,
  useRef,
} from 'react';

import {
  Send,
  StopCircle,
} from 'lucide-react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  isLoading: boolean;
  isDisabled: boolean;
  onStop?: () => void;
  placeholder?: string;
  currentSessionId?: string;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onKeyPress,
  isLoading,
  isDisabled,
  onStop,
  placeholder = "告诉璇玑你想要审查什么代码呢~ (｡♥‿♥｡)",
  currentSessionId,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="border-t border-gray-200 p-4 bg-white rounded-b-xl">
      <div className="flex space-x-3">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyPress={onKeyPress}
            placeholder={placeholder}
            className="w-full p-3 border border-gray-300 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            rows={3}
            disabled={isDisabled}
          />
        </div>
        
        {isLoading ? (
          <button
            onClick={onStop}
            className="px-6 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors flex items-center space-x-2 shadow-sm"
          >
            <StopCircle className="w-4 h-4" />
            <span>停止</span>
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!value.trim() || isDisabled}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2 shadow-sm"
          >
            <Send className="w-4 h-4" />
            <span>发送</span>
          </button>
        )}
      </div>
      
      <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
        <span>
          Enter 发送，Shift+Enter 换行
        </span>
        {currentSessionId && (
          <span className="bg-gray-100 px-2 py-1 rounded-full">
            会话: {currentSessionId.slice(-8)}
          </span>
        )}
      </div>
    </div>
  );
} 