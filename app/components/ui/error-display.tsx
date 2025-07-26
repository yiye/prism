/**
 * Error Display Component
 * ❌ 错误显示UI组件
 * 统一的错误信息展示
 */

import React from 'react';

import {
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface ErrorDisplayProps {
  error: string;
  onRetry?: () => void;
  title?: string;
}

export function ErrorDisplay({ 
  error, 
  onRetry, 
  title = "出错了呢 (╥﹏╥)" 
}: ErrorDisplayProps) {
  return (
    <div className="flex justify-center">
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl max-w-md shadow-sm">
        <div className="flex items-center space-x-2 mb-2">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        
        <p className="text-sm mb-3">{error}</p>
        
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center space-x-1 text-xs text-red-600 hover:text-red-800 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>重试</span>
          </button>
        )}
      </div>
    </div>
  );
} 