/**
 * Prompt Management API
 * 🔧 动态管理系统 Prompt 的 API 端点
 */

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getCoreSystemPrompt,
  getProjectEnvironment,
  loadCustomSystemPrompt,
  saveSystemPrompt,
} from '@/lib/services/prompt-manager';

/**
 * GET - 获取当前系统 Prompt
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const projectPath = url.searchParams.get('projectPath') || process.cwd();
    const includeEnvironment = url.searchParams.get('includeEnvironment') === 'true';

    // 获取基础 prompt
    const systemPrompt = getCoreSystemPrompt();
    
    const response: any = {
      success: true,
      data: {
        systemPrompt,
        customPromptExists: !!loadCustomSystemPrompt(),
        timestamp: new Date().toISOString(),
      },
    };

    // 可选：包含环境信息
    if (includeEnvironment) {
      const environment = await getProjectEnvironment(projectPath);
      response.data.environment = environment;
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Get prompt error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * POST - 保存自定义系统 Prompt
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { content } = await request.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json({
        success: false,
        error: 'Content is required and must be a string'
      }, { status: 400 });
    }

    // 保存自定义 prompt
    saveSystemPrompt(content);

    return NextResponse.json({
      success: true,
      message: 'System prompt saved successfully',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Save prompt error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

/**
 * DELETE - 删除自定义系统 Prompt（恢复默认）
 */
export async function DELETE(): Promise<NextResponse> {
  try {
    const fs = await import('fs');
    const { SYSTEM_PROMPT_FILE } = await import('@/lib/services/prompt-manager');

    if (fs.existsSync(SYSTEM_PROMPT_FILE)) {
      fs.unlinkSync(SYSTEM_PROMPT_FILE);
    }

    return NextResponse.json({
      success: true,
      message: 'Custom system prompt deleted, using default',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Delete prompt error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 });
  }
} 