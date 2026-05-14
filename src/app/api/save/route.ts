import { NextResponse } from "next/server";
import {
  listAllSaveSlots,
  loadChatMessages,
  loadWorldState,
  listSaveSlots,
  restoreCheckpoint,
  saveCheckpoint,
} from "@/lib/storage/sqlite";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId")?.trim();

  if (!sessionId) {
    return NextResponse.json({
      saveSlots: listAllSaveSlots(),
    });
  }

  return NextResponse.json({
    sessionId,
    saveSlots: listSaveSlots(sessionId),
  });
}

export async function POST(req: Request) {
  const { sessionId, slotIndex }: { sessionId?: string; slotIndex?: number } = await req.json();

  if (!sessionId || typeof slotIndex !== "number") {
    return NextResponse.json({ error: "sessionId and slotIndex are required" }, { status: 400 });
  }

  saveCheckpoint(sessionId, slotIndex, loadChatMessages(sessionId), loadWorldState(sessionId));

  return NextResponse.json({
    ok: true,
    saveSlots: listSaveSlots(sessionId),
  });
}

export async function PUT(req: Request) {
  const { sessionId, slotIndex }: { sessionId?: string; slotIndex?: number } = await req.json();

  if (!sessionId || typeof slotIndex !== "number") {
    return NextResponse.json({ error: "sessionId and slotIndex are required" }, { status: 400 });
  }

  const checkpoint = restoreCheckpoint(sessionId, slotIndex);
  if (!checkpoint) {
    return NextResponse.json({ error: "当前没有可读取的存档" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    messages: checkpoint.messages,
    worldState: checkpoint.worldState,
    saveSlots: listSaveSlots(sessionId),
  });
}
