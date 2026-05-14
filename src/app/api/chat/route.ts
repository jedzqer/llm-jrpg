import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { normalizeChatMessages } from "@/lib/chat/messages";
import { gameTools } from "@/lib/ai/tools";
import {
  ensureChatSession,
  getResolvedLlmConfig,
  loadChatMessages,
  loadWorldState,
  saveChatMessages,
} from "@/lib/storage/sqlite";

export const runtime = "nodejs";
export const maxDuration = 30;

type MessageMetadata = Record<string, unknown> & {
  reasoning_content?: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId")?.trim();

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  ensureChatSession(sessionId);

  return NextResponse.json({
    sessionId,
    messages: loadChatMessages(sessionId),
  });
}

export async function POST(req: Request) {
  const {
    messages,
    sessionId,
  }: {
    messages: UIMessage[];
    sessionId?: string;
  } = await req.json();

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const { apiKey, modelId, providerName, baseURL } = getResolvedLlmConfig();
  if (!apiKey || !modelId) {
    return NextResponse.json(
      { error: "LLM 尚未配置，请先在页面内填写并保存模型配置。" },
      { status: 500 },
    );
  }

  const normalizedMessages = normalizeChatMessages(messages);
  const worldState = loadWorldState(sessionId);

  // reasoning_content values from prior assistant UI messages, one per message in order.
  // DeepSeek thinking mode is strict about this field during tool-call continuations:
  // assistant messages should keep the original value, or an empty string when absent.
  const historicalReasoningContents: string[] = normalizedMessages
    .filter((m) => m.role === "assistant")
    .map((m) => ((m.metadata as MessageMetadata | undefined)?.reasoning_content as string) ?? "");

  // reasoning_content captured from the current in-flight step's response
  let stepReasoningContent = "";
  // all reasoning_content accumulated across all steps of this request
  let totalReasoningContent = "";

  const provider = createOpenAI({
    apiKey,
    name: providerName,
    baseURL,
    fetch: async (url, options) => {
      if (options?.body && typeof options.body === "string") {
        const body = JSON.parse(options.body) as {
          messages?: Array<{ role: string; reasoning_content?: string }>;
        };
        if (Array.isArray(body.messages)) {
          // Build the full list of reasoning_content to inject:
          // historical assistant messages first, then the current in-request assistant step.
          // Even when reasoning is empty, DeepSeek accepts "" and it keeps the
          // assistant-message alignment stable across tool-call continuations.
          const rcQueue = [...historicalReasoningContents, stepReasoningContent];

          let assistantIdx = 0;
          body.messages = body.messages.map((msg) => {
            // rewrite developer → system
            const out =
              msg.role === "developer"
                ? { ...msg, role: "system" }
                : { ...msg };
            if (out.role === "assistant") {
              out.reasoning_content = rcQueue[assistantIdx] ?? "";
              assistantIdx++;
            }
            return out;
          });
        }
        options = { ...options, body: JSON.stringify(body) };
      }

      // reset before this step's response
      stepReasoningContent = "";
      const response = await fetch(url, options);

      // intercept SSE stream to capture reasoning_content
      if (!response.body) return response;
      const reader = response.body.getReader();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const decoder = new TextDecoder();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const text = decoder.decode(value, { stream: true });
              for (const line of text.split("\n")) {
                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                  try {
                    const data = JSON.parse(line.slice(6)) as {
                      choices?: Array<{ delta?: { reasoning_content?: string } }>;
                    };
                    const rc = data?.choices?.[0]?.delta?.reasoning_content;
                    if (rc) {
                      stepReasoningContent += rc;
                      totalReasoningContent += rc;
                    }
                  } catch {
                    // non-JSON line, skip
                  }
                }
              }
              controller.enqueue(value);
            }
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
  });

  const result = streamText({
    model: provider.chat(modelId),
    system: buildSystemPrompt(worldState),
    messages: await convertToModelMessages(normalizedMessages),
    stopWhen: stepCountIs(2),
    tools: gameTools,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: normalizedMessages,
    messageMetadata: ({ part }) => {
      if (part.type !== "finish") {
        return undefined;
      }

      return {
        reasoning_content: totalReasoningContent,
      } satisfies MessageMetadata;
    },
    onFinish: ({ responseMessage }) => {
      const toSave = {
        ...responseMessage,
        metadata: {
          ...(responseMessage.metadata as MessageMetadata | undefined),
          reasoning_content: totalReasoningContent,
        },
      };
      saveChatMessages(sessionId, [...normalizedMessages, toSave]);
    },
  });
}
