"use client";

/**
 * Main Page - Code Review Agent
 * 代码审查 Agent 的主页面 - 左右布局版本
 */

import { useState } from "react";
import { ChatInterface } from "./components/chat";
import { ChatProvider, useChatContext } from "./components/chat/chat-context";

function HomeContent() {
  const { triggerQuickAction } = useChatContext();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [quickActions] = useState([
    {
      id: "review-file",
      label: "📁 Review Current File",
      prompt: "请帮我审查当前文件，分析代码质量和改进建议",
    },
    {
      id: "analyze-dir",
      label: "🔍 Analyze Directory",
      prompt: "请分析整个项目的代码结构，找出潜在问题和优化机会",
    },
    {
      id: "performance",
      label: "⚡ Performance Check",
      prompt: "请检查代码的性能问题，提供优化建议",
    },
    {
      id: "security",
      label: "🛡️ Security Audit",
      prompt: "请进行安全审计，检查代码中的安全漏洞和风险",
    },
  ]);

  const handleQuickAction = (prompt: string) => {
    triggerQuickAction(prompt);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 移动端菜单切换按钮 */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-lg border border-gray-200"
      >
        <svg
          className="w-6 h-6 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* 左侧菜单栏 - 固定宽度 */}
      <div
        className={`
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0
        fixed lg:relative
        w-80 bg-white border-r border-gray-200 flex flex-col
        transition-transform duration-300 ease-in-out
        z-40 lg:z-auto
        h-full
      `}
      >
        {/* 菜单栏头部 */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Prism</h1>
              <p className="text-sm text-gray-600">AI Code Review Assistant</p>
            </div>
            {/* 移动端关闭按钮 */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* 菜单栏内容 */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* 功能卡片 */}
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                  <svg
                    className="w-4 h-4 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Code Analysis
                </h3>
              </div>
              <p className="text-xs text-gray-600">
                Deep analysis for performance, security, and maintainability
                issues.
              </p>
            </div>

            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                  <svg
                    className="w-4 h-4 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Best Practices
                </h3>
              </div>
              <p className="text-xs text-gray-600">
                React, TypeScript, and modern web development best practices.
              </p>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                  <svg
                    className="w-4 h-4 text-purple-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Smart Assistant
                </h3>
              </div>
              <p className="text-xs text-gray-600">
                Interactive chat interface powered by Claude 4.
              </p>
            </div>
          </div>

          {/* 快速操作 */}
          <div className="mt-8">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Quick Actions
            </h3>
            <div className="space-y-2">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => {
                    handleQuickAction(action.prompt);
                    // 在移动端点击后自动关闭菜单
                    if (window.innerWidth < 1024) {
                      setSidebarOpen(false);
                    }
                  }}
                  className="w-full text-left p-3 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 菜单栏底部 */}
        <div className="p-6 border-t border-gray-200">
          <div className="text-xs text-gray-500 text-center">
            Built with Next.js, TypeScript, and Claude 4
          </div>
        </div>
      </div>

      {/* 移动端遮罩层 */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 右侧AI对话框 - 自适应宽度 */}
      <div className="flex-1 flex flex-col lg:ml-0">
        <ChatInterface />
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <ChatProvider>
      <HomeContent />
    </ChatProvider>
  );
}
