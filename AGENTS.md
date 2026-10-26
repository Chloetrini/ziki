# AGENTS.md

Instructions for AI coding agents working on **Ziki Issues** (HNG15 Task 1).

**Agent API Reference:** [`docs/ziki-for-agents.md`](./docs/ziki-for-agents.md) — Ziki agent API, levels, points, and safety rules.

This repo, `Zedu-Endor/issue-tracker`, is the Team Zendor **fork** of [`emerjent/bug-tracker`](https://github.com/emerjent/bug-tracker) (formerly `zeduchat/bug-tracker`). Production runs at `https://ziki.dev` (served from root; the old `issues.zedu.chat` host still works), with legacy `/bug-tracker` compatibility preserved.

**Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) first.** It is the source of truth for branches, commits, PRs, and local setup. This file adds agent-specific guidance.

## Stack

- Next.js App Router + React 19 + TypeScript + Tailwind CSS
- Prisma + PostgreSQL (`docker compose`)
- Auth.js (NextAuth v5) — credentials + optional Google
- Zod validation in `lib/validations/`
- Package manager: **pnpm only**
- Deploy: Dockerfile → Coolify (malware CI gate on `main`)

## Hard rules

- Work on a feature branch; PRs target **`main`** on `Zedu-Endor/issue-tracker` only (not `zedu-hng` or product repos). Do not open PRs against the upstream (`emerjent/bug-tracker`) unless asked.
- Never force-push (`--force`, `-f`, `--force-with-lease`).
- Never commit `.env`, secrets, keys, or credential JSON.
- Keep changes scoped to the ticket / request — no drive-by refactors.
- Do not overwrite unrelated in-progress app work; prefer additive edits.
- One logical change per PR when practical.
- **Never reseed the shared/local demo DB** if teammates (or you) have created real accounts. `pnpm db:seed`, `prisma db seed`, `pnpm db:reset`, and `prisma migrate reset` wipe users and related data. Prefer **migrations only** (`pnpm db:migrate` / `prisma migrate deploy`). Seed is for **empty first-time setup only**.

## Layout

| Path | Holds |
| --- | --- |
| `app/` | App Router routes, `(app)` / `(auth)` groups, `actions/`, `api/` |
| `components/` | UI components |
| `lib/` | Prisma client, auth helpers, formatters, `validations/` |
| `prisma/` | Schema, migrations, seed |
| `types/` | Shared TypeScript types |

## Commands

```bash
pnpm install
docker compose up -d
cp .env.example .env   # never commit .env
pnpm db:migrate
# pnpm db:seed   # ONLY on empty first-time setup — never if real signups exist
pnpm dev               # http://localhost:3001
pnpm lint
pnpm test              # Vitest — required before declaring done
pnpm test:watch
pnpm build
```

> **DB safety:** Do not run `db:seed` / `db:reset` against a DB that already has teammate accounts. Migrations only.

## Autonomous Multi-Agent SDLC Workflow

Ziki uses an autonomous multi-agent software engineering lifecycle. Follow these guidelines:

1. **Consult the Mistake Registry First**:
   - Before implementing a task, query known anti-patterns via `GET /api/v1/projects/{id}/mistakes` (or MCP tool `ziki_get_project_mistakes`) to avoid repeating documented mistakes.

2. **Submission Evidence**:
   - When linking a pull request via `POST /api/v1/issues/{id}/github`, contributor agents must supply visual proofs (`screenshots`) and automated test output (`testResults`).
   - Contributor agents do **not** mark merged work as resolved. Submission moves the ticket to `reviewStatus: "submitted"`.

3. **Two-Stage Integration**:
   - **Merger Review**: Evaluates for completeness, efficiency, and mergeability; accepts (`ready_to_merge`) or rejects with actionable feedback (`rejected`). Any new anti-patterns discovered during review must be documented via `POST /api/v1/projects/{id}/mistakes`.
   - **Admin Merger**: Executes the Git merge (`POST /api/v1/issues/{id}/admin-merge`) after verifying that GitHub Actions deployment checks are passing, updating the ticket to `merged`.
   - **Human Reviewer Gate (HITL)**: Mandatory review for issues involving major features or architectural pivots.

4. **Real-time Event Streaming**:
   - Stream real-time events over Server-Sent Events (SSE) via `GET /api/v1/events/stream`.

## Testing (required before done)

- Run `pnpm test` and fix failures before claiming a task complete.
- Use Node 22 as required by `package.json`. On Node 26, experimental native web storage can break jsdom theme tests; `NODE_OPTIONS=--no-experimental-webstorage pnpm test` avoids that runtime conflict without changing project configuration.
- Validation schemas live in `lib/validations/bug.ts`; unit tests cover happy + invalid cases under `lib/validations/`.
- Prefer Vitest for pure logic; do not invent heavy E2E unless asked.

## Commits

Conventional Commits: `type(ENDOR-xxx): summary` when ticketed, else `type: summary`. See CONTRIBUTING.md.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
