/**
 * Scroll to Bottom Hook
 * ⬇️ 自动滚动到底部逻辑
 * 处理聊天界面的自动滚动行为
 */

import {
  MutableRefObject,
  useEffect,
  useRef,
} from 'react';

export function useScrollToBottom<T extends HTMLElement = HTMLDivElement>(
  dependencies: React.DependencyList = []
): MutableRefObject<T | null> {
  const ref = useRef<T | null>(null);

  const scrollToBottom = () => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, dependencies);

  return ref;
} 