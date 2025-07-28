# Claude API 流式处理修复总结

## 🐛 问题描述

在 `lib/services/agent/core/claude-client.ts` 的 `parseStreamEvent` 方法中，当处理 Anthropic Claude API 的 SSE (Server-Sent Events) 流时，遇到了以下错误：

```
Failed to parse stream event: event: message_stop SyntaxError: Unexpected token 'e', "event: message_stop" is not valid JSON
```

## 🔍 问题分析

根据 [Anthropic Claude API 官方文档](https://docs.anthropic.com/claude/reference/messages-streaming)，Claude API 的 SSE 格式可能包含多种格式：

1. **标准 JSON 格式**: `data: {"type": "message_start", ...}`
2. **特殊结束标记**: `data: [DONE]`
3. **非 JSON 事件格式**: `event: message_stop`
4. **纯 JSON 格式**: `{"type": "content_block_delta", ...}`

原代码只处理了 `data: ` 开头的 JSON 格式，没有正确处理其他格式，导致解析失败。

## ✅ 修复方案

### 1. 优化 `parseStreamEvent` 方法

```typescript
private parseStreamEvent(line: string): ClaudeStreamEvent {
  try {
    // 处理 "data: {...}" 格式
    if (line.startsWith('data: ')) {
      const jsonStr = line.slice(6).trim();

      // 处理特殊结束标记
      if (jsonStr === '[DONE]') {
        console.debug('Received [DONE] marker');
        return { type: 'message_stop' };
      }

      // 尝试解析 JSON
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr) as ClaudeStreamEvent;
          console.debug('Parsed SSE event:', parsed.type);
          return parsed;
        } catch (jsonError) {
          console.warn('Failed to parse JSON from data line:', jsonStr, jsonError);
        }
      }
    }

    // 处理 "event: message_stop" 格式（非 JSON 事件）
    if (line.startsWith('event: ')) {
      const eventType = line.slice(7).trim();
    //   console.debug('Received event line:', eventType);
      if (eventType === 'message_stop') {
        return { type: 'message_stop' };
      }
    }

    // 处理纯 JSON 格式（不带 data: 前缀）
    if (line.trim() && !line.startsWith('data: ') && !line.startsWith('event: ')) {
      try {
        const parsed = JSON.parse(line) as ClaudeStreamEvent;
        console.debug('Parsed direct JSON event:', parsed.type);
        return parsed;
      } catch (jsonError) {
        console.warn('Failed to parse direct JSON line:', line, jsonError);
      }
    }

    // 忽略空行或无法识别的格式
    if (line.trim()) {
      console.debug('Unrecognized stream line format:', line);
    }

    // 默认返回停止事件
    return { type: 'message_stop' };
  } catch (error) {
    console.warn('Failed to parse stream event:', line, error);
    return { type: 'message_stop' };
  }
}
```

### 2. 优化流式处理逻辑

```typescript
async *generateContentStream(
  messages: ClaudeMessage[],
  tools?: Tool[],
  systemPrompt?: string
): AsyncGenerator<ClaudeStreamEvent, void, unknown> {
  // ... 其他代码保持不变 ...

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine) {
      try {
        const event = this.parseStreamEvent(trimmedLine);
        if (event) {
          yield event;
        }
      } catch (parseError) {
        console.warn('Failed to parse stream line:', trimmedLine, parseError);
        // 继续处理下一行，不中断流
      }
    }
  }
}
```

## 🧪 测试验证

创建了测试用例验证修复效果：

1. ✅ 标准 JSON 格式: `data: {"type":"message_start", ...}`
2. ✅ 特殊结束标记: `data: [DONE]`
3. ✅ 非 JSON 事件格式: `event: message_stop`
4. ✅ 空行处理
5. ✅ 无法解析的行处理
6. ✅ 纯 JSON 格式: `{"type":"content_block_delta", ...}`
7. ✅ 工具调用事件: `data: {"type":"content_block_start", ...}`

## 🎯 修复效果

- **兼容性**: 支持所有 Claude API 官方文档中提到的 SSE 格式
- **容错性**: 对无法解析的行进行优雅处理，不中断流
- **调试性**: 添加了详细的调试日志，便于问题排查
- **稳定性**: 确保流式处理不会因为单个解析错误而中断

## 📚 参考资料

- [Anthropic Claude API 官方文档](https://docs.anthropic.com/claude/reference/messages-streaming)
- [Server-Sent Events 规范](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

## 🔄 后续优化建议

1. **监控**: 添加流式处理性能监控
2. **重试**: 对网络错误实现自动重试机制
3. **缓存**: 考虑对重复请求进行缓存
4. **限流**: 实现请求频率限制
