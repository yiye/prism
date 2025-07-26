/**
 * Memory Tool
 * 基于 qwen-code 的 memoryTool 功能适配 agent 架构
 * 用于长期记忆存储和检索
 */

import * as fs from 'fs/promises';
import { homedir } from 'os';
import * as path from 'path';

import {
  ToolResult,
  ToolSchema,
  ValidationResult,
} from '@/types';

import { ModifyingTool } from './base-tool';

interface MemoryParams {
  action: 'save' | 'retrieve' | 'search' | 'delete' | 'list';
  fact?: string;
  query?: string;
  key?: string;
  category?: string;
  importance?: 'low' | 'medium' | 'high';
}

interface MemoryEntry {
  id: string;
  fact: string;
  category: string;
  importance: 'low' | 'medium' | 'high';
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  tags: string[];
}

interface MemoryResult extends ToolResult {
  success: boolean;
  metadata: {
    action: string;
    totalEntries?: number;
    category?: string;
    entriesFound?: number;
    memorySize?: string;
  };
  entries?: MemoryEntry[];
}

/**
 * 长期记忆工具
 * 参考 qwen-code 的 memoryTool 实现
 */
export class MemoryTool extends ModifyingTool<MemoryParams, MemoryResult> {
  private readonly memoryDir: string;
  private readonly memoryFile: string;
  private readonly maxEntries = 1000;
  private readonly maxFactLength = 2000;

  constructor(projectRoot?: string) {
    const schema: ToolSchema = {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['save', 'retrieve', 'search', 'delete', 'list'],
          description: 'Action to perform: save/retrieve/search/delete/list memories',
        },
        fact: {
          type: 'string',
          description: 'Fact or information to save (required for save action)',
        },
        query: {
          type: 'string',
          description: 'Search query for retrieving related memories (required for search action)',
        },
        key: {
          type: 'string',
          description: 'Unique key/ID for memory entry (required for retrieve/delete actions)',
        },
        category: {
          type: 'string',
          description: 'Category for organizing memories (optional)',
        },
        importance: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Importance level of the memory (default: medium)',
        },
      },
      required: ['action'],
      description: 'Save, retrieve, search, or manage long-term memories',
    };

    super({
      name: 'memory',
      displayName: 'Memory Tool',
      description: 'Long-term memory storage and retrieval system',
      schema,
      isOutputMarkdown: true,
    });

    // 设置记忆存储路径
    this.memoryDir = projectRoot 
      ? path.join(projectRoot, '.agent-memory')
      : path.join(homedir(), '.code-agent', 'memory');
    this.memoryFile = path.join(this.memoryDir, 'memories.json');
  }

  protected validateSpecific(params: MemoryParams): ValidationResult {
    const { action, fact, query, key } = params;

    // 验证必需参数
    switch (action) {
      case 'save':
        if (!fact || fact.trim().length === 0) {
          return {
            valid: false,
            error: 'Fact is required for save action',
          };
        }
        if (fact.length > this.maxFactLength) {
          return {
            valid: false,
            error: `Fact too long (max: ${this.maxFactLength} characters)`,
          };
        }
        break;
        
      case 'search':
        if (!query || query.trim().length === 0) {
          return {
            valid: false,
            error: 'Query is required for search action',
          };
        }
        break;
        
      case 'retrieve':
      case 'delete':
        if (!key || key.trim().length === 0) {
          return {
            valid: false,
            error: `Key is required for ${action} action`,
          };
        }
        break;
        
      case 'list':
        // 无需额外验证
        break;
        
      default:
        return {
          valid: false,
          error: `Unknown action: ${action}`,
        };
    }

    return { valid: true };
  }

  protected async executeImpl(
    params: MemoryParams,
    _signal: AbortSignal
  ): Promise<MemoryResult> {
    void _signal;
    // 确保记忆目录存在
    await this.ensureMemoryDir();

    const { action } = params;

    switch (action) {
      case 'save':
        return await this.saveMemory(params);
      case 'retrieve':
        return await this.retrieveMemory(params);
      case 'search':
        return await this.searchMemories(params);
      case 'delete':
        return await this.deleteMemory(params);
      case 'list':
        return await this.listMemories(params);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async ensureMemoryDir(): Promise<void> {
    try {
      await fs.access(this.memoryDir);
    } catch {
      await fs.mkdir(this.memoryDir, { recursive: true });
    }
  }

  private async loadMemories(): Promise<MemoryEntry[]> {
    try {
      const data = await fs.readFile(this.memoryFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  private async saveMemories(memories: MemoryEntry[]): Promise<void> {
    await fs.writeFile(this.memoryFile, JSON.stringify(memories, null, 2), 'utf8');
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractTags(fact: string): string[] {
    // 简单的标签提取：查找常见的技术术语和关键词
    const commonTags = [
      'typescript', 'javascript', 'react', 'vue', 'angular', 'node', 'express',
      'database', 'api', 'function', 'class', 'component', 'service', 'util',
      'error', 'bug', 'fix', 'feature', 'optimization', 'security', 'performance',
      'test', 'deploy', 'config', 'setup', 'install', 'update', 'version'
    ];

    const factLower = fact.toLowerCase();
    return commonTags.filter(tag => factLower.includes(tag));
  }

  private async saveMemory(params: MemoryParams): Promise<MemoryResult> {
    const memories = await this.loadMemories();

    // 检查是否达到最大条目数
    if (memories.length >= this.maxEntries) {
      // 删除最旧的低重要性记忆
      memories.sort((a, b) => {
        if (a.importance !== b.importance) {
          const importanceOrder = { low: 0, medium: 1, high: 2 };
          return importanceOrder[a.importance] - importanceOrder[b.importance];
        }
        return a.lastAccessed - b.lastAccessed;
      });
      
      memories.splice(0, 1); // 删除最旧的
    }

    const newEntry: MemoryEntry = {
      id: this.generateId(),
      fact: params.fact!,
      category: params.category || 'general',
      importance: params.importance || 'medium',
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      tags: this.extractTags(params.fact!),
    };

    memories.push(newEntry);
    await this.saveMemories(memories);

    return {
      output: `Memory saved successfully with ID: ${newEntry.id}\nFact: ${newEntry.fact}\nCategory: ${newEntry.category}\nImportance: ${newEntry.importance}`,
      success: true,
      metadata: {
        action: 'save',
        totalEntries: memories.length,
        category: newEntry.category,
      },
      entries: [newEntry],
    };
  }

  private async retrieveMemory(params: MemoryParams): Promise<MemoryResult> {
    const memories = await this.loadMemories();
    const entry = memories.find(m => m.id === params.key);

    if (!entry) {
      return {
        output: `No memory found with ID: ${params.key}`,
        success: false,
        metadata: {
          action: 'retrieve',
          entriesFound: 0,
        },
      };
    }

    // 更新访问统计
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    await this.saveMemories(memories);

    return {
      output: `**Memory Retrieved:**\n\n**ID:** ${entry.id}\n**Fact:** ${entry.fact}\n**Category:** ${entry.category}\n**Importance:** ${entry.importance}\n**Created:** ${new Date(entry.timestamp).toLocaleString()}\n**Access Count:** ${entry.accessCount}`,
      success: true,
      metadata: {
        action: 'retrieve',
        entriesFound: 1,
        category: entry.category,
      },
      entries: [entry],
    };
  }

  private async searchMemories(params: MemoryParams): Promise<MemoryResult> {
    const memories = await this.loadMemories();
    const query = params.query!.toLowerCase();

    // 搜索算法：查找包含查询词的记忆
    const matchingEntries = memories.filter(entry => {
      const factMatch = entry.fact.toLowerCase().includes(query);
      const categoryMatch = entry.category.toLowerCase().includes(query);
      const tagMatch = entry.tags.some(tag => tag.includes(query));
      
      return factMatch || categoryMatch || tagMatch;
    });

    // 按重要性和相关性排序
    matchingEntries.sort((a, b) => {
      const importanceOrder = { high: 3, medium: 2, low: 1 };
      const aScore = importanceOrder[a.importance];
      const bScore = importanceOrder[b.importance];
      
      if (aScore !== bScore) {
        return bScore - aScore;
      }
      
      return b.lastAccessed - a.lastAccessed;
    });

    // 更新访问统计
    matchingEntries.forEach(entry => {
      entry.lastAccessed = Date.now();
      entry.accessCount++;
    });
    
    if (matchingEntries.length > 0) {
      await this.saveMemories(memories);
    }

    let output = `# Search Results for "${params.query}"\n\n`;
    if (matchingEntries.length === 0) {
      output += 'No matching memories found.';
    } else {
      output += `Found ${matchingEntries.length} matching memories:\n\n`;
      matchingEntries.forEach((entry, index) => {
        output += `## ${index + 1}. ${entry.category} (${entry.importance})\n`;
        output += `**ID:** ${entry.id}\n`;
        output += `**Fact:** ${entry.fact}\n`;
        output += `**Created:** ${new Date(entry.timestamp).toLocaleDateString()}\n`;
        if (entry.tags.length > 0) {
          output += `**Tags:** ${entry.tags.join(', ')}\n`;
        }
        output += '\n---\n\n';
      });
    }

    return {
      output,
      success: true,
      metadata: {
        action: 'search',
        entriesFound: matchingEntries.length,
        totalEntries: memories.length,
      },
      entries: matchingEntries,
    };
  }

  private async deleteMemory(params: MemoryParams): Promise<MemoryResult> {
    const memories = await this.loadMemories();
    const index = memories.findIndex(m => m.id === params.key);

    if (index === -1) {
      return {
        output: `No memory found with ID: ${params.key}`,
        success: false,
        metadata: {
          action: 'delete',
          entriesFound: 0,
        },
      };
    }

    const deletedEntry = memories.splice(index, 1)[0];
    await this.saveMemories(memories);

    return {
      output: `Memory deleted successfully:\n\n**ID:** ${deletedEntry.id}\n**Fact:** ${deletedEntry.fact}\n**Category:** ${deletedEntry.category}`,
      success: true,
      metadata: {
        action: 'delete',
        totalEntries: memories.length,
        category: deletedEntry.category,
      },
      entries: [deletedEntry],
    };
  }

  private async listMemories(params: MemoryParams): Promise<MemoryResult> {
    const memories = await this.loadMemories();
    
    // 按类别过滤（如果指定）
    let filteredMemories = memories;
    if (params.category) {
      filteredMemories = memories.filter(m => 
        m.category.toLowerCase() === params.category!.toLowerCase()
      );
    }

    // 按重要性和时间排序
    filteredMemories.sort((a, b) => {
      const importanceOrder = { high: 3, medium: 2, low: 1 };
      const aScore = importanceOrder[a.importance];
      const bScore = importanceOrder[b.importance];
      
      if (aScore !== bScore) {
        return bScore - aScore;
      }
      
      return b.timestamp - a.timestamp;
    });

    // 计算存储统计
    const totalSize = JSON.stringify(memories).length;
    const categories = [...new Set(memories.map(m => m.category))];

    let output = `# Memory Storage Summary\n\n`;
    output += `**Total Memories:** ${memories.length}\n`;
    output += `**Storage Size:** ${(totalSize / 1024).toFixed(2)} KB\n`;
    output += `**Categories:** ${categories.join(', ')}\n\n`;

    if (params.category) {
      output += `## Memories in category "${params.category}" (${filteredMemories.length} entries)\n\n`;
    } else {
      output += `## All Memories\n\n`;
    }

    if (filteredMemories.length === 0) {
      output += 'No memories found.';
    } else {
      filteredMemories.forEach((entry, index) => {
        output += `### ${index + 1}. ${entry.category} - ${entry.importance}\n`;
        output += `**ID:** ${entry.id}\n`;
        output += `**Fact:** ${entry.fact.substring(0, 100)}${entry.fact.length > 100 ? '...' : ''}\n`;
        output += `**Created:** ${new Date(entry.timestamp).toLocaleDateString()}\n`;
        output += `**Accessed:** ${entry.accessCount} times\n\n`;
      });
    }

    return {
      output,
      success: true,
      metadata: {
        action: 'list',
        totalEntries: memories.length,
        entriesFound: filteredMemories.length,
        memorySize: `${(totalSize / 1024).toFixed(2)} KB`,
        category: params.category,
      },
      entries: filteredMemories,
    };
  }
}

/**
 * 创建 Memory 工具实例
 */
export function createMemoryTool(projectRoot?: string): MemoryTool {
  return new MemoryTool(projectRoot);
} 