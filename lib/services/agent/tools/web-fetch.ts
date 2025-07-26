/**
 * Web Fetch Tool
 * 基于 qwen-code 的 web-fetch 功能适配 agent 架构
 * 用于发送 HTTP 请求和获取网络资源
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

import {
  ToolResult,
  ToolSchema,
  ValidationResult,
} from '@/types';

import { ReadOnlyTool } from './base-tool';

interface WebFetchParams {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  maxRedirects?: number;
  responseType?: 'text' | 'json' | 'blob';
}

interface WebFetchResult extends ToolResult {
  success: boolean;
  metadata: {
    url: string;
    method: string;
    statusCode: number;
    statusText: string;
    headers: Record<string, string>;
    contentType?: string;
    contentLength?: number;
    responseTime: number;
  };
}

/**
 * Web 请求工具
 * 参考 qwen-code 的 web-fetch 实现
 */
export class WebFetchTool extends ReadOnlyTool<WebFetchParams, WebFetchResult> {
  private readonly maxResponseSize = 10 * 1024 * 1024; // 10MB
  private readonly defaultTimeout = 30000; // 30秒
  private readonly allowedDomains?: Set<string>;

  constructor(allowedDomains?: string[]) {
    const schema: ToolSchema = {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to fetch (must be HTTP or HTTPS)',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
          description: 'HTTP method (default: GET)',
        },
        headers: {
          type: 'object',
          description: 'HTTP headers to include in the request',
        },
        body: {
          type: 'string',
          description: 'Request body for POST/PUT/PATCH requests',
        },
        timeout: {
          type: 'number',
          description: 'Request timeout in milliseconds (default: 30000)',
        },
        maxRedirects: {
          type: 'number',
          description: 'Maximum number of redirects to follow (default: 5)',
        },
        responseType: {
          type: 'string',
          enum: ['text', 'json', 'blob'],
          description: 'Expected response type (default: text)',
        },
      },
      required: ['url'],
      description: 'Fetch content from a web URL using HTTP/HTTPS',
    };

    super({
      name: 'web_fetch',
      displayName: 'Web Fetch',
      description: 'Fetch content from web URLs with HTTP/HTTPS support',
      schema,
      isOutputMarkdown: true,
    });

    this.allowedDomains = allowedDomains ? new Set(allowedDomains) : undefined;
  }

  protected validateSpecific(params: WebFetchParams): ValidationResult {
    try {
      // 验证 URL 格式
      const url = new URL(params.url);
      
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return {
          valid: false,
          error: 'Only HTTP and HTTPS URLs are supported',
        };
      }

      // 验证域名白名单
      if (this.allowedDomains && !this.allowedDomains.has(url.hostname)) {
        return {
          valid: false,
          error: `Domain ${url.hostname} is not allowed`,
        };
      }

      // 验证方法和 body 的组合
      const method = params.method || 'GET';
      if (['GET', 'DELETE'].includes(method) && params.body) {
        return {
          valid: false,
          error: `${method} requests cannot have a body`,
        };
      }

      // 验证超时时间
      if (params.timeout && (params.timeout < 1000 || params.timeout > 300000)) {
        return {
          valid: false,
          error: 'Timeout must be between 1000ms and 300000ms',
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  protected async executeImpl(
    params: WebFetchParams,
    signal: AbortSignal
  ): Promise<WebFetchResult> {
    const startTime = Date.now();
    const url = new URL(params.url);
    const method = params.method || 'GET';
    const timeout = params.timeout || this.defaultTimeout;
    const maxRedirects = params.maxRedirects || 5;

    // 构建请求选项
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'User-Agent': 'Agent-WebFetch/1.0',
        ...params.headers,
      } as Record<string, string>,
      timeout,
    };

    // 添加 Content-Length for POST/PUT/PATCH
    if (params.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      options.headers['Content-Length'] = Buffer.byteLength(params.body, 'utf8').toString();
      if (!options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json';
      }
    }

    let redirectCount = 0;
    let currentUrl = params.url;

    while (redirectCount <= maxRedirects) {
      try {
        const result = await this.makeRequest(currentUrl, options, params.body, signal);
        
        // 处理重定向
        if ([301, 302, 303, 307, 308].includes(result.statusCode) && result.headers.location) {
          if (redirectCount >= maxRedirects) {
            throw new Error(`Too many redirects (max: ${maxRedirects})`);
          }
          
          redirectCount++;
          currentUrl = result.headers.location;
          const redirectUrl = new URL(currentUrl, params.url);
          
          // 更新请求选项
          options.hostname = redirectUrl.hostname;
          options.port = redirectUrl.port || (redirectUrl.protocol === 'https:' ? 443 : 80);
          options.path = redirectUrl.pathname + redirectUrl.search;
          
          // 对于 303 重定向，改为 GET 方法
          if (result.statusCode === 303) {
            options.method = 'GET';
            delete options.headers['Content-Length'];
            delete options.headers['Content-Type'];
          }
          
          continue;
        }

        // 处理响应内容
        let processedContent = result.content;
        if (params.responseType === 'json') {
          try {
            const jsonContent = JSON.parse(result.content);
            processedContent = JSON.stringify(jsonContent, null, 2);
          } catch (error) {
            throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        const responseTime = Date.now() - startTime;

        return {
          output: processedContent,
          success: result.statusCode >= 200 && result.statusCode < 300,
          metadata: {
            url: currentUrl,
            method: options.method,
            statusCode: result.statusCode,
            statusText: result.statusText,
            headers: result.headers,
            contentType: result.headers['content-type'],
            contentLength: result.content.length,
            responseTime,
          },
        };

      } catch (error) {
        throw new Error(`Web fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    throw new Error(`Too many redirects (max: ${maxRedirects})`);
  }

  private async makeRequest(
    url: string,
    options: http.RequestOptions,
    body?: string,
    signal?: AbortSignal
  ): Promise<{
    statusCode: number;
    statusText: string;
    headers: Record<string, string>;
    content: string;
  }> {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https:');
      const client = isHttps ? https : http;

      const req = client.request(options, (res) => {
        const chunks: Buffer[] = [];
        let totalSize = 0;

        res.on('data', (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > this.maxResponseSize) {
            req.destroy();
            reject(new Error(`Response size exceeds limit (${this.maxResponseSize} bytes)`));
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          const content = Buffer.concat(chunks).toString('utf8');
          const headers: Record<string, string> = {};
          
          // 规范化响应头
          Object.entries(res.headers).forEach(([key, value]) => {
            headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : (value || '');
          });

          resolve({
            statusCode: res.statusCode || 0,
            statusText: res.statusMessage || '',
            headers,
            content,
          });
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      // 处理中止信号
      if (signal) {
        signal.addEventListener('abort', () => {
          req.destroy();
          reject(new Error('Request aborted'));
        });
      }

      // 发送请求体
      if (body) {
        req.write(body);
      }

      req.end();
    });
  }
}

/**
 * 创建 Web Fetch 工具实例
 */
export function createWebFetchTool(allowedDomains?: string[]): WebFetchTool {
  return new WebFetchTool(allowedDomains);
} 