/**
 * Prompt Editor Component
 * 📝 Prompt编辑器UI组件
 * 分离编辑逻辑，提高复用性
 */

import React from 'react';

import {
  Eye,
  EyeOff,
  Save,
} from 'lucide-react';

interface PromptEditorProps {
  content: string;
  onChange: (content: string) => void;
  isEditing: boolean;
  showPreview: boolean;
  isLoading: boolean;
  customPromptExists: boolean;
  onToggleEdit: () => void;
  onTogglePreview: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function PromptEditor({
  content,
  onChange,
  isEditing,
  showPreview,
  isLoading,
  customPromptExists,
  onToggleEdit,
  onTogglePreview,
  onSave,
  onCancel,
}: PromptEditorProps) {
  return (
    <div className="border border-gray-200 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2">
          <h2 className="font-medium text-gray-800">System Prompt</h2>
          {customPromptExists && (
            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">Custom</span>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={onTogglePreview}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 flex items-center space-x-1"
          >
            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{showPreview ? 'Hide Preview' : 'Show Preview'}</span>
          </button>
          
          {!isEditing ? (
            <button
              onClick={onToggleEdit}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Edit
            </button>
          ) : (
            <div className="flex space-x-2">
              <button
                onClick={onCancel}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={isLoading}
                className="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center space-x-1 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>Save</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {isEditing ? (
          <textarea
            value={content}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-96 p-3 border border-gray-300 rounded font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter your system prompt here..."
          />
        ) : showPreview ? (
          <div className="prose max-w-none">
            <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded border overflow-x-auto">
              {content || 'No prompt loaded'}
            </pre>
          </div>
        ) : (
          <div className="text-gray-500 text-center py-8">
            Click "Show Preview" to view the current system prompt
          </div>
        )}
      </div>
    </div>
  );
} 