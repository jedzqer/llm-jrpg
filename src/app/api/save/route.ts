import { NextResponse } from "next/server";
import {
  loadCheckpoint,
  loadChatMessages,
  loadWorldState,
  restoreCheckpoint,
  saveCheckpoint,
} from "@/lib/storage/sqlite";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId")?.trim();

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const checkpoint = loadCheckpoint(sessionId);

  return NextResponse.json({
    sessionId,
    hasSave: Boolean(checkpoint),
    updatedAt: checkpoint?.updatedAt ?? null,
  });
}

export async function POST(req: Request) {
  const { sessionId }: { sessionId?: string } = await req.json();

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  saveCheckpoint(sessionId, loadChatMessages(sessionId), loadWorldState(sessionId));
  const checkpoint = loadCheckpoint(sessionId);

  return NextResponse.json({
    ok: true,
    hasSave: true,
    updatedAt: checkpoint?.updatedAt ?? null,
  });
}

export async function PUT(req: Request) {
  const { sessionId }: { sessionId?: string } = await req.json();

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const checkpoint = restoreCheckpoint(sessionId);
  if (!checkpoint) {
    return NextResponse.json({ error: "当前没有可读取的存档" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    messages: checkpoint.messages,
    worldState: checkpoint.worldState,
    updatedAt: checkpoint.updatedAt,
  });
}
