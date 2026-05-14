import { NextResponse } from "next/server";
import { loadWorldState, saveWorldState } from "@/lib/storage/sqlite";
import type { WorldState } from "@/lib/game/schema";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId")?.trim();

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  return NextResponse.json({
    sessionId,
    worldState: loadWorldState(sessionId),
  });
}

export async function POST(req: Request) {
  const { sessionId, worldState }: { sessionId?: string; worldState?: WorldState } = await req.json();

  if (!sessionId || !worldState) {
    return NextResponse.json({ error: "sessionId and worldState are required" }, { status: 400 });
  }

  saveWorldState(sessionId, worldState);

  return NextResponse.json({ ok: true, worldState });
}
