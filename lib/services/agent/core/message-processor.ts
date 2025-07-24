/**
 * Message Processor - 消息处理器
 * 🎯 职责单一：专门负责消息格式化、转换和流式事件处理
 * 遵循 SRP 原则，从 CodeReviewAgent 中分离出来
 */

import {
  ClaudeMessage,
  ClaudeResponse,
  ClaudeStreamEvent,
  Message,
  MessageMetadata,
  ToolCall,
} from '../../../../types';

export interface ProcessedResponse {
  textContent: string;
  toolCalls: ToolCall[];
}

export interface StreamProcessResult {
  content: string;
  toolCalls: ToolCall[];
  events?: Array<{
    type: 'thinking' | 'tool_start' | 'tool_progress' | 'tool_complete' | 'response' | 'complete' | 'error';
    data: Record<string, unknown>;
  }>;
}

/**
 * 消息处理器 - 专注于消息格式化和转换
 */
export class MessageProcessor {
  
  /**
   * 构建 Claude API 格式的消息
   */
  buildClaudeMessages(messages: Message[]): ClaudeMessage[] {
    const claudeMessages: ClaudeMessage[] = [];
    
    for (const message of messages) {
      if (message.role === 'system') {
        continue; // 系统消息单独处理
      }

      claudeMessages.push({
        role: message.role as 'user' | 'assistant',
        content: typeof message.content === 'string' 
          ? message.content 
          : this.formatComplexContent(message.content),
      });
    }

    return claudeMessages;
  }

  /**
   * 处理 Claude 响应
   */
  processClaudeResponse(response: ClaudeResponse): ProcessedResponse {
    const content = response.content || [];
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    // 解析响应内容
    for (const block of content) {
      if (block.type === 'text') {
        textContent += block.text || '';
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id || '',
          tool: block.name || '',
          params: block.input || {},
          status: 'pending',
        });
      }
    }

    return {
      textContent,
      toolCalls,
    };
  }

  /**
   * 处理流式事件
   */
  async processStreamEvent(
    event: ClaudeStreamEvent,
    accumulatedContent: string,
    pendingToolCalls: ToolCall[]
  ): Promise<StreamProcessResult> {
    const events: StreamProcessResult['events'] = [];
    let content = accumulatedContent;
    const toolCalls = [...pendingToolCalls];

    switch (event.type) {
      case 'content_block_start':
        if (event.content_block?.type === 'text') {
          events?.push({
            type: 'thinking',
            data: { content: 'Processing...' },
          });
        } else if (event.content_block?.type === 'tool_use') {
          const toolCall: ToolCall = {
            id: (event.content_block as Record<string, unknown>).id as string,
            tool: (event.content_block as Record<string, unknown>).name as string,
            params: {},
            status: 'pending',
          };
          toolCalls.push(toolCall);
          
          events?.push({
            type: 'tool_start',
            data: { toolCall },
          });
        }
        break;

      case 'content_block_delta':
        if (event.delta?.type === 'text_delta') {
          const deltaText = (event.delta as Record<string, unknown>).text as string || '';
          content += deltaText;
          
          events?.push({
            type: 'response',
            data: { content: deltaText },
          });
        } else if (event.delta?.type === 'input_json_delta') {
          // 工具参数增量更新
          const toolIndex = (event.index || 0);
          if (toolCalls[toolIndex]) {
            const partialJson = (event.delta as Record<string, unknown>).partial_json as string || '';
            try {
              // 尝试解析部分 JSON
              toolCalls[toolIndex].params = {
                ...toolCalls[toolIndex].params,
                ...JSON.parse(partialJson),
              };
            } catch {
              // 忽略解析错误，等待完整 JSON
            }
          }
        }
        break;

      case 'content_block_stop':
        // 内容块结束
        break;

      case 'message_delta':
        // 消息元数据更新
        break;

      case 'message_stop':
        events?.push({
          type: 'complete',
          data: { content },
        });
        break;
    }

    return {
      content,
      toolCalls,
      events,
    };
  }

  /**
   * 创建助手消息
   */
  createAssistantMessage(content: string, metadata?: MessageMetadata): Message {
    return {
      id: this.generateMessageId(),
      role: 'assistant',
      content,
      timestamp: Date.now(),
      metadata,
    };
  }

  /**
   * 创建用户消息
   */
  createUserMessage(content: string, metadata?: MessageMetadata): Message {
    return {
      id: this.generateMessageId(),
      role: 'user',
      content,
      timestamp: Date.now(),
      metadata,
    };
  }

  /**
   * 创建工具结果消息
   */
  createToolResultMessage(toolCalls: ToolCall[]): Message {
    const content = toolCalls
      .map(tc => tc.result?.output || tc.error || 'No result')
      .join('\n');

    return {
      id: this.generateMessageId(),
      role: 'user',
      content,
      timestamp: Date.now(),
      metadata: {
        tool_calls: toolCalls,
      },
    };
  }

  /**
   * 格式化复杂内容
   */
  private formatComplexContent(content: unknown): string {
    if (Array.isArray(content)) {
      return content
        .map(item => {
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && item !== null && 'text' in item) {
            return (item as Record<string, unknown>).text as string;
          }
          if (typeof item === 'object' && item !== null && 'code' in item) {
            const codeItem = item as Record<string, unknown>;
            const code = codeItem.code as Record<string, unknown>;
            return `\`\`\`${code.language || ''}\n${code.content}\n\`\`\``;
          }
          return JSON.stringify(item);
        })
        .join('\n');
    }
    
    if (typeof content === 'object' && content !== null && 'text' in content) {
      return (content as Record<string, unknown>).text as string;
    }
    
    return String(content);
  }

  /**
   * 生成消息 ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
} 