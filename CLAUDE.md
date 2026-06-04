# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

An agentic proposal-generation pipeline built on **Trigger.dev v3**. It ingests sales leads from two sources (Typeform webhooks and Gmail), uses Claude (Anthropic SDK) to extract structured data and generate a full professional proposal, builds a `.docx` file, uploads it to Google Drive, and emails it to a manager.

## Commands

```bash
# Local dev server (watches src/trigger/, hot-reloads tasks)
npm run dev

# Deploy to Trigger.dev cloud
npm run deploy

# One-time OAuth2 token setup for Gmail (run locally before first deploy)
npm run setup:gmail-token

# Local Express webhook receiver (alternative to Trigger.dev HTTP endpoint)
npm run start:webhook

# Run individual integration scripts against real services
npm run test:extractor   # Claude email extraction
npm run test:generator   # Claude proposal generation
npm run test:docx        # .docx builder output
npm run test:drive       # Google Drive upload
npm run test:mailer      # Nodemailer send
```

Scripts use `ts-node` directly — no build step needed for local testing.

## Architecture

All runtime code lives under `src/trigger/`. Trigger.dev scans this directory and registers every exported task automatically.

### Entry points (tasks)

| File | Task ID | Trigger | SDK API |
|------|---------|---------|---------|
| `tasks/typeform-webhook.ts` | `typeform-webhook` | HTTP webhook from Typeform | `task()` |
| `tasks/gmail-poller.ts` | `gmail-poller` | Cron schedule every 15 minutes | `schedules.task()` |
| `tasks/proposal-pipeline.ts` | `proposal-pipeline` | Triggered by both above tasks | `task()` |

### Pipeline flow

```
Typeform webhook ──┐
                   ├──► proposal-pipeline ──► Claude generate ──► build .docx ──► Drive upload ──► email manager
Gmail poller ──────┘
```

`proposal-pipeline` is the core task — the two entry tasks only parse/extract the lead and call `proposalPipeline.trigger(leadData)`.

### Library layer (`src/trigger/lib/`)

- **`email-extractor.ts`** — Calls Claude to parse a raw email into a `LeadData` struct. Falls back to regex/truncated body if Claude fails.
- **`proposal-generator.ts`** — Calls Claude with a detailed system prompt; expects a raw JSON response of exactly 10 `ProposalSections` keys. Validates all keys after parse; missing keys get a placeholder string rather than throwing.
- **`docx-builder.ts`** — Builds a `.docx` Buffer using the `docx` npm package from a `ProposalDocument`.
- **`drive-uploader.ts`** — Uploads the `.docx` buffer to a configured Google Drive folder using **OAuth2** (not a service account). Sets `reader/anyone` permission and returns `{ fileId, shareableLink }`.
- **`notify-mailer.ts`** — Sends an email via Nodemailer SMTP (Gmail app password) with the `.docx` attached and Drive link in the body.

### Shared types (`src/trigger/types.ts`)

All interfaces live here: `LeadData`, `ProposalSections`, `ProposalDocument`, `PipelineResult`, `StepResult`, `RawEmailLead`, `TypeformWebhookPayload`, `TypeformAnswer`.

## Key Design Decisions

**Idempotency keys** — both entry tasks set `idempotencyKey` on `proposalPipeline.trigger()` (`typeform-{token}` and `gmail-{messageId}`), so retries or duplicate webhooks never produce duplicate proposals.

**Email failure is non-fatal** — `proposal-pipeline` returns `{ success: true, emailSent: false }` if Drive upload succeeds but email fails. The Drive link is always the source of truth.

**Gmail label convention** — the poller reads only messages with label `proposal-leads` (UNREAD). After processing it adds label `processed-proposal` and removes UNREAD. Both labels must be created manually in Gmail before deploying. If `processed-proposal` doesn't exist, the poller logs a warning and only removes UNREAD — emails will not be re-processed on the next poll because UNREAD is removed either way.

**Typeform field refs** — `FIELD_REFS` map in `typeform-webhook.ts` maps Typeform `field.ref` values (snake_case strings set in the Typeform dashboard) to `LeadData` fields. Current keys: `prospect_name`, `company_name`, `contact_email`, `requirement_description`, `timeline`, `team_size`, `manager_email`. If a form is restructured, update this map.

**Claude model** — both `email-extractor.ts` and `proposal-generator.ts` hardcode `claude-sonnet-4-6`. Update both files if switching models.

**Retry config** — `proposal-pipeline` defines its own retry config (3 attempts, 3s–30s exponential backoff) that takes precedence over the global `trigger.config.ts` defaults. `typeform-webhook` and `gmail-poller` use the global defaults.

## Environment Variables

See `.env.example` for all required vars. Key groups:

- `ANTHROPIC_API_KEY` — Claude API
- `GMAIL_USER` / `GMAIL_APP_PASSWORD` — SMTP for outbound email via Nodemailer
- `GMAIL_OAUTH_CLIENT_ID` / `GMAIL_OAUTH_CLIENT_SECRET` / `GMAIL_OAUTH_REFRESH_TOKEN` — Gmail REST API (inbox polling) **and** Google Drive uploads (both use the same OAuth2 credentials)
- `GOOGLE_DRIVE_FOLDER_ID` — target Drive folder
- `MANAGER_EMAIL` — default recipient for proposals generated from the Gmail path (Typeform path can override via the `manager_email` field ref)
- `TYPEFORM_WEBHOOK_SECRET` — HMAC signing secret from Typeform dashboard (optional; skipped with a warning if unset)

For Trigger.dev cloud, all env vars must be added via the Trigger.dev dashboard (not `.env`).

## Trigger.dev Config

`trigger.config.ts` sets project ID `proj_lghfijukkmrbxhcirmym`, scans `./src/trigger`, max task duration 300s, and exponential backoff retries (3 attempts, 3s–30s, randomized). Retries are disabled in dev mode.
