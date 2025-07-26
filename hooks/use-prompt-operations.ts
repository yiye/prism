/**
 * Prompt Operations Hook
 * 🔧 Prompt操作逻辑
 * 处理保存、重置、导入导出等操作
 */

import { useCallback } from 'react';

import type {
  MessageState,
  PromptData,
} from './use-prompt-config';

interface UsePromptOperationsProps {
  editedPrompt: string;
  setMessage: (message: MessageState | null) => void;
  setIsLoading: (loading: boolean) => void;
  setIsEditing: (editing: boolean) => void;
  setEditedPrompt: (prompt: string) => void;
  loadPromptData: () => Promise<void>;
  promptData: PromptData | null;
}

export function usePromptOperations({
  editedPrompt,
  setMessage,
  setIsLoading,
  setIsEditing,
  setEditedPrompt,
  loadPromptData,
  promptData,
}: UsePromptOperationsProps) {

  // Save custom prompt
  const savePrompt = useCallback(async () => {
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
        await loadPromptData();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save prompt' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error while saving prompt' });
    } finally {
      setIsLoading(false);
    }
  }, [editedPrompt, setIsLoading, setMessage, setIsEditing, loadPromptData]);

  // Reset to default prompt
  const resetToDefault = useCallback(async () => {
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
        await loadPromptData();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to reset prompt' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error while resetting prompt' });
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, setMessage, setIsEditing, loadPromptData]);

  // Export prompt
  const exportPrompt = useCallback(() => {
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
  }, [promptData]);

  // Import prompt
  const importPrompt = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setEditedPrompt(content);
      setIsEditing(true);
    };
    reader.readAsText(file);
  }, [setEditedPrompt, setIsEditing]);

  // Cancel editing
  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditedPrompt(promptData?.systemPrompt || '');
  }, [setIsEditing, setEditedPrompt, promptData]);

  return {
    savePrompt,
    resetToDefault,
    exportPrompt,
    importPrompt,
    cancelEdit,
  };
} 