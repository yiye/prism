'use client';

/**
 * Prompt Configuration Management Component
 * 🔧 系统 Prompt 配置管理界面
 */

import React, {
  useEffect,
  useState,
} from 'react';

import {
  AlertCircle,
  CheckCircle,
  Download,
  Eye,
  EyeOff,
  RotateCcw,
  Save,
  Settings,
  Upload,
} from 'lucide-react';

interface PromptData {
  systemPrompt: string;
  customPromptExists: boolean;
  timestamp: string;
  environment?: {
    cwd: string;
    platform: string;
    gitInfo?: {
      branch: string;
      hasChanges: boolean;
    };
  };
}

export function PromptConfigManager() {
  const [promptData, setPromptData] = useState<PromptData | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 加载当前 prompt 配置
  const loadPromptData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/prompt?includeEnvironment=true');
      const data = await response.json();
      
      if (data.success) {
        setPromptData(data.data);
        setEditedPrompt(data.data.systemPrompt);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to load prompt' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error while loading prompt' });
    } finally {
      setIsLoading(false);
    }
  };

  // 保存自定义 prompt
  const savePrompt = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: editedPrompt }),
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: 'System prompt saved successfully!' });
        setIsEditing(false);
        await loadPromptData(); // 重新加载
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save prompt' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error while saving prompt' });
    } finally {
      setIsLoading(false);
    }
  };

  // 重置到默认 prompt
  const resetToDefault = async () => {
    if (!confirm('Are you sure you want to reset to the default system prompt? This will delete your custom prompt.')) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/prompt', {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: 'Reset to default system prompt!' });
        setIsEditing(false);
        await loadPromptData(); // 重新加载
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to reset prompt' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error while resetting prompt' });
    } finally {
      setIsLoading(false);
    }
  };

  // 导出 prompt
  const exportPrompt = () => {
    if (!promptData) return;
    
    const blob = new Blob([promptData.systemPrompt], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'system-prompt.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 导入 prompt
  const importPrompt = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setEditedPrompt(content);
      setIsEditing(true);
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    loadPromptData();
  }, []);

  // 清除消息
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

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
        <div className={`p-4 rounded-lg flex items-center space-x-2 ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-700' 
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.type === 'success' ? 
            <CheckCircle className="w-5 h-5" /> : 
            <AlertCircle className="w-5 h-5" />
          }
          <span>{message.text}</span>
        </div>
      )}

      {/* Environment Info */}
      {promptData?.environment && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="font-medium text-gray-800 mb-2">Current Environment</h3>
          <div className="text-sm text-gray-600 space-y-1">
            <div><strong>Project:</strong> {promptData.environment.cwd}</div>
            <div><strong>Platform:</strong> {promptData.environment.platform}</div>
            {promptData.environment.gitInfo && (
              <>
                <div><strong>Git Branch:</strong> {promptData.environment.gitInfo.branch}</div>
                <div><strong>Has Changes:</strong> {promptData.environment.gitInfo.hasChanges ? 'Yes' : 'No'}</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Prompt Editor */}
      <div className="border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-2">
            <h2 className="font-medium text-gray-800">System Prompt</h2>
            {promptData?.customPromptExists && (
              <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">Custom</span>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 flex items-center space-x-1"
            >
              {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>{showPreview ? 'Hide Preview' : 'Show Preview'}</span>
            </button>
            
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Edit
              </button>
            ) : (
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditedPrompt(promptData?.systemPrompt || '');
                  }}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={savePrompt}
                  disabled={isLoading}
                  className="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center space-x-1"
                >
                  <Save className="w-4 h-4" />
                  <span>Save</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="p-4">
          {isEditing ? (
            <textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              className="w-full h-96 p-3 border border-gray-300 rounded font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your system prompt here..."
            />
          ) : showPreview ? (
            <div className="prose max-w-none">
              <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded border overflow-x-auto">
                {promptData?.systemPrompt || 'No prompt loaded'}
              </pre>
            </div>
          ) : (
            <div className="text-gray-500 text-center py-8">
              Click "Show Preview" to view the current system prompt
            </div>
          )}
        </div>
      </div>

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