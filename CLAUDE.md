# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See `DEVELOPMENT.md` for accumulated dev notes — documentation-fetch workflow, verified AI SDK v5 snippets, and known gotchas. Read it before doing AI SDK work; append to it when you hit something worth remembering.

## Commands

```bash
npm run dev      # start Next.js dev server
npm run build    # production build
npm run lint     # run ESLint
```

No test runner is configured yet.

## Environment

Copy `.env.example` to `.env.local` and fill in:

```
OPENAI_COMPATIBLE_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
```

## Architecture

This is a Next.js 16 App Router scaffold for an LLM-powered JRPG. The stack is:

- **Frontend**: `@ai-sdk/react` (`useChat`) for streaming chat UI
- **Backend**: `ai` (AI SDK Core) `streamText` called from the Next.js Route Handler at `src/app/api/chat/route.ts`
- **Game layer**: typed world state in `src/lib/game/schema.ts`, serialized into the system prompt via `src/lib/ai/prompts.ts`

### Key data flow

1. `src/lib/game/schema.ts` defines `WorldState` (player, active NPC, active quest) and exports `starterWorldState`.
2. `src/lib/ai/prompts.ts` builds `baseSystemPrompt` by JSON-serializing `starterWorldState` into the prompt string.
3. `src/app/api/chat/route.ts` is the LLM boundary — currently a placeholder returning 501. The intended implementation is `streamText` from `ai` using `baseSystemPrompt` as the system message.
4. The frontend (`src/app/page.tsx`) is currently a static landing page; it should be replaced with a `useChat`-powered game scene.

### Intended build order

1. Implement `streamText` in `src/app/api/chat/route.ts` using `baseSystemPrompt`.
2. Replace `src/app/page.tsx` with a playable chat scene using `useChat`.
3. Make `WorldState` mutable and persist it (server-side session, DB, or URL state).
4. Add AI SDK tools for dice rolls, inventory changes, and world events.
