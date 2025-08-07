/**
 * 深复制工具函数
 * 支持对象、数组、基本类型的深复制
 */

/**
 * 深复制函数
 * @param obj 要复制的对象
 * @returns 深复制后的对象
 */
export function deepClone<T>(obj: T): T {
  // 处理 null 和 undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // 处理基本类型
  if (typeof obj !== 'object') {
    return obj;
  }

  // 处理 Date 对象
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  // 处理 Array 对象
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as T;
  }

  // 处理普通对象
  if (typeof obj === 'object') {
    const clonedObj = {} as T;
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        (clonedObj as Record<string, unknown>)[key] = deepClone((obj as Record<string, unknown>)[key]);
      }
    }
    
    return clonedObj;
  }

  // 处理其他类型（如 RegExp、Function 等）
  return obj;
}

/**
 * 安全的深复制函数（带错误处理）
 * @param obj 要复制的对象
 * @returns 深复制后的对象，如果失败则返回原对象
 */
export function safeDeepClone<T>(obj: T): T {
  try {
    return deepClone(obj);
  } catch (error) {
    console.warn('Deep clone failed, returning original object:', error);
    return obj;
  }
}

/**
 * 检查对象是否可以进行深复制
 * @param obj 要检查的对象
 * @returns 是否可以深复制
 */
export function canDeepClone(obj: unknown): boolean {
  if (obj === null || obj === undefined) {
    return true;
  }

  if (typeof obj !== 'object') {
    return true;
  }

  // 检查是否包含循环引用
  const visited = new WeakSet();
  
  function checkCircular(obj: unknown): boolean {
    if (obj === null || typeof obj !== 'object') {
      return true;
    }

    if (visited.has(obj as object)) {
      return false; // 发现循环引用
    }

    visited.add(obj as object);

    if (Array.isArray(obj)) {
      return obj.every(item => checkCircular(item));
    }

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (!checkCircular((obj as Record<string, unknown>)[key])) {
          return false;
        }
      }
    }

    return true;
  }

  return checkCircular(obj);
}
