# 🚀 使用示例

## 前端 JavaScript 示例

### 1. SSE 流式聊天

```javascript
// 创建 SSE 连接进行流式聊天
async function startStreamChat(message, sessionId = null) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      sessionId,
      projectPath: process.cwd(),
      stream: true, // 开启流式
    }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6));
          handleSSEEvent(event);
        } catch (e) {
          console.log('Parse error:', e);
        }
      }
    }
  }
}

// 处理 SSE 事件
function handleSSEEvent(event) {
  switch (event.type) {
    case 'connected':
      console.log('🔗 Connected to session:', event.data.sessionId);
      break;
      
    case 'thinking':
      console.log('🤔 Agent is thinking:', event.data.content);
      break;
      
    case 'tool_start':
      console.log('🔧 Tool started:', event.data.toolCall.tool);
      break;
      
    case 'tool_complete':
      console.log('✅ Tool completed:', event.data.toolCall);
      break;
      
    case 'response':
      console.log('💬 Response:', event.data.content);
      break;
      
    case 'complete':
      console.log('🎉 Processing complete');
      break;
      
    case 'error':
      console.error('❌ Error:', event.data.error);
      break;
  }
}

// 使用示例
startStreamChat('请帮我审查这个文件的代码质量');
```

### 2. 非流式聊天

```javascript
// 简单的非流式聊天
async function simpleChat(message, sessionId = null) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      sessionId,
      projectPath: '/path/to/project',
      userMemory: '用户喜欢详细的代码分析',
      customInstructions: '请用中文回复',
      stream: false, // 非流式
    }),
  });

  const result = await response.json();
  
  if (result.success) {
    console.log('Session ID:', result.sessionId);
    console.log('Response:', result.data.content);
    console.log('Tool calls:', result.data.toolCalls);
    
    return result.sessionId; // 返回会话ID供后续使用
  } else {
    console.error('Error:', result.error);
  }
}

// 继续对话示例
async function continueConversation() {
  // 第一轮对话
  const sessionId = await simpleChat('请分析这个项目的架构');
  
  // 第二轮对话（复用会话）
  await simpleChat('请给出改进建议', sessionId);
}
```

## React 组件示例

```jsx
import React, { useState, useEffect } from 'react';

const AgentChat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = async (message) => {
    setIsStreaming(true);
    setMessages(prev => [...prev, { type: 'user', content: message }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          sessionId,
          stream: true,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              
              if (event.type === 'connected') {
                setSessionId(event.data.sessionId);
              } else if (event.type === 'response') {
                assistantMessage = event.data.content;
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastIndex = newMessages.length - 1;
                  if (newMessages[lastIndex]?.type === 'assistant') {
                    newMessages[lastIndex].content = assistantMessage;
                  } else {
                    newMessages.push({ type: 'assistant', content: assistantMessage });
                  }
                  return newMessages;
                });
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        }
      }
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.type}`}>
            <strong>{msg.type === 'user' ? 'You' : 'Agent'}:</strong>
            <p>{msg.content}</p>
          </div>
        ))}
        {isStreaming && <div className="loading">Agent is thinking...</div>}
      </div>
      
      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !isStreaming) {
              sendMessage(input);
              setInput('');
            }
          }}
          placeholder="输入你的消息..."
          disabled={isStreaming}
        />
        <button 
          onClick={() => {
            sendMessage(input);
            setInput('');
          }}
          disabled={isStreaming}
        >
          发送
        </button>
      </div>
      
      {sessionId && (
        <div className="session-info">
          Session: {sessionId}
        </div>
      )}
    </div>
  );
};

export default AgentChat;
```

## Node.js 服务端示例

```javascript
// 直接使用 AgentService
import { getGlobalAgentService } from './lib/services/agent';

async function testAgentService() {
  const agentService = getGlobalAgentService({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // 创建会话
  const sessionResponse = await agentService.createOrGetSession({
    apiKey: process.env.ANTHROPIC_API_KEY,
    projectPath: process.cwd(),
    userMemory: '这是一个 Next.js 项目',
  });

  if (sessionResponse.success) {
    const sessionId = sessionResponse.sessionId;
    
    // 处理消息
    const response = await agentService.processMessage(
      sessionId,
      '请分析这个项目的代码结构'
    );
    
    console.log(response.data.content);
  }
}

// 健康检查
async function healthCheck() {
  const agentService = getGlobalAgentService();
  const health = await agentService.healthCheck();
  console.log('Health:', health);
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

*Happy Coding! 🌟* 