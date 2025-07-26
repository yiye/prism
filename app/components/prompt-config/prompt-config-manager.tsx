'use client';

/**
 * Prompt Configuration Management Component
 * 🔧 重构后的系统 Prompt 配置管理界面
 * 使用自定义hooks分离逻辑，遵循Next.js最佳实践
 */

import React from 'react';

import {
  Download,
  RotateCcw,
  Settings,
  Upload,
} from 'lucide-react';

// Custom Hooks
import { usePromptConfig } from '../../../hooks/use-prompt-config';
import { usePromptOperations } from '../../../hooks/use-prompt-operations';
// UI Components (通用组件)
import { StatusMessage } from '../ui/status-message';
// Prompt Config Sub-components (Prompt配置模块内部组件)
import { EnvironmentInfo } from './environment-info';
import { PromptEditor } from './prompt-editor';

export function PromptConfigManager() {
  // Prompt配置状态
  const {
    promptData,
    editedPrompt,
    isLoading,
    isEditing,
    showPreview,
    message,
    setEditedPrompt,
    setIsEditing,
    setShowPreview,
    setMessage,
    setIsLoading,
    loadPromptData,
  } = usePromptConfig();

  // Prompt操作
  const {
    savePrompt,
    resetToDefault,
    exportPrompt,
    importPrompt,
    cancelEdit,
  } = usePromptOperations({
    editedPrompt,
    setMessage,
    setIsLoading,
    setIsEditing,
    setEditedPrompt,
    loadPromptData,
    promptData,
  });

  // 加载状态
  if (isLoading && !promptData) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading prompt configuration...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Settings className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">System Prompt Configuration</h1>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={exportPrompt}
            className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center space-x-1"
            disabled={!promptData}
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          
          <label className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center space-x-1 cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>Import</span>
            <input
              type="file"
              accept=".md,.txt"
              onChange={importPrompt}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Status Message */}
      {message && (
        <StatusMessage
          type={message.type}
          message={message.text}
          onDismiss={() => setMessage(null)}
        />
      )}

      {/* Environment Info */}
      {promptData?.environment && (
        <EnvironmentInfo environment={promptData.environment} />
      )}

      {/* Prompt Editor */}
      <PromptEditor
        content={editedPrompt}
        onChange={setEditedPrompt}
        isEditing={isEditing}
        showPreview={showPreview}
        isLoading={isLoading}
        customPromptExists={promptData?.customPromptExists || false}
        onToggleEdit={() => setIsEditing(!isEditing)}
        onTogglePreview={() => setShowPreview(!showPreview)}
        onSave={savePrompt}
        onCancel={cancelEdit}
      />

      {/* Actions */}
      {promptData?.customPromptExists && (
        <div className="flex justify-end">
          <button
            onClick={resetToDefault}
            className="px-4 py-2 text-sm text-red-600 hover:text-red-700 flex items-center space-x-1"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset to Default</span>
          </button>
        </div>
      )}

      {/* Usage Instructions */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-medium text-blue-800 mb-2">Environment Variable Override</h3>
        <p className="text-sm text-blue-700 mb-2">
          You can also override the system prompt using environment variables:
        </p>
        <div className="font-mono text-xs bg-blue-100 p-2 rounded">
          <div># Use custom file path:</div>
          <div>CODE_AGENT_SYSTEM_MD=/path/to/your/system.md</div>
          <div className="mt-1"># Or use the default config file:</div>
          <div>CODE_AGENT_SYSTEM_MD=true</div>
        </div>
      </div>
    </div>
  );
} 