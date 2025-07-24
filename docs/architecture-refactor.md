# 🏗️ 架构重构方案：ToolRegistry vs ToolManager 

## 当前问题分析

### 职责重叠问题
- **ToolRegistry**: 负责工具注册、发现、元数据管理
- **ToolManager**: 负责工具执行、策略控制、监控
- **Agent**: 直接调用 ToolRegistry.get().execute()，绕过了 ToolManager

### 类型冲突问题  
```typescript
// ToolRegistry 期望的 Tool 接口
interface Tool {
  execute(params, signal): Promise<ToolResult>
}

// ToolManager 管理的 ToolInstance (BaseTool 子类)
class WriteFileTool extends BaseTool {
  execute(params, signal): Promise<ToolResult>
}
```

## 🎯 参考 qwen-code 的解决方案

### qwen-code 架构模式
```
User Input → CoreToolScheduler → ToolRegistry.getTool() → tool.execute()
           ↓
        策略控制层        工具发现层           工具执行层
```

### 建议的新架构

#### 方案A：引入 ToolScheduler（推荐）

```typescript
// 1. ToolRegistry - 专注发现和元数据
export class ToolRegistry {
  register(tool: Tool): void
  get(name: string): Tool | undefined
  exportForClaude(): ToolDefinition[]
  // 移除执行相关逻辑
}

// 2. ToolScheduler - 专注执行调度（重命名 ToolManager）
export class ToolScheduler {
  constructor(private toolRegistry: ToolRegistry) {}
  
  async scheduleTool(
    toolName: string, 
    params: unknown,
    options: ExecutionOptions
  ): Promise<ToolExecutionResult> {
    // 1. 从 registry 获取工具
    const tool = this.toolRegistry.get(toolName);
    
    // 2. 执行策略控制
    await this.checkRateLimit(toolName);
    await this.validateParams(tool, params);
    
    // 3. 执行工具
    return this.executeTool(tool, params, options);
  }
}

// 3. Agent - 通过 Scheduler 执行
export class CodeReviewAgent {
  constructor(
    private toolRegistry: ToolRegistry,
    private toolScheduler: ToolScheduler
  ) {}
  
  private async executeTools(toolCalls: ToolCall[]): Promise<void> {
    for (const toolCall of toolCalls) {
      // 通过 scheduler 执行，享受所有策略控制
      const result = await this.toolScheduler.scheduleTool(
        toolCall.tool,
        toolCall.params,
        { timeout: 30000 }
      );
      // 处理结果...
    }
  }
}
```

#### 方案B：统一到 ToolRegistry

```typescript
export class ToolRegistry {
  // 保留现有发现功能
  register(tool: Tool): void
  get(name: string): Tool | undefined
  
  // 新增执行管理功能
  async executeTool(
    toolName: string,
    params: unknown,
    options?: ExecutionOptions
  ): Promise<ToolExecutionResult> {
    const tool = this.get(toolName);
    // 集成 ToolManager 的策略控制逻辑
    return this.executeWithPolicies(tool, params, options);
  }
}
```

## 🚀 实施计划

### 阶段1：修复类型冲突
- [ ] 统一 Tool 接口定义
- [ ] 修复 base-tool.ts 的导出问题
- [ ] 解决 agent.ts 的类型错误

### 阶段2：架构重构
- [ ] 实施方案A：创建 ToolScheduler
- [ ] 重构 Agent 使用 ToolScheduler
- [ ] 移除 ToolManager 或重命名为 ToolScheduler

### 阶段3：功能对齐
- [ ] 对齐 qwen-code 的确认机制
- [ ] 实现完整的错误处理
- [ ] 添加性能监控和限流

## 🎯 最终架构目标

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  CodeReviewAgent │────│  ToolScheduler   │────│  ToolRegistry   │
│                 │    │  (执行调度)       │    │  (工具发现)     │
│                 │    │  - 策略控制       │    │  - 工具注册     │
│                 │    │  - 错误处理       │    │  - 元数据管理   │
│                 │    │  - 性能监控       │    │  - LLM集成      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                        │                        │
        │                        │                        │
        v                        v                        v
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  User Prompt    │    │  Rate Limiting   │    │  Tool Metadata  │
│  Tool Execution │    │  Timeout Control │    │  Claude Export  │
│  Stream Updates │    │  Retry Logic     │    │  Dependencies   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 建议采用方案A

**理由：**
1. **清晰的职责分离** - 符合单一职责原则
2. **参考成熟架构** - 对齐 qwen-code 的设计模式  
3. **易于扩展** - 未来可以支持多种调度策略
4. **向后兼容** - 保持 ToolRegistry 接口稳定

**下一步行动：**
1. 先修复当前的类型错误
2. 创建 ToolScheduler 类
3. 重构 Agent 的工具执行逻辑 