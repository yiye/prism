# 🚀 使用示例

## 前端 JavaScript 示例

### 1. SSE 流式聊天

```javascript
// 创建 SSE 连接进行流式聊天
async function startStreamChat(message, sessionId = null) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      sessionId,
      projectPath: process.cwd(),
    }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6));
          handleSSEEvent(event);
        } catch (e) {
          console.log("Parse error:", e);
        }
      }
    }
  }
}

// 处理 SSE 事件
function handleSSEEvent(event) {
  switch (event.type) {
    case "connected":
      console.log("🔗 Connected to session:", event.data.sessionId);
      break;

    case "thinking":
      console.log("🤔 Agent is thinking:", event.data.content);
      break;

    case "tool_start":
      console.log("🔧 Tool started:", event.data.toolCall.tool);
      break;

    case "tool_complete":
      console.log("✅ Tool completed:", event.data.toolCall);
      break;

    case "response":
      console.log("💬 Response:", event.data.content);
      break;

    case "complete":
      console.log("🎉 Processing complete");
      break;

    case "error":
      console.error("❌ Error:", event.data.error);
      break;
  }
}

// 使用示例
startStreamChat("请帮我审查这个文件的代码质量");
```

### 2. React 组件示例

```jsx
import React, { useState, useEffect } from "react";

const AgentChat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = async (message) => {
    setIsStreaming(true);
    setMessages((prev) => [...prev, { type: "user", content: message }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          sessionId,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === "connected") {
                setSessionId(event.data.sessionId);
              } else if (event.type === "response") {
                assistantMessage = event.data.content;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  const lastIndex = newMessages.length - 1;
                  if (newMessages[lastIndex]?.type === "assistant") {
                    newMessages[lastIndex].content = assistantMessage;
                  } else {
                    newMessages.push({
                      type: "assistant",
                      content: assistantMessage,
                    });
                  }
                  return newMessages;
                });
              }
            } catch (e) {
              console.error("Parse error:", e);
            }
          }
        }
      }
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div>
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.type}`}>
            {msg.content}
          </div>
        ))}
      </div>

      <div className="input-area">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter" && !isStreaming) {
              sendMessage(input);
              setInput("");
            }
          }}
          placeholder="输入你的问题..."
          disabled={isStreaming}
        />
        <button
          onClick={() => {
            if (!isStreaming) {
              sendMessage(input);
              setInput("");
            }
          }}
          disabled={isStreaming}
        >
          {isStreaming ? "处理中..." : "发送"}
        </button>
      </div>
    </div>
  );
};

export default AgentChat;
```

## API 接口说明

### POST /api/chat

**请求参数：**

```json
{
  "message": "请帮我审查这个文件的代码质量",
  "sessionId": "可选的会话ID",
  "projectPath": "项目路径，默认为当前工作目录",
  "userMemory": "用户记忆信息",
  "customInstructions": "自定义指令"
}
```

**响应：**

- 返回 SSE (Server-Sent Events) 流
- Content-Type: `text/event-stream`

**SSE 事件类型：**

- `connected`: 连接建立
- `thinking`: Agent 思考中
- `tool_start`: 工具开始执行
- `tool_complete`: 工具执行完成
- `response`: 响应内容
- `complete`: 处理完成
- `error`: 错误信息

### GET /api/chat

**健康检查接口**

**响应：**

```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "details": {
    "config": {
      /* 配置检查结果 */
    },
    "service": {
      /* 服务检查结果 */
    }
  }
}
```

## 测试架构

```bash
# 1. 安装依赖 (如果还没有)
npm install

# 2. 设置环境变量
export ANTHROPIC_API_KEY="your_claude_api_key"

# 3. 启动开发服务器
npm run dev

# 4. 测试 API
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, Agent!",
    "stream": false
  }'

# 5. 测试 SSE 流
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "开始流式对话",
    "stream": true
  }'
```

## 最佳实践

1. **会话管理**: 在前端保存 sessionId，实现对话连续性
2. **错误处理**: 监听 SSE 的 error 事件，实现优雅降级
3. **性能优化**: 长时间不活跃的会话会自动清理
4. **安全考虑**: API Key 应该在服务端管理，不要暴露给前端

---

_Happy Coding! 🌟_
