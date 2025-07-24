/**
 * System Prompt Configuration Page
 * 🔧 系统 Prompt 配置管理页面
 */

import { PromptConfigManager } from '@/app/components/prompt-config';

export default function ConfigPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <PromptConfigManager />
    </div>
  );
}

export const metadata = {
  title: 'System Prompt Configuration - Code Review Assistant',
  description: 'Configure and manage system prompts for the code review assistant',
}; 