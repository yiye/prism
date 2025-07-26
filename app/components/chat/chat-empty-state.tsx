/**
 * Chat Empty State Component
 * 🎨 聊天空状态UI组件
 * 显示欢迎信息和使用示例
 */

import React from 'react';

import {
  Bot,
  Code,
  Sparkles,
} from 'lucide-react';

interface ChatEmptyStateProps {
  onExampleClick?: (example: string) => void;
}

const EXAMPLE_COMMANDS = [
  "请帮我审查 src/components/Button.tsx 文件",
  "分析整个 src/ 目录的代码质量",
  "检查这段代码的性能问题",
  "优化我的 React 组件"
];

export function ChatEmptyState({ onExampleClick }: ChatEmptyStateProps) {
  return (
    <div className="text-center py-12">
      <div className="relative mb-6">
        <Bot className="w-20 h-20 text-blue-300 mx-auto" />
        <Sparkles className="w-6 h-6 text-yellow-400 absolute top-2 right-1/2 transform translate-x-8" />
      </div>
      
      <h3 className="text-xl font-medium text-gray-900 mb-3">
        你好呀！我是璇玑~ (｡♥‿♥｡)
      </h3>
      
      <p className="text-gray-500 max-w-md mx-auto mb-6">
        我可以帮你审查代码、分析文件、优化代码质量呢！
        快来和我聊聊你的代码吧~ φ(&gt;ω&lt;*)
      </p>
      
      <div className="grid grid-cols-1 gap-3 max-w-lg mx-auto">
        <div className="bg-white border border-blue-200 p-4 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 text-blue-700 font-medium mb-2">
            <Code className="w-4 h-4" />
            试试这些命令哦：
          </div>
          
          <ul className="text-sm text-gray-600 space-y-1 text-left">
            {EXAMPLE_COMMANDS.map((command, index) => (
              <li key={index} className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                {onExampleClick ? (
                  <button
                    onClick={() => onExampleClick(command)}
                    className="text-left hover:text-blue-600 transition-colors"
                  >
                    &quot;{command}&quot;
                  </button>
                ) : (
                  <span>&quot;{command}&quot;</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
} 