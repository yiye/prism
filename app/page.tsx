'use client';

/**
 * Main Page - Code Review Agent
 * 代码审查 Agent 的主页面
 */

import { ChatInterface } from './components/chat-interface';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Prism - AI Code Review Assistant
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            An intelligent code review agent powered by Claude 4, designed to help you 
            improve code quality, find issues, and follow best practices in React/TypeScript projects.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Code Analysis</h3>
            <p className="text-gray-600">
              Deep analysis of your React/TypeScript code for performance, security, and maintainability issues.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Best Practices</h3>
            <p className="text-gray-600">
              Suggestions for following React, TypeScript, and modern web development best practices.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Smart Assistant</h3>
            <p className="text-gray-600">
              Interactive chat interface powered by Claude 4 for real-time code review and guidance.
            </p>
          </div>
        </div>

        {/* Chat Interface */}
        <div className="bg-white rounded-lg shadow-lg">
          <ChatInterface />
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-500">
          <p>
            Built with Next.js, TypeScript, and Claude 4 • 
            Inspired by qwen-code architecture
          </p>
        </div>
      </div>
    </main>
  );
}
