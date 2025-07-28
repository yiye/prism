/**
 * Chat Header Component
 * 🌟 聊天头部UI组件
 * 显示机器人信息和状态
 */

import {
  AlertCircle,
  Bot,
  CheckCircle,
  Settings,
  Sparkles,
} from "lucide-react";

interface ChatHeaderProps {
  title?: string;
  subtitle?: string;
  apiStatus: "unknown" | "healthy" | "error";
  onClearChat: () => void;
}

export function ChatHeader({
  title = "璇玑 - AI代码审查助手",
  subtitle,
  apiStatus,
  onClearChat,
}: ChatHeaderProps) {
  const getStatusDisplay = () => {
    switch (apiStatus) {
      case "healthy":
        return (
          <>
            <CheckCircle className="w-3 h-3 text-green-500" />
            <span>在线中呢~ ヾ(≧▽≦*)o</span>
          </>
        );
      case "error":
        return (
          <>
            <AlertCircle className="w-3 h-3 text-red-500" />
            <span>离线中... (╥﹏╥)</span>
          </>
        );
      default:
        return (
          <>
            <AlertCircle className="w-3 h-3 text-yellow-500" />
            <span>检查中...</span>
          </>
        );
    }
  };

  return (
    <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50  flex-shrink-0">
      <div className="flex items-center space-x-2 sm:space-x-3">
        <div className="relative">
          <Bot className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
          <Sparkles className="w-2 h-2 sm:w-3 sm:h-3 text-yellow-500 absolute -top-1 -right-1" />
        </div>
        <div>
          <h2 className="text-sm sm:text-lg font-semibold text-gray-800 flex items-center gap-1 sm:gap-2">
            {title}
            <span className="text-xs bg-purple-100 text-purple-600 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
              Claude 4
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 flex items-center gap-1 sm:gap-2">
            {getStatusDisplay()}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-0.5 sm:mt-1">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-1 sm:space-x-2">
        <button
          onClick={onClearChat}
          className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-700 hover:bg-white/50 rounded-lg transition-all duration-200"
          title="清空对话"
        >
          <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>
    </div>
  );
}
