/**
 * Web Search Tool
 * 基于 qwen-code 的 web-search 功能适配 agent 架构
 * 使用搜索引擎 API 进行网络搜索
 */

import {
  ToolResult,
  ToolSchema,
  ValidationResult,
} from '../../../../types';
import { ReadOnlyTool } from './base-tool';
import { createWebFetchTool } from './web-fetch';

interface WebSearchParams {
  query: string;
  maxResults?: number;
  language?: string;
  region?: string;
  safeSearch?: 'off' | 'moderate' | 'strict';
  timeRange?: 'hour' | 'day' | 'week' | 'month' | 'year';
  searchType?: 'web' | 'images' | 'news' | 'videos';
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  displayUrl: string;
  publishedDate?: string;
  source?: string;
}

interface WebSearchResult extends ToolResult {
  metadata: {
    query: string;
    totalResults: number;
    searchEngine: string;
    searchTime: number;
    language: string;
    region: string;
  };
  results: SearchResult[];
}

/**
 * Web 搜索工具
 * 参考 qwen-code 的 web-search 实现
 */
export class WebSearchTool extends ReadOnlyTool<WebSearchParams, WebSearchResult> {
  private readonly webFetch = createWebFetchTool();
  private readonly maxResults = 10;
  private readonly searchEngines: SearchEngine[];

  constructor(apiKeys?: { googleApiKey?: string; googleCseId?: string; bingApiKey?: string }) {
    const schema: ToolSchema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of search results to return (default: 5, max: 10)',
        },
        language: {
          type: 'string',
          description: 'Language code for search results (e.g., en, zh, ja)',
        },
        region: {
          type: 'string',
          description: 'Region code for search results (e.g., US, CN, JP)',
        },
        safeSearch: {
          type: 'string',
          enum: ['off', 'moderate', 'strict'],
          description: 'Safe search setting (default: moderate)',
        },
        timeRange: {
          type: 'string',
          enum: ['hour', 'day', 'week', 'month', 'year'],
          description: 'Time range for search results',
        },
        searchType: {
          type: 'string',
          enum: ['web', 'images', 'news', 'videos'],
          description: 'Type of search to perform (default: web)',
        },
      },
      required: ['query'],
      description: 'Search the web using search engines',
    };

    super(
      'web_search',
      'Web Search',
      'Search the web for information using search engines',
      schema,
      true
    );

    // 初始化搜索引擎
    this.searchEngines = this.initializeSearchEngines(apiKeys);
  }

  private initializeSearchEngines(apiKeys?: { googleApiKey?: string; googleCseId?: string; bingApiKey?: string }): SearchEngine[] {
    const engines: SearchEngine[] = [];

    // Google Custom Search Engine
    if (apiKeys?.googleApiKey && apiKeys?.googleCseId) {
      engines.push(new GoogleSearchEngine(apiKeys.googleApiKey, apiKeys.googleCseId, this.webFetch));
    }

    // Bing Search Engine
    if (apiKeys?.bingApiKey) {
      engines.push(new BingSearchEngine(apiKeys.bingApiKey, this.webFetch));
    }

    // DuckDuckGo (免费，无需 API key)
    engines.push(new DuckDuckGoSearchEngine(this.webFetch));

    return engines;
  }

  protected validateSpecific(params: WebSearchParams): ValidationResult {
    // 验证查询字符串
    if (!params.query || params.query.trim().length === 0) {
      return {
        valid: false,
        error: 'Search query cannot be empty',
      };
    }

    if (params.query.length > 1000) {
      return {
        valid: false,
        error: 'Search query too long (max: 1000 characters)',
      };
    }

    // 验证结果数量
    if (params.maxResults && (params.maxResults < 1 || params.maxResults > this.maxResults)) {
      return {
        valid: false,
        error: `maxResults must be between 1 and ${this.maxResults}`,
      };
    }

    return { valid: true };
  }

  protected async executeSpecific(
    params: WebSearchParams,
    signal: AbortSignal
  ): Promise<WebSearchResult> {
    const startTime = Date.now();
    const maxResults = Math.min(params.maxResults || 5, this.maxResults);
    const language = params.language || 'en';
    const region = params.region || 'US';

    if (this.searchEngines.length === 0) {
      throw new Error('No search engines configured. Please provide API keys for Google or Bing, or use DuckDuckGo.');
    }

    // 尝试使用可用的搜索引擎
    let lastError: Error | null = null;
    
    for (const engine of this.searchEngines) {
      try {
        const results = await engine.search({
          query: params.query,
          maxResults,
          language,
          region,
          safeSearch: params.safeSearch || 'moderate',
          timeRange: params.timeRange,
          searchType: params.searchType || 'web',
        }, signal);

        const searchTime = Date.now() - startTime;

        // 格式化输出
        const formattedOutput = this.formatSearchResults(results, params.query);

        return {
          output: formattedOutput,
          success: true,
          metadata: {
            query: params.query,
            totalResults: results.length,
            searchEngine: engine.getName(),
            searchTime,
            language,
            region,
          },
          results,
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`Search engine ${engine.getName()} failed:`, error);
        continue;
      }
    }

    throw lastError || new Error('All search engines failed');
  }

  private formatSearchResults(results: SearchResult[], query: string): string {
    if (results.length === 0) {
      return `No search results found for "${query}".`;
    }

    let output = `# Search Results for "${query}"\n\n`;
    output += `Found ${results.length} results:\n\n`;

    results.forEach((result, index) => {
      output += `## ${index + 1}. ${result.title}\n`;
      output += `**URL:** ${result.url}\n`;
      output += `**Source:** ${result.source || result.displayUrl}\n`;
      if (result.publishedDate) {
        output += `**Published:** ${result.publishedDate}\n`;
      }
      output += `**Summary:** ${result.snippet}\n\n`;
    });

    return output;
  }
}

/**
 * 搜索引擎接口
 */
abstract class SearchEngine {
  constructor(protected webFetch: any) {}
  
  abstract getName(): string;
  abstract search(params: WebSearchParams, signal: AbortSignal): Promise<SearchResult[]>;
}

/**
 * Google 自定义搜索引擎
 */
class GoogleSearchEngine extends SearchEngine {
  constructor(
    private apiKey: string,
    private cseId: string,
    webFetch: any
  ) {
    super(webFetch);
  }

  getName(): string {
    return 'Google Custom Search';
  }

  async search(params: WebSearchParams, signal: AbortSignal): Promise<SearchResult[]> {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('cx', this.cseId);
    url.searchParams.set('q', params.query);
    url.searchParams.set('num', Math.min(params.maxResults || 5, 10).toString());
    
    if (params.language) {
      url.searchParams.set('lr', `lang_${params.language}`);
    }
    
    if (params.region) {
      url.searchParams.set('gl', params.region);
    }

    if (params.safeSearch !== 'off') {
      url.searchParams.set('safe', params.safeSearch === 'strict' ? 'high' : 'medium');
    }

    const response = await this.webFetch.execute({
      url: url.toString(),
      method: 'GET',
      responseType: 'json',
    }, signal);

    if (!response.success) {
      throw new Error(`Google Search API failed: ${response.metadata.statusCode}`);
    }

    const data = JSON.parse(response.output);
    
    if (!data.items) {
      return [];
    }

    return data.items.map((item: any): SearchResult => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
      displayUrl: item.displayLink,
      source: item.displayLink,
    }));
  }
}

/**
 * Bing 搜索引擎
 */
class BingSearchEngine extends SearchEngine {
  constructor(
    private apiKey: string,
    webFetch: any
  ) {
    super(webFetch);
  }

  getName(): string {
    return 'Bing Search';
  }

  async search(params: WebSearchParams, signal: AbortSignal): Promise<SearchResult[]> {
    const url = new URL('https://api.bing.microsoft.com/v7.0/search');
    url.searchParams.set('q', params.query);
    url.searchParams.set('count', Math.min(params.maxResults || 5, 10).toString());
    
    if (params.language) {
      url.searchParams.set('setLang', params.language);
    }
    
    if (params.region) {
      url.searchParams.set('cc', params.region);
    }

    if (params.safeSearch !== 'off') {
      url.searchParams.set('safeSearch', params.safeSearch === 'strict' ? 'Strict' : 'Moderate');
    }

    const response = await this.webFetch.execute({
      url: url.toString(),
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey,
      },
      responseType: 'json',
    }, signal);

    if (!response.success) {
      throw new Error(`Bing Search API failed: ${response.metadata.statusCode}`);
    }

    const data = JSON.parse(response.output);
    
    if (!data.webPages || !data.webPages.value) {
      return [];
    }

    return data.webPages.value.map((item: any): SearchResult => ({
      title: item.name,
      url: item.url,
      snippet: item.snippet,
      displayUrl: item.displayUrl,
      source: item.displayUrl,
      publishedDate: item.dateLastCrawled,
    }));
  }
}

/**
 * DuckDuckGo 搜索引擎（免费）
 */
class DuckDuckGoSearchEngine extends SearchEngine {
  getName(): string {
    return 'DuckDuckGo';
  }

  async search(params: WebSearchParams, signal: AbortSignal): Promise<SearchResult[]> {
    // DuckDuckGo Instant Answer API
    const url = new URL('https://api.duckduckgo.com/');
    url.searchParams.set('q', params.query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_html', '1');
    url.searchParams.set('skip_disambig', '1');

    const response = await this.webFetch.execute({
      url: url.toString(),
      method: 'GET',
      responseType: 'json',
    }, signal);

    if (!response.success) {
      throw new Error(`DuckDuckGo API failed: ${response.metadata.statusCode}`);
    }

    const data = JSON.parse(response.output);
    const results: SearchResult[] = [];

    // 处理相关主题
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      const topics = data.RelatedTopics
        .filter((topic: any) => topic.FirstURL && topic.Text)
        .slice(0, params.maxResults || 5);

      results.push(...topics.map((topic: any): SearchResult => ({
        title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 50),
        url: topic.FirstURL,
        snippet: topic.Text,
        displayUrl: this.extractDomain(topic.FirstURL),
        source: this.extractDomain(topic.FirstURL),
      })));
    }

    // 如果没有相关主题，添加抽象信息
    if (results.length === 0 && data.Abstract) {
      results.push({
        title: data.Heading || params.query,
        url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(params.query)}`,
        snippet: data.Abstract,
        displayUrl: data.AbstractSource || 'DuckDuckGo',
        source: data.AbstractSource || 'DuckDuckGo',
      });
    }

    return results;
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
}

/**
 * 创建 Web Search 工具实例
 */
export function createWebSearchTool(apiKeys?: { 
  googleApiKey?: string; 
  googleCseId?: string; 
  bingApiKey?: string; 
}): WebSearchTool {
  return new WebSearchTool(apiKeys);
} 