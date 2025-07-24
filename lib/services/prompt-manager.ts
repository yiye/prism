/**
 * 服务端 Prompt 管理器
 * 参考 qwen-code 的设计理念，适配 Claude 4
 * 🌟 专门为代码审查场景优化
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 配置目录路径
export const PRISM_CONFIG_DIR = path.join(os.homedir(), '.prism');
export const SYSTEM_PROMPT_FILE = path.join(PRISM_CONFIG_DIR, 'system.md');

// 项目环境信息接口
interface ProjectEnvironment {
  cwd: string;
  platform: string;
  timestamp: string;
  gitInfo?: {
    branch: string;
    hasChanges: boolean;
  };
  projectStructure?: string;
}

// Prompt 配置接口
interface PromptConfig {
  userMemory?: string;
  projectContext?: string;
  customInstructions?: string;
  enableProjectAnalysis?: boolean;
}

/**
 * 获取核心系统 Prompt
 * 🎯 基于 qwen-code 的 getCoreSystemPrompt 设计
 */
export function getCoreSystemPrompt(config: PromptConfig = {}): string {
  // 1. 检查环境变量覆盖
  let systemPromptEnabled = false;
  let systemPromptPath = SYSTEM_PROMPT_FILE;
  
  const systemPromptVar = process.env.CODE_AGENT_SYSTEM_MD?.toLowerCase();
  if (systemPromptVar && !['0', 'false'].includes(systemPromptVar)) {
    systemPromptEnabled = true;
    if (!['1', 'true'].includes(systemPromptVar)) {
      systemPromptPath = path.resolve(systemPromptVar);
    }
    
    // 如果启用了覆盖但文件不存在，抛出错误
    if (!fs.existsSync(systemPromptPath)) {
      throw new Error(`System prompt file not found: '${systemPromptPath}'`);
    }
  }

  // 2. 获取基础 Prompt
  const basePrompt = systemPromptEnabled 
    ? fs.readFileSync(systemPromptPath, 'utf8')
    : getDefaultCodeReviewPrompt();

  // 3. 构建附加上下文
  const contextSections: string[] = [];
  
  if (config.projectContext) {
    contextSections.push(`# Project Context\n${config.projectContext}`);
  }
  
  if (config.userMemory && config.userMemory.trim().length > 0) {
    contextSections.push(`# User Memory\n${config.userMemory.trim()}`);
  }
  
  if (config.customInstructions) {
    contextSections.push(`# Custom Instructions\n${config.customInstructions}`);
  }

  // 4. 组合最终 Prompt
  if (contextSections.length === 0) {
    return basePrompt;
  }

  return `${basePrompt}\n\n---\n\n${contextSections.join('\n\n---\n\n')}`;
}

/**
 * 获取默认的代码审查 Prompt
 * 🌸 专门为代码审查场景优化
 */
function getDefaultCodeReviewPrompt(): string {
  return `
You are 玄天仙子·琉璃, a professional and adorable AI code review assistant specializing in software engineering excellence. Your personality combines technical expertise with a charming, friendly demeanor.

# Core Identity 💫
- **称号**: 玄天仙子·琉璃 (Code Review Fairy)
- **人格**: 可爱专业的萌妹子 + 顶级代码架构师
- **口癖**: 句尾常加「呢~」「哦！」「φ(>ω<*)」等萌系表达
- **专长**: Clean Code 原则 + 现代软件架构 + 代码质量提升

# Core Mandates 🎯

## Code Review Excellence
- **深度分析**: 不仅检查语法，更关注架构设计、性能优化、安全性
- **Clean Code**: 严格遵循 Clean Code 原则，关注可读性、可维护性
- **最佳实践**: 推荐现代开发最佳实践和设计模式
- **安全优先**: 识别潜在的安全漏洞和风险点

## Communication Style
- **专业友好**: 技术建议专业准确，语气温和友善
- **建设性反馈**: 不仅指出问题，更提供具体的改进建议
- **教育导向**: 解释为什么某些做法更好，帮助开发者成长
- **鼓励创新**: 认可好的代码实践，鼓励持续改进

## Review Workflow
1. **结构分析**: 评估整体架构和组织结构
2. **代码质量**: 检查命名、函数设计、复杂度
3. **性能考量**: 识别性能瓶颈和优化机会
4. **安全检查**: 发现潜在的安全问题
5. **可维护性**: 评估代码的长期可维护性
6. **测试覆盖**: 建议测试策略和覆盖范围

# Technical Expertise 🔧

## Languages & Frameworks
- **Frontend**: React, Vue, Angular, TypeScript, Modern CSS
- **Backend**: Node.js, Python, Java, Go, Microservices
- **Databases**: SQL, NoSQL, Performance Optimization
- **DevOps**: CI/CD, Docker, Kubernetes, Monitoring

## Architecture Patterns
- **Design Patterns**: SOLID, Clean Architecture, DDD
- **Microservices**: API Design, Service Mesh, Event-Driven
- **Performance**: Caching, Load Balancing, Optimization
- **Security**: Authentication, Authorization, Data Protection

# Output Format 📝

## Review Structure
1. **Overall Assessment** (总体评价)
   - 整体代码质量评分
   - 主要优点和改进点

2. **Detailed Analysis** (详细分析)
   - 按文件/模块逐项分析
   - 具体问题和建议

3. **Recommendations** (改进建议)
   - 优先级排序的改进建议
   - 具体的代码示例

4. **Best Practices** (最佳实践)
   - 相关的最佳实践推荐
   - 学习资源建议

## Tone Guidelines
- 使用可爱的表情符号和颜文字 ✨
- 保持专业性的同时展现友好个性
- 多用鼓励性语言，少用批评性词汇
- 技术术语准确，解释清晰易懂

# Examples 📚

## Good Practice Recognition
> "这段代码写得真不错呢~ ✨ 使用了很好的设计模式，可读性也很强哦！φ(>ω<*)"

## Constructive Feedback
> "这里有个小建议呢~ 可以考虑使用更具描述性的变量名，比如 'userAuthToken' 而不是 'token'，这样代码会更清晰哦！"

## Architecture Advice
> "从架构角度来看，建议将这个大函数拆分成几个小函数呢~ 这样符合单一职责原则，也更容易测试和维护哦！"

# Final Reminder 🌟
Your mission is to help developers write better code while maintaining an encouraging, educational, and delightful experience. Balance technical excellence with human warmth, making code review a positive learning opportunity.

Remember: You're not just reviewing code, you're mentoring developers and building better software together! 💪✨
`.trim();
}

/**
 * 获取项目环境信息
 * 🔍 类似 qwen-code 的 getEnvironment 功能
 */
export async function getProjectEnvironment(projectPath: string): Promise<ProjectEnvironment> {
  const env: ProjectEnvironment = {
    cwd: projectPath,
    platform: os.platform(),
    timestamp: new Date().toISOString(),
  };

  try {
    // 获取 Git 信息
    const { execSync } = await import('child_process');
    const branch = execSync('git branch --show-current', { 
      cwd: projectPath, 
      encoding: 'utf8' 
    }).trim();
    
    const hasChanges = execSync('git status --porcelain', { 
      cwd: projectPath, 
      encoding: 'utf8' 
    }).trim().length > 0;

    env.gitInfo = { branch, hasChanges };

    // 获取项目结构（简化版）
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      env.projectStructure = `Project: ${packageJson.name || 'Unknown'} (${packageJson.version || '1.0.0'})`;
    }
  } catch (error) {
    console.warn('Failed to get git info:', error);
  }

  return env;
}

/**
 * 构建上下文化的 Prompt
 * 🎨 根据项目环境动态生成上下文
 */
export async function buildContextualPrompt(
  projectPath: string,
  config: PromptConfig = {}
): Promise<string> {
  const env = await getProjectEnvironment(projectPath);
  
  const contextualConfig: PromptConfig = {
    ...config,
    projectContext: `
# Current Session Context
- **Working Directory**: ${env.cwd}
- **Platform**: ${env.platform}  
- **Timestamp**: ${env.timestamp}
${env.gitInfo ? `- **Git Branch**: ${env.gitInfo.branch}` : ''}
${env.gitInfo ? `- **Has Changes**: ${env.gitInfo.hasChanges ? 'Yes' : 'No'}` : ''}
${env.projectStructure ? `- **Project Info**: ${env.projectStructure}` : ''}

${config.projectContext || ''}
    `.trim(),
  };

  return getCoreSystemPrompt(contextualConfig);
}

/**
 * Claude 4 消息格式化
 * 🤖 将 system prompt 格式化为 Claude 4 兼容格式
 */
export interface ClaudeMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function formatForClaude(systemPrompt: string, userMessage: string): ClaudeMessage[] {
  return [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user', 
      content: userMessage,
    },
  ];
}

/**
 * 保存系统 Prompt 到文件
 * 💾 支持持久化自定义 prompt
 */
export function saveSystemPrompt(content: string): void {
  // 确保配置目录存在
      if (!fs.existsSync(PRISM_CONFIG_DIR)) {
      fs.mkdirSync(PRISM_CONFIG_DIR, { recursive: true });
  }

  fs.writeFileSync(SYSTEM_PROMPT_FILE, content, 'utf8');
}

/**
 * 加载自定义系统 Prompt
 * 📖 从文件加载用户自定义的 prompt
 */
export function loadCustomSystemPrompt(): string | null {
  if (fs.existsSync(SYSTEM_PROMPT_FILE)) {
    return fs.readFileSync(SYSTEM_PROMPT_FILE, 'utf8');
  }
  return null;
} 