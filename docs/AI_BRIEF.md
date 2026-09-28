# Ghennai Agent — AI Project Brief
> Paste this file's URL into ChatGPT along with your question.

## What it is
Ghennai Agent — open-source (MIT) Arabic-first AI agent platform that builds real websites.
User chats → 7 AI agents (Core/Coding/Research/Study/Design/Genie/Voice) → live code rail →
real preview → instant `/live/<code>` share link. Runs locally or on Render.

## Stack
- Frontend: React 18 + TypeScript + TailwindCSS + Framer Motion + Zustand + Monaco + xterm.js (Vite, base `/ghennai-app/` locally, `/` in production)
- Backend: Node.js + Express + SQLite (better-sqlite3) + SSE (`/api/chat` stream, `/api/events`)
- AI: Ollama local (`qwen2.5:3b` chat, `moondream` vision) + cloud race (Gemini/Groq/OpenRouter/OpenAI) via `server/lib/modelRouter.js` with per-role ordering (coding/chat/vision/review/design)
- Deploy: Docker + `render.yaml` (service `ghennai`) + Cloudflare tunnel guard

## Key backend flows (`server/`)
- `agents/brain.js` — `brainRequest()`: sync router → `runBuildPipeline()` (architect plan → `runCoding` → design note → teach → Genie review) or direct `runCoding`; per-agent threads + shared memory; instant `ack` event (~0ms)
- `agents/codingAgent.js` — `runCoding()`: share link first → tool loop (10 turns) → `validateUserSite` → diagnoser-guided repair (2 rounds, rollback on worsen) → adaptive polish (2 rounds, industry-allowed effects only) → `verifySiteBuilt` → **browserQA gate** (1 guided fix) → `live_link` + answer with clickable URL
- `agents/designEngine.js` — adaptive engine: `detectIndustry()` (10 industries + generic), semantic layer (audience/goal/mood), rotating palettes, `composeBlueprint()` (pages/features/12 acceptance criteria), `detectComplexity()` (SIMPLE/MEDIUM/APPLICATION), `componentBlock()`, `genericTemplateFlags()` (rejects generic templates)
- `lib/browserQA.js` — real Playwright QA: HTTP status/content-type/HTML marker, console errors, dead internal links (static-host resolution), overflow at 360/768/1440, desktop+mobile screenshots, feature checks → `evaluateAcceptance()` (PASS/FAIL) → `finalGate()` (technical/functional/visual/responsive/content/security → COMPLETED/NEEDS_REPAIR/FAILED)
- `lib/buildStates.js` — 13-state machine + 10 real UI stages (no fake progress)
- `lib/diagnoser.js` — root-cause diagnosis {severity,file,issue,rootCause,fix} + guarded rollback via `projects.js` snapshots
- `lib/share.js` — `ensureShare()` + `publicUrl()` (PUBLIC_URL ← tunnel.json ← relative)
- `routes/` — chat (SSE + 20s heartbeat), vision (Gemini-first, Arabic, persisted to memory), builder, preview (`processes.js` real dev servers + proxy), providers, approvals, brain, projects
- `tools/filesystem.js` — `vacuousWrite()` guard rejects placeholder writes ("…", empty, tiny HTML/CSS/JS)

## Key frontend (`src/`)
- `store/app.ts` — per-agent conversations (`ghn_msgs_<agent>`), live files, rail state, 10 build stages
- `components/dashboard/CodeRail.tsx` — live code rail beside chat (read-speed pacer, tabs, highlight, build-stage checklist)
- `components/dashboard/ChatPanel.tsx` + `hooks/chatEvents.ts` (`ack`, `coding_start`, `code_token`, `live_link`, `build_stage`, `qa_report`) + `hooks/useChat.ts`
- `components/studio/StudioIDE.tsx` — full IDE (files + preview + agent + terminal + git + verify)
- `pages/Dashboard.tsx` — resizable panels (chat | arena | code rail)

## Quality doctrine (enforced, not suggested)
No fake success/progress/preview/validation — every FAILED path is explicit. Generic white-bg+heading+cards+footer sites are rejected and rebuilt.

## Run / verify
`npm run dev` (server :3001 + web :5173) · `npm run check|lint|build` · tests: `agent-phase1` (19) `builder-cases` (9, real browser) `phase-fixes` `studio-e2e` (12) `studio-mobile` `smoke`

## Docs
`docs/SESSION_SUMMARY.md` (session history) · `docs/BUILD_AUDIT.md` (9 flows audit) · `docs/RECONSTRUCTION_REPORT.md` (final §44 report)
