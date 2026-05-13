import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { baseSystemPrompt } from "@/lib/ai/prompts";
import { gameTools } from "@/lib/ai/tools";

export const maxDuration = 30;

const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY?.trim();
const modelId = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const providerName = process.env.OPENAI_PROVIDER_NAME?.trim() || "openai";
const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;

const provider = createOpenAI({
  apiKey,
  name: providerName,
  baseURL,
});

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: provider(modelId),
    system: baseSystemPrompt,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(2),
    tools: gameTools,
  });

  return result.toUIMessageStreamResponse();
}
