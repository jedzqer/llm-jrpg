import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { baseSystemPrompt } from "@/lib/ai/prompts";
import { normalizeChatMessages } from "@/lib/chat/messages";
import { gameTools } from "@/lib/ai/tools";
import {
  ensureChatSession,
  getResolvedLlmConfig,
  loadChatMessages,
  replaceChatMessages,
  saveChatMessages,
} from "@/lib/storage/sqlite";

export const runtime = "nodejs";
export const maxDuration = 30;

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

  const provider = createOpenAI({
    apiKey,
    name: providerName,
    baseURL,
  });

  const result = streamText({
    model: provider.chat(modelId),
    system: baseSystemPrompt,
    messages: await convertToModelMessages(normalizedMessages),
    stopWhen: stepCountIs(2),
    tools: gameTools,
    providerOptions: {
      [providerName]: {
        systemMessageMode: "system",
      },
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: normalizedMessages,
    onFinish: ({ responseMessage }) => {
      saveChatMessages(sessionId, [...normalizedMessages, responseMessage]);
    },
  });
}

export async function DELETE(req: Request) {
  const {
    sessionId,
    messageId,
  }: {
    sessionId?: string;
    messageId?: string;
  } = await req.json();

  if (!sessionId || !messageId) {
    return NextResponse.json({ error: "sessionId and messageId are required" }, { status: 400 });
  }

  const messages = loadChatMessages(sessionId);
  const nextMessages = normalizeChatMessages(messages.filter((message) => message.id !== messageId));
  replaceChatMessages(sessionId, nextMessages);

  return NextResponse.json({ ok: true, messages: nextMessages });
}
