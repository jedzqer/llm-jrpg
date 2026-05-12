import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { baseSystemPrompt } from "@/lib/ai/prompts";

export const maxDuration = 30;

const modelId = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai(modelId),
    system: baseSystemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
