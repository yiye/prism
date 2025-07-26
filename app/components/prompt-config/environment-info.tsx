/**
 * Environment Info Component
 * 🌍 环境信息显示UI组件
 * 显示当前项目环境信息
 */

import React from 'react';

interface EnvironmentData {
  cwd: string;
  platform: string;
  gitInfo?: {
    branch: string;
    hasChanges: boolean;
  };
}

interface EnvironmentInfoProps {
  environment: EnvironmentData;
}

export function EnvironmentInfo({ environment }: EnvironmentInfoProps) {
  return (
    <div className="bg-gray-50 p-4 rounded-lg">
      <h3 className="font-medium text-gray-800 mb-2">Current Environment</h3>
      <div className="text-sm text-gray-600 space-y-1">
        <div><strong>Project:</strong> {environment.cwd}</div>
        <div><strong>Platform:</strong> {environment.platform}</div>
        {environment.gitInfo && (
          <>
            <div><strong>Git Branch:</strong> {environment.gitInfo.branch}</div>
            <div><strong>Has Changes:</strong> {environment.gitInfo.hasChanges ? 'Yes' : 'No'}</div>
          </>
        )}
      </div>
    </div>
  );
} 