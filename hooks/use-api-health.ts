/**
 * API Health Check Hook
 * 🏥 API健康状态检查逻辑
 * 可复用的健康检查功能
 */

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

type ApiStatus = 'unknown' | 'healthy' | 'error';

export function useApiHealth(endpoint: string = '/api/chat') {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('unknown');

  const checkApiHealth = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { method: 'GET' });
      if (response.ok) {
        setApiStatus('healthy');
      } else {
        setApiStatus('error');
      }
    } catch (error) {
      console.error('API health check failed:', error);
      setApiStatus('error');
    }
  }, [endpoint]);

  useEffect(() => {
    checkApiHealth();
  }, [checkApiHealth]);

  return {
    apiStatus,
    checkApiHealth,
  };
} 