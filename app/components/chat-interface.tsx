'use client';

/**
 * Enhanced Chat Interface Component
 * 增强版聊天界面，专门用于代码审查 Agent 交互
 * 基于 qwen-code 的 UI 设计理念
 */

import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  AlertCircle,
  CheckCircle,
  Code,
  FileText,
  GitBranch,
  Loader2,
  Send,
  Settings,
  Zap,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
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

interface ChatInterfaceProps {
  sessionId?: string;
  onSessionChange?: (sessionId: string) => void;
}

export function ChatInterface({ sessionId, onSessionChange }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(sessionId);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<'unknown' | 'healthy' | 'error'>('unknown');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 检查 API 健康状态
  useEffect(() => {
    checkApiHealth();
  }, []);

  const checkApiHealth = async () => {
    try {
      const response = await fetch('/api/chat', { method: 'GET' });
      if (response.ok) {
        setApiStatus('healthy');
      } else {
        setApiStatus('error');
      }
    } catch (error) {
      console.error('API health check failed:', error);
      setApiStatus('error');
    }
  };

  // 发送消息
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId: currentSessionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      if (data.success && data.data) {
        const assistantMessage: Message = data.data;
        setMessages(prev => [...prev, assistantMessage]);
        
        // 更新会话 ID
        if (data.data.metadata?.sessionId && data.data.metadata.sessionId !== currentSessionId) {
          setCurrentSessionId(data.data.metadata.sessionId);
          onSessionChange?.(data.data.metadata.sessionId);
        }
      }

    } catch (error) {
      console.error('Error sending message:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  // 处理键盘事件
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 清空对话
  const handleClearChat = () => {
    setMessages([]);
    setCurrentSessionId(undefined);
    setError(null);
  };

  // 获取消息图标
  const getMessageIcon = (role: string) => {
    switch (role) {
      case 'user':
        return <GitBranch className="w-4 h-4 text-blue-500" />;
      case 'assistant':
        return <Code className="w-4 h-4 text-green-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  // 格式化时间戳
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // 渲染消息内容
  const renderMessageContent = (content: string) => {
    // 检查是否包含代码块
    if (content.includes('```')) {
      const parts = content.split(/(```[\s\S]*?```)/g);
      return parts.map((part, index) => {
        if (part.startsWith('```')) {
          const codeContent = part.slice(3, -3);
          const [language, ...code] = codeContent.split('\n');
          return (
            <pre key={index} className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto my-2">
              <div className="text-xs text-gray-400 mb-2">{language}</div>
              <code>{code.join('\n')}</code>
            </pre>
          );
        }
        return (
          <span key={index} className="whitespace-pre-wrap">
            {part}
          </span>
        );
      });
    }

    return (
      <span className="whitespace-pre-wrap">
        {content}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto bg-white shadow-lg rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <div className="flex items-center space-x-3">
          <Code className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Code Review Assistant</h2>
            <p className="text-sm text-gray-500">
              Powered by Claude 4 • {apiStatus === 'healthy' ? 
                <span className="text-green-500 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Online
                </span> :
                <span className="text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Offline
                </span>
              }
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={handleClearChat}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Clear conversation"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <Code className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Welcome to Code Review Assistant
            </h3>
            <p className="text-gray-500 max-w-md mx-auto">
              I can help you review code, analyze files, and improve code quality. 
              Try asking me to review a file or analyze your project structure.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 max-w-md mx-auto">
              <div className="bg-blue-50 p-3 rounded-lg text-left">
                <div className="flex items-center gap-2 text-blue-700 font-medium mb-1">
                  <FileText className="w-4 h-4" />
                  Example commands:
                </div>
                <ul className="text-sm text-blue-600 space-y-1">
                  <li>• "Please review the file src/components/Button.tsx"</li>
                  <li>• "Analyze the entire src/ directory for issues"</li>
                  <li>• "Check this code for performance problems"</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-3xl p-4 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-1">
                  {getMessageIcon(message.role)}
                </div>
                <div className="flex-1">
                  <div className="prose prose-sm max-w-none">
                    {renderMessageContent(message.content)}
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-200/20">
                    <span className="text-xs opacity-75">
                      {formatTimestamp(message.timestamp)}
                    </span>
                    {message.metadata?.tokens && (
                      <span className="text-xs opacity-75 flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {message.metadata.tokens.input + message.metadata.tokens.output} tokens
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-900 p-4 rounded-lg">
              <div className="flex items-center space-x-3">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span className="text-sm">Agent is thinking...</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center">
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg max-w-md">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Error</span>
              </div>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex space-x-3">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Describe what you'd like me to review or analyze..."
              className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              disabled={isLoading}
            />
          </div>
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading || apiStatus !== 'healthy'}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span>Send</span>
          </button>
        </div>
        
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span>
            Press Enter to send, Shift+Enter for new line
          </span>
          {currentSessionId && (
            <span>
              Session: {currentSessionId.slice(-8)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
} 