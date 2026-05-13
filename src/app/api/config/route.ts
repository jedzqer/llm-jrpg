import { NextResponse } from "next/server";
import {
  getDatabasePath,
  getResolvedLlmConfig,
  saveLlmConfig,
} from "@/lib/storage/sqlite";

export const runtime = "nodejs";

export async function GET() {
  const config = getResolvedLlmConfig();

  return NextResponse.json({
    databasePath: getDatabasePath(),
    llm: {
      providerName: config.providerName,
      modelId: config.modelId,
      baseURL: config.baseURL ?? null,
      hasApiKey: Boolean(config.apiKey),
    },
  });
}

export async function POST(req: Request) {
  const {
    providerName,
    modelId,
    baseURL,
    apiKey,
  }: {
    providerName?: string;
    modelId?: string;
    baseURL?: string | null;
    apiKey?: string | null;
  } = await req.json();

  if (!providerName?.trim() || !modelId?.trim()) {
    return NextResponse.json(
      { error: "providerName and modelId are required" },
      { status: 400 },
    );
  }

  saveLlmConfig({
    providerName: providerName.trim(),
    modelId: modelId.trim(),
    baseURL: baseURL?.trim() || undefined,
    apiKey: apiKey?.trim() || undefined,
  });

  return NextResponse.json({ ok: true });
}
