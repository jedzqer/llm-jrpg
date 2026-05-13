import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { baseSystemPrompt } from "@/lib/ai/prompts";
import { gameTools } from "@/lib/ai/tools";
import {
  ensureChatSession,
  getResolvedLlmConfig,
  loadChatMessages,
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
  if (!apiKey) {
    return NextResponse.json(
      { error: "LLM API key is missing. Set env once to seed the SQLite config." },
      { status: 500 },
    );
  }

  const provider = createOpenAI({
    apiKey,
    name: providerName,
    baseURL,
  });

  const result = streamText({
    model: provider(modelId),
    system: baseSystemPrompt,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(2),
    tools: gameTools,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: ({ responseMessage }) => {
      saveChatMessages(sessionId, [...messages, responseMessage]);
    },
  });
}
