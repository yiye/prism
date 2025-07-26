/**
 * Prompt Configuration Hook
 * 📝 Prompt配置管理逻辑
 * 分离Prompt配置的状态管理和业务逻辑
 */

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

export interface PromptData {
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

export interface MessageState {
  type: 'success' | 'error';
  text: string;
}

export function usePromptConfig() {
  const [promptData, setPromptData] = useState<PromptData | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);

  // Load current prompt configuration
  const loadPromptData = useCallback(async () => {
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
         } catch {
       setMessage({ type: 'error', text: 'Network error while loading prompt' });
     } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-clear messages
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Load data on mount
  useEffect(() => {
    loadPromptData();
  }, [loadPromptData]);

  // Update edited prompt when prompt data changes
  useEffect(() => {
    if (promptData) {
      setEditedPrompt(promptData.systemPrompt);
    }
  }, [promptData]);

  return {
    // State
    promptData,
    editedPrompt,
    isLoading,
    isEditing,
    showPreview,
    message,
    
    // Actions
    setEditedPrompt,
    setIsEditing,
    setShowPreview,
    setMessage,
    setIsLoading,
    loadPromptData,
  };
} 