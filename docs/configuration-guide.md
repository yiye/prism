# 🛠️ Agent 配置指南

## 📋 配置概览

Agent 现在使用统一的配置系统，支持多种配置方式，让你更灵活地管理 API 密钥、模型设置和系统行为。

### 🎯 配置优先级

配置的加载顺序（优先级从高到低）：

1. **环境变量** - 运行时覆盖
2. **配置文件** - 持久化配置
3. **默认配置** - 系统默认值

## 🗂️ 配置文件

### 配置文件位置

配置文件存储在用户主目录的 `.code-agent` 文件夹中：

```
~/.prism/config.json
```

Windows 用户：
```
C:\Users\{用户名}\.prism\config.json
```

### 创建配置文件

1. 复制示例配置文件：
```bash
mkdir -p ~/.prism
cp config/prism-config.example.json ~/.prism/config.json
```

2. 编辑配置文件：
```bash
nano ~/.prism/config.json  # 或使用你喜欢的编辑器
```

### 配置文件结构

```json
{
  "claude": {
    "apiKey": "your_api_key_here",
    "baseUrl": "https://api.anthropic.com",
    "model": "claude-3-5-sonnet-20241022",
    "maxTokens": 4096,
    "temperature": 0.7
  },
  "session": {
    "timeout": 1800000,
    "maxSessions": 50,
    "cleanupInterval": 300000
  },
  "tools": {
    "enabled": ["file_reader", "code_analyzer"],
    "projectRoot": "/path/to/your/project"
  },
  "logging": {
    "level": "info",
    "enableConsole": true
  }
}
```

## 🌍 环境变量

你可以使用环境变量来覆盖配置文件中的设置：

### Claude API 配置

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `ANTHROPIC_API_KEY` | Claude API 密钥 | `sk-ant-...` |
| `CLAUDE_BASE_URL` | API 基础 URL | `https://api.anthropic.com` |
| `CLAUDE_MODEL` | 使用的模型 | `claude-3-5-sonnet-20241022` |
| `CLAUDE_MAX_TOKENS` | 最大令牌数 | `4096` |
| `CLAUDE_TEMPERATURE` | 温度设置 | `0.7` |

### 会话配置

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `AGENT_SESSION_TIMEOUT` | 会话超时(毫秒) | `1800000` |
| `AGENT_MAX_SESSIONS` | 最大会话数 | `50` |

### 工具配置

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `AGENT_PROJECT_ROOT` | 默认项目根目录 | `/path/to/project` |

### 日志配置

| 环境变量 | 说明 | 示例 |
|---------|------|------|
| `AGENT_LOG_LEVEL` | 日志级别 | `info` |

## 🚀 使用示例

### 1. 快速开始（仅环境变量）

```bash
export ANTHROPIC_API_KEY="your_api_key_here"
npm run dev
```

### 2. 高级配置（配置文件 + 环境变量）

```bash
# 创建配置文件
mkdir -p ~/.prism
cat > ~/.prism/config.json << EOF
{
  "claude": {
    "model": "claude-3-5-sonnet-20241022",
    "maxTokens": 8192,
    "temperature": 0.5
  },
  "session": {
    "timeout": 3600000
  }
}
EOF

# 通过环境变量设置 API 密钥
export ANTHROPIC_API_KEY="your_api_key_here"

# 启动服务
npm run dev
```

### 3. 生产环境配置

```bash
# 生产环境变量
export ANTHROPIC_API_KEY="prod_api_key"
export CLAUDE_MODEL="claude-3-5-sonnet-20241022"
export CLAUDE_TEMPERATURE="0.3"
export AGENT_SESSION_TIMEOUT="7200000"
export AGENT_MAX_SESSIONS="100"
export AGENT_LOG_LEVEL="warn"

# 启动服务
npm run start
```

## 🔧 配置项详解

### Claude 配置

- **apiKey**: Claude API 密钥（必需）
- **baseUrl**: API 基础 URL，默认为官方 API
- **model**: 使用的 Claude 模型
- **maxTokens**: 单次请求的最大令牌数
- **temperature**: 生成温度（0-1），影响回答的创造性

### 会话配置

- **timeout**: 会话超时时间（毫秒），默认 30 分钟
- **maxSessions**: 最大并发会话数，默认 50
- **cleanupInterval**: 清理任务执行间隔（毫秒），默认 5 分钟

### 工具配置

- **enabled**: 启用的工具列表
- **projectRoot**: 默认项目根目录

### 日志配置

- **level**: 日志级别（debug/info/warn/error）
- **enableConsole**: 是否在控制台输出日志

## 🩺 健康检查

使用健康检查 API 验证配置：

```bash
curl http://localhost:3000/api/chat
```

响应示例：
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "details": {
    "config": {
      "status": "healthy",
      "checks": [
        {
          "name": "Claude API Key",
          "status": "ok",
          "message": "API key is configured"
        }
      ]
    }
  }
}
```

## 🛡️ 安全最佳实践

1. **保护 API 密钥**
   - 不要在配置文件中硬编码 API 密钥
   - 使用环境变量或密钥管理服务
   - 确保 `.code-agent` 目录权限正确

2. **生产环境**
   - 使用专用的生产 API 密钥
   - 设置适当的会话限制
   - 启用日志但避免敏感信息

3. **权限管理**
   ```bash
   # 设置配置目录权限
   chmod 700 ~/.prism
chmod 600 ~/.prism/config.json
   ```

## 🔄 配置管理

### 查看当前配置

```typescript
import { getGlobalConfigManager } from '@/lib/config/agent-config';

const configManager = getGlobalConfigManager();
const currentConfig = configManager.getAllConfig();
console.log(currentConfig);
```

### 更新配置

```typescript
const configManager = getGlobalConfigManager();

// 保存新配置
configManager.saveConfig({
  claude: {
    temperature: 0.8
  }
});

// 重新加载配置
configManager.reloadConfig();
```

### 配置验证

```typescript
const configManager = getGlobalConfigManager();
const health = configManager.healthCheck();

if (health.status === 'error') {
  console.error('Configuration errors:', health.checks);
}
```

## 🚨 故障排除

### 常见问题

1. **API 密钥未配置**
   ```
   Error: Claude API key is required
   ```
   解决方案：设置 `ANTHROPIC_API_KEY` 环境变量

2. **配置文件语法错误**
   ```
   Error: Failed to load config file
   ```
   解决方案：检查 JSON 语法，使用 JSON 验证器

3. **权限问题**
   ```
   Error: Permission denied
   ```
   解决方案：检查文件权限，确保应用可以读取配置文件

### 调试技巧

1. **启用调试日志**
   ```bash
   export AGENT_LOG_LEVEL="debug"
   ```

2. **验证配置加载**
   ```bash
   curl http://localhost:3000/api/chat | jq .details.config
   ```

3. **测试配置**
   ```typescript
   // 在代码中测试
   import { getClaudeConfig } from '@/lib/config/agent-config';
   console.log('Claude config:', getClaudeConfig());
   ```

---

现在你可以灵活地管理 Agent 的所有配置了！🎉 