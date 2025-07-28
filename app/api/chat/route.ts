/**
 * Agent Chat API - 会话管理与 SSE 流式通信
 * 🌟 重构后的架构：Agent 会话 + SSE 实时通信
 */

import { NextRequest, NextResponse } from "next/server";

import { getGlobalConfigManager } from "@/lib/config/agent-config";
import { getGlobalAgentService } from "@/lib/services/agent";

interface ChatRequest {
  message: string;
  sessionId?: string;
  projectPath?: string;
  userMemory?: string;
  customInstructions?: string;
}

/**
 * POST - 处理聊天消息（仅支持流式）
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. 验证配置
    const configManager = getGlobalConfigManager();
    const configHealth = configManager.healthCheck();

    if (configHealth.status === "error") {
      const errorMessages = configHealth.checks
        .filter((check) => check.status === "error")
        .map((check) => check.message)
        .join(", ");

      return NextResponse.json(
        {
          success: false,
          error: `Configuration error: ${errorMessages}`,
        },
        { status: 500 }
      );
    }

    // 2. 解析请求体
    const body: ChatRequest = await request.json();
    const {
      message,
      sessionId,
      projectPath = process.cwd(),
      userMemory,
      customInstructions,
    } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Message is required",
        },
        { status: 400 }
      );
    }

    // 3. 获取 Agent 服务（使用配置服务）
    const agentService = getGlobalAgentService();

    // 4. 创建或获取会话（配置自动从配置服务获取）
    const sessionResponse = await agentService.createOrGetSession(
      {
        projectPath,
        userMemory,
        customInstructions,
      },
      sessionId
    );

    if (!sessionResponse.success || !sessionResponse.sessionId) {
      return NextResponse.json(
        {
          success: false,
          error: sessionResponse.error || "Failed to create session",
        },
        { status: 500 }
      );
    }

    const finalSessionId = sessionResponse.sessionId;

    // 5. 返回 SSE 连接
    return createSSEResponse(agentService, finalSessionId, message);
  } catch (error) {
    console.error("Chat API Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

/**
 * 创建 SSE 响应流
 */
function createSSEResponse(
  agentService: ReturnType<typeof getGlobalAgentService>,
  sessionId: string,
  message: string
): NextResponse {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 设置 SSE 控制器
        agentService.setSSEController(sessionId, controller);

        // 发送连接确认
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "connected",
              data: { sessionId, timestamp: Date.now() },
            })}\n\n`
          )
        );

        // 处理消息流
        const messageStream = agentService.processMessageStream(
          sessionId,
          message
        );

        for await (const event of messageStream) {
          const sseData = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        }

        // 发送完成信号
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "complete",
              data: { sessionId, timestamp: Date.now() },
            })}\n\n`
          )
        );
      } catch (error) {
        console.error("SSE Stream Error:", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              data: {
                error: error instanceof Error ? error.message : "Unknown error",
                sessionId,
              },
            })}\n\n`
          )
        );
      } finally {
        controller.close();
      }
    },

    cancel() {
      console.log(`🔌 SSE connection cancelled for session: ${sessionId}`);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

/**
 * GET - 健康检查
 */
export async function GET(): Promise<NextResponse> {
  try {
    // 使用配置服务进行健康检查
    const configManager = getGlobalConfigManager();
    const agentService = getGlobalAgentService();

    const configHealth = configManager.healthCheck();
    const serviceHealth = await agentService.healthCheck();

    const overallStatus =
      configHealth.status === "error" || serviceHealth.status === "unhealthy"
        ? "unhealthy"
        : configHealth.status === "warning" ||
          serviceHealth.status === "degraded"
        ? "degraded"
        : "healthy";

    return NextResponse.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      details: {
        config: configHealth,
        service: serviceHealth,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
