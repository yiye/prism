/**
 * Status Message Component
 * 📢 状态消息显示UI组件
 * 统一的成功/错误消息展示
 */

import React from 'react';

import {
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

interface StatusMessageProps {
  type: 'success' | 'error';
  message: string;
  onDismiss?: () => void;
}

export function StatusMessage({ type, message, onDismiss }: StatusMessageProps) {
  const isSuccess = type === 'success';
  
  return (
    <div className={`p-4 rounded-lg flex items-center space-x-2 ${
      isSuccess 
        ? 'bg-green-50 border border-green-200 text-green-700' 
        : 'bg-red-50 border border-red-200 text-red-700'
    }`}>
      {isSuccess ? 
        <CheckCircle className="w-5 h-5" /> : 
        <AlertCircle className="w-5 h-5" />
      }
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      )}
    </div>
  );
} 