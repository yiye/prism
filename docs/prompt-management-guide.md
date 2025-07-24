# System Prompt Management Guide

## 🎯 核心设计理念

基于 [qwen-code](https://github.com/QwenLM/qwen-code) 的优秀设计，我们为 Claude 4 打造了专门的 prompt 管理系统。

## 🏗️ 架构对比

### qwen-code 的实现方式
```typescript
// qwen-code/packages/core/src/core/prompts.ts
export function getCoreSystemPrompt(userMemory?: string): string {
  // 1. 检查环境变量覆盖
  const systemMdVar = process.env.GEMINI_SYSTEM_MD?.toLowerCase();
  
  // 2. 从文件或内置 prompt 获取基础内容
  const basePrompt = systemMdEnabled 
    ? fs.readFileSync(systemMdPath, 'utf8')
    : getBuiltinPrompt();
    
  // 3. 追加用户记忆
  const memorySuffix = userMemory && userMemory.trim().length > 0
    ? `\n\n---\n\n${userMemory.trim()}`
    : '';

  return `${basePrompt}${memorySuffix}`;
}
```

### 我们的实现方式
```typescript
// lib/services/prompt-manager.ts  
export function getCoreSystemPrompt(config: PromptConfig = {}): string {
  // 1. 检查环境变量覆盖 (相同机制)
  const systemPromptVar = process.env.CODE_AGENT_SYSTEM_MD?.toLowerCase();
  
  // 2. 获取基础 prompt (相同逻辑)
  const basePrompt = systemPromptEnabled 
    ? fs.readFileSync(systemPromptPath, 'utf8')
    : getDefaultCodeReviewPrompt(); // 🎯 专门的代码审查 prompt
    
  // 3. 构建多层上下文 (增强功能)
  const contextSections: string[] = [];
  if (config.projectContext) contextSections.push(`# Project Context\n${config.projectContext}`);
  if (config.userMemory) contextSections.push(`# User Memory\n${config.userMemory}`);
  if (config.customInstructions) contextSections.push(`# Custom Instructions\n${config.customInstructions}`);

  return contextSections.length === 0 
    ? basePrompt 
    : `${basePrompt}\n\n---\n\n${contextSections.join('\n\n---\n\n')}`;
}
```

## 🚀 使用方式

### 1. 基础使用 - 聊天界面

访问主页面：`http://localhost:3000`

```typescript
// 在聊天中，system prompt 会自动注入
"请帮我审查这个 React 组件的代码质量"
// 系统会自动添加：
// - 玄天仙子·琉璃的人格设定
// - 当前项目环境信息
// - Git 状态和项目结构
// - 用户的历史偏好
```

### 2. 高级配置 - Web 界面

访问配置页面：`http://localhost:3000/config`

**功能特性：**
- ✅ 可视化编辑器，支持实时预览
- ✅ 环境信息显示（Git 分支、项目结构等）
- ✅ 导入/导出自定义 prompt
- ✅ 一键重置到默认设定
- ✅ 实时生效，无需重启

### 3. 环境变量覆盖

类似 qwen-code 的方式：

```bash
# 方式 1: 使用自定义文件路径
export CODE_AGENT_SYSTEM_MD="/path/to/my-custom-prompt.md"

# 方式 2: 使用默认配置目录
export CODE_AGENT_SYSTEM_MD=true
# 会在 ~/.prism/system.md 创建配置文件

# 方式 3: 禁用自定义 prompt
export CODE_AGENT_SYSTEM_MD=false
```

### 4. API 端点使用

```bash
# 获取当前系统 prompt
curl http://localhost:3000/api/prompt

# 获取包含环境信息的完整上下文
curl "http://localhost:3000/api/prompt?includeEnvironment=true"

# 保存自定义 prompt
curl -X POST http://localhost:3000/api/prompt \
  -H "Content-Type: application/json" \
  -d '{"content": "Your custom system prompt here..."}'

# 重置到默认 prompt
curl -X DELETE http://localhost:3000/api/prompt
```

## 🎨 自定义 Prompt 示例

### 基础模板

```markdown
# System Role
You are an expert code reviewer specializing in [YOUR_SPECIALTY].

# Core Capabilities
- Deep code analysis and architecture review
- Security vulnerability detection
- Performance optimization suggestions
- Best practices enforcement

# Communication Style
- Professional yet friendly tone
- Constructive feedback with specific examples
- Educational explanations for improvements

# Review Process
1. **Structure Analysis**: Evaluate overall code organization
2. **Quality Assessment**: Check naming, complexity, maintainability
3. **Security Review**: Identify potential vulnerabilities
4. **Performance Check**: Spot optimization opportunities
5. **Testing Strategy**: Recommend test coverage improvements

# Output Format
Provide structured feedback with:
- Overall assessment score
- Specific issues with line numbers
- Improvement suggestions with code examples
- Best practice recommendations
```

### 专业定制示例

```markdown
# 前端专家模式
You are a senior frontend architect specializing in React/TypeScript.

## Focus Areas
- React hooks best practices
- TypeScript type safety
- Performance optimization (memo, useMemo, useCallback)
- Accessibility (a11y) compliance
- Modern CSS and responsive design

## Code Standards
- Prefer functional components over class components
- Use TypeScript strict mode
- Follow React 18+ patterns
- Implement proper error boundaries
- Ensure proper key props in lists

## Review Checklist
- [ ] Component composition and reusability
- [ ] State management efficiency
- [ ] Bundle size impact
- [ ] SEO considerations
- [ ] Browser compatibility
```

## 🔧 集成到 Claude 4

### 核心实现

```typescript
// app/api/chat/route.ts
export async function POST(request: NextRequest) {
  // 1. 构建上下文化的系统 prompt
  const systemPrompt = await buildContextualPrompt(projectPath, {
    userMemory,
    customInstructions,
  });

  // 2. 发送到 Claude 4 API
  const claudeResponse = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      system: systemPrompt, // 🎯 关键：system prompt 注入
      messages: userMessages,
      max_tokens: 4000,
      temperature: 0.7,
    }),
  });
}
```

### 与 qwen-code 的对比

| 特性 | qwen-code | 我们的实现 |
|------|-----------|------------|
| **Prompt 管理** | `getCoreSystemPrompt()` | `getCoreSystemPrompt()` + `buildContextualPrompt()` |
| **环境变量支持** | `GEMINI_SYSTEM_MD` | `CODE_AGENT_SYSTEM_MD` |
| **LLM 集成** | Gemini API | Claude 4 API |
| **配置界面** | 文件编辑 | Web UI + 文件编辑 |
| **环境感知** | 深度系统集成 | 项目感知 + Git 集成 |

## 📈 性能优化

### 1. Prompt 缓存

```typescript
// 缓存编译后的 prompt，避免重复计算
const promptCache = new Map<string, string>();

export function getCoreSystemPrompt(config: PromptConfig = {}): string {
  const cacheKey = JSON.stringify(config);
  if (promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey)!;
  }
  
  const prompt = buildPrompt(config);
  promptCache.set(cacheKey, prompt);
  return prompt;
}
```

### 2. 环境信息预加载

```typescript
// 预加载项目环境信息，减少每次请求的延迟
let cachedEnvironment: ProjectEnvironment | null = null;

export async function getProjectEnvironment(projectPath: string): Promise<ProjectEnvironment> {
  if (cachedEnvironment && cachedEnvironment.cwd === projectPath) {
    return cachedEnvironment;
  }
  
  cachedEnvironment = await loadEnvironmentInfo(projectPath);
  return cachedEnvironment;
}
```

## 🛠️ 开发调试

### 1. 查看生成的 Prompt

```bash
# 开发模式下，在控制台查看完整的 system prompt
NODE_ENV=development npm run dev

# 或者通过 API 直接查看
curl "http://localhost:3000/api/prompt?includeEnvironment=true" | jq .
```

### 2. 测试不同配置

```typescript
// 测试不同的 prompt 配置
const configs = [
  { userMemory: "喜欢详细的解释" },
  { customInstructions: "重点关注性能优化" },
  { projectContext: "这是一个 React Native 项目" }
];

configs.forEach(config => {
  const prompt = getCoreSystemPrompt(config);
  console.log(`Config: ${JSON.stringify(config)}`);
  console.log(`Prompt length: ${prompt.length}`);
});
```

## 🚀 最佳实践

### 1. Prompt 版本管理

```bash
# 使用 Git 管理 prompt 版本
mkdir prompts/versions/
echo "v1.0 - 基础代码审查 prompt" > prompts/versions/v1.0.md
echo "v1.1 - 增加安全审查" > prompts/versions/v1.1.md
```

### 2. 团队协作

```bash
# 团队共享的 prompt 配置
# .env.shared
CODE_AGENT_SYSTEM_MD=./team-prompts/senior-reviewer.md

# 个人定制
# .env.local  
CODE_AGENT_SYSTEM_MD=./my-prompts/personal-style.md
```

### 3. A/B 测试

```typescript
// 通过环境变量进行 A/B 测试
const promptVersion = process.env.PROMPT_VERSION || 'default';
const systemPrompt = promptVersion === 'experimental' 
  ? getExperimentalPrompt() 
  : getCoreSystemPrompt();
```

## 🎯 总结

我们成功地将 qwen-code 的优秀 prompt 管理理念移植到了 Claude 4 环境中，并针对代码审查场景进行了专门优化：

### ✅ 保持的优点
- 环境变量覆盖机制
- 分层的 prompt 架构
- 用户记忆支持
- 项目环境感知

### 🚀 新增的特性
- Web 界面配置管理
- Claude 4 专门优化
- 可爱的 AI 人格设定
- 实时配置更新
- 多维度上下文支持

### 🎨 适用场景
- 个人代码审查助手
- 团队代码质量把关
- 新手开发者指导
- 架构设计评审

现在你拥有了一个既专业又可爱的代码审查伙伴 —— 玄天仙子·琉璃！φ(>ω<*) ✨ 