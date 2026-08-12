# AI Proposal Generator — Company Laptop Migration Guide

**Project:** AI Proposal Generator (Trigger.dev + Claude + Google Drive)  
**Author:** Dibyendu Mondal  
**Purpose:** Move working local build to company laptop and run a live demo  
**Date:** 2026-08-12

---

## Before You Start — Read This First

The pipeline has 5 external dependencies. Each one needs credentials or access to work:

| Dependency | What it does | Where credentials live |
|---|---|---|
| Anthropic API | Claude generates the proposal | `.env` → `ANTHROPIC_API_KEY` |
| Google OAuth2 | Gmail polling + Drive upload | `.env` → OAuth tokens |
| Gmail SMTP | Sends the proposal email | `.env` → App Password |
| Google Drive | Stores the `.docx` file | `.env` → `GOOGLE_DRIVE_FOLDER_ID` |
| Trigger.dev | Runs background tasks locally | `.env` → `TRIGGER_SECRET_KEY` |

You do not need cloud deployment for the demo. `npm run dev` runs everything locally.

---

## PART 1 — Pre-Migration Checklist (Do This Before Touching the Code)

### 1A — Verify Company Laptop Has Required Tools

Run these commands in PowerShell on the company laptop. Each must pass before you proceed.

```powershell
node -v          # Must return v18.x or higher
npm -v           # Must return 9.x or higher
git --version    # Any version is fine
```

**If Node.js is missing or below v18:**
- Download from https://nodejs.org (LTS version)
- If you cannot install globally (IT restriction): use `nvm-windows`
  - https://github.com/coreybutler/nvm-windows/releases
  - Install nvm-windows → `nvm install 20` → `nvm use 20`
  - No admin rights required for nvm-windows

**If Git is missing:**
- Request from IT or download from https://git-scm.com/download/win

---

### 1B — IT Access Request Checklist

Raise these with IT **before** migration day. Some may take 1-2 business days.

```
[ ] Outbound HTTPS to api.anthropic.com (port 443)
    Why: Claude API calls. Without this, proposal generation fails silently.

[ ] Outbound HTTPS to accounts.google.com (port 443)
    Why: Google OAuth2 token refresh. Without this, Gmail and Drive both fail.

[ ] Outbound HTTPS to www.googleapis.com (port 443)
    Why: Gmail REST API and Google Drive upload.

[ ] Outbound SMTP on port 587 (smtp.gmail.com)
    Why: Nodemailer sends the proposal email via Gmail SMTP.

[ ] Outbound HTTPS to cloud.trigger.dev (port 443)
    Why: Trigger.dev local dev worker registers with cloud for task routing.
         If this is blocked, use direct test scripts instead (see Part 6).

[ ] Permission to install npm packages from registry.npmjs.org
    Why: `npm install` downloads all dependencies on first run.

[ ] Permission to run local Node.js servers on PORT 3000
    Why: The webhook receiver runs on localhost:3000.
```

**How to phrase the IT request:**
> "I need outbound HTTPS access to api.anthropic.com, googleapis.com, accounts.google.com, and cloud.trigger.dev on port 443, and SMTP access on port 587 to smtp.gmail.com. This is for a local development tool — no inbound ports needed."

---

### 1C — Google Cloud Console Verification

Before leaving your personal laptop, confirm these are in place:

```
[ ] Google Cloud project exists and is active
[ ] OAuth 2.0 credentials (Client ID + Client Secret) are created
[ ] Authorized redirect URIs include: http://localhost:3000/oauth/callback
[ ] Gmail API is enabled on the project
[ ] Google Drive API is enabled on the project
[ ] Your Gmail address is added as a test user (if app is in "Testing" mode)
```

If the company email (`xyz@cognizant.com`) needs access, add it as a test user in the OAuth consent screen.

---

### 1D — Gmail Setup Verification (For Sending Email)

Gmail requires an App Password for SMTP (not your regular password):

```
[ ] 2-Step Verification is ON for the sending Gmail account
[ ] An App Password is generated: Google Account → Security → App Passwords
[ ] App Password is saved securely (you will need it in .env)
[ ] Gmail labels exist in the inbox: "proposal-leads" and "processed-proposal"
    (Only needed for the Gmail polling path — not required for Typeform demo)
```

---

## PART 2 — Secure Credentials Transfer

**Never email, Slack, or paste credentials in plain text.**

Use one of these methods to move your `.env` values to the company laptop:

| Method | How | Risk |
|---|---|---|
| Encrypted USB | Copy `.env` to USB, unlock on company laptop | Low — physical transfer |
| 1Password / Bitwarden | Store each value as a secure note, retrieve on company laptop | Low — encrypted vault |
| Company-approved secret manager | AWS Secrets Manager, Azure Key Vault if IT provides | Low — enterprise grade |
| Manual re-entry | Type each value fresh on company laptop | Zero transfer risk — tedious but safest |

**Do not use:** email, Teams/Slack DMs, OneDrive plaintext files, or GitHub (even private repos).

---

## PART 3 — Pull the Code on Company Laptop

### Option A — From GitHub (Recommended)

```powershell
git clone https://github.com/<your-username>/AI-PROPOSAL-GENERATOR.git
cd "AI-PROPOSAL-GENERATOR"
npm install
```

### Option B — Copy Without GitHub

1. On personal laptop: zip the project folder, **exclude `node_modules/`**
   ```powershell
   # Personal laptop
   Compress-Archive -Path "c:\Agentic Workflow\AI-PROPOSAL-GENERATOR" -DestinationPath "proposal-generator.zip" -CompressionLevel Optimal
   ```
2. Transfer via USB or encrypted file share
3. On company laptop:
   ```powershell
   Expand-Archive -Path "proposal-generator.zip" -DestinationPath "C:\Projects\"
   cd "C:\Projects\AI-PROPOSAL-GENERATOR"
   npm install
   ```

---

## PART 4 — Set Up Environment Variables

Create a `.env` file in the project root on the company laptop:

```powershell
# Navigate to project root
cd "C:\Projects\AI-PROPOSAL-GENERATOR"

# Create .env (do NOT commit this file — it's already in .gitignore)
New-Item -Name ".env" -ItemType File
```

Then open `.env` and fill in every value:

```env
# === Claude / Anthropic ===
ANTHROPIC_API_KEY=sk-ant-...

# === Gmail SMTP (for sending proposal emails) ===
SALES_TEAM_EMAIL=your-gmail@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx

# === Google OAuth2 (for Gmail polling + Drive upload) ===
GMAIL_OAUTH_CLIENT_ID=xxxxx.apps.googleusercontent.com
GMAIL_OAUTH_CLIENT_SECRET=GOCSPX-xxxxx
GMAIL_OAUTH_REFRESH_TOKEN=1//xxxxxx   # Re-generate this on company laptop (see Part 5)

# === Google Drive ===
GOOGLE_DRIVE_FOLDER_ID=1abc_your_folder_id_here

# === Proposal Config ===
MANAGER_EMAIL=your-email@gmail.com    # Use your own for demo — proposals land here
VENDOR_COMPANY_NAME=Cognizant QA Practice

# === Trigger.dev ===
TRIGGER_SECRET_KEY=tr_dev_xxxxx       # From cloud.trigger.dev dashboard

# === Webhook Receiver (optional for demo) ===
PORT=3000
```

---

## PART 5 — Re-Generate Gmail OAuth Token (Company Laptop)

The `GMAIL_OAUTH_REFRESH_TOKEN` is machine-bound in practice — regenerate it fresh on the company laptop.

```powershell
npm run setup:gmail-token
```

This will:
1. Open a browser window
2. Ask you to log in with the Gmail account used for polling/Drive
3. Ask you to approve the permissions
4. Print a new refresh token to the terminal
5. Copy that token into your `.env` as `GMAIL_OAUTH_REFRESH_TOKEN`

**If you get a "This app isn't verified" warning:** click "Advanced" → "Go to [app name] (unsafe)". This is expected for development OAuth apps.

---

## PART 6 — Smoke Test Each Layer (Run in Order)

Run these one at a time. Each must pass before the next.

```powershell
# Test 1: Claude API is reachable and extraction works
npm run test:extractor
# Expected: LeadData object printed to console with name, company, email, requirements

# Test 2: Claude generates a full proposal
npm run test:generator
# Expected: 10-section JSON printed to console (executiveSummary, scope, timeline, etc.)

# Test 3: .docx file builds correctly
npm run test:docx
# Expected: "test-output-proposal.docx" created in project root. Open it to verify.

# Test 4: Google Drive upload works
npm run test:drive
# Expected: File ID and shareable link printed. Check Google Drive folder.

# Test 5: Email sends with attachment
npm run test:mailer
# Expected: Email arrives at MANAGER_EMAIL with .docx attached and Drive link in body.
```

**If any test fails:** check the error message against the troubleshooting table below before continuing.

| Error | Likely Cause | Fix |
|---|---|---|
| `401 Unauthorized` on Anthropic | Wrong or missing API key | Check `ANTHROPIC_API_KEY` in `.env` |
| `invalid_grant` on Google | Stale refresh token | Re-run `npm run setup:gmail-token` |
| `ECONNREFUSED` or timeout | Network/firewall blocking the endpoint | Raise with IT (see Part 1B) |
| `ENOENT .env` | Missing `.env` file | Create it at project root |
| `Cannot find module` | `npm install` not run | Run `npm install` |
| Drive upload `403` | OAuth scope missing | Re-run token setup, approve Drive scope |

---

## PART 7 — Run the Demo

### Start the Local Worker

```powershell
npm run dev
```

You will see:
```
Trigger.dev v3 — local dev worker running
Registered tasks: typeform-webhook, gmail-poller, proposal-pipeline
```

Keep this terminal open during the demo.

---

### Demo Option A — End-to-End via Typeform (Most Impressive)

1. Open your Typeform form in a browser
2. Submit it with realistic demo data:
   - Prospect Name: `John Smith`
   - Company: `Retail Corp`
   - Contact Email: `john.smith@retailcorp.com`
   - Requirement: `We need end-to-end test automation for our e-commerce checkout flow`
   - Timeline: `3 months`
   - Team Size: `5 engineers`
3. Watch the terminal — pipeline logs will appear in real time
4. In ~30 seconds: check `MANAGER_EMAIL` inbox for the proposal email
5. Open the `.docx` attachment live

### Demo Option B — Direct Script (Safer, No Typeform Setup Needed)

```powershell
# Run the full generator with hardcoded demo input
npm run test:generator
# Then show the .docx
npm run test:docx
```

Open `test-output-proposal.docx` from the project root.

---

### What to Show During the Demo (Talking Points)

| Step | What you show | What you say |
|---|---|---|
| 1 | Input (Typeform or email) | "The pipeline starts the moment a lead comes in — no manual handoff." |
| 2 | Terminal logs — Claude extracting data | "Claude reads the raw input and structures it into a standard lead format." |
| 3 | Terminal logs — proposal being generated | "Claude then generates a 10-section proposal — scoped, priced, and professional." |
| 4 | Open the `.docx` | "This is the output. Ready to send in under a minute." |
| 5 | Google Drive folder | "It's automatically uploaded and shared. No manual saving." |
| 6 | Email inbox | "The manager gets notified immediately with the file attached." |

---

## PART 8 — Future: Replacing Trigger.dev for Enterprise Use

Trigger.dev works perfectly for the demo. For production at Cognizant, the equivalent options:

| If Cognizant uses | Replace Trigger.dev with | Effort |
|---|---|---|
| AWS | SQS + Lambda, or Step Functions | Medium |
| Azure | Service Bus + Azure Functions | Medium |
| On-prem / VPN-only | Bull/BullMQ + Redis (self-hosted) | Low |
| No infra preference | Keep Trigger.dev cloud (cheapest to start) | None |

The pipeline logic (`proposal-pipeline.ts`) does not change — only the task wrapper changes.

---

## Quick Reference — Key Files

| File | What it does |
|---|---|
| `src/trigger/tasks/proposal-pipeline.ts` | Core pipeline — Claude extract → generate → docx → Drive → email |
| `src/trigger/lib/email-extractor.ts` | Claude parses raw email into `LeadData` |
| `src/trigger/lib/proposal-generator.ts` | Claude generates 10-section proposal JSON |
| `src/trigger/lib/docx-builder.ts` | Builds `.docx` from proposal data |
| `src/trigger/lib/drive-uploader.ts` | Uploads to Google Drive via OAuth2 |
| `src/trigger/lib/notify-mailer.ts` | Sends email with `.docx` via Nodemailer |
| `src/trigger/types.ts` | All shared TypeScript interfaces |
| `.env` | All credentials — never commit this |
| `trigger.config.ts` | Task registration, retry config, project ID |

---

## Migration Day Checklist (Print This)

### Before You Leave Personal Laptop

```
[ ] All 5 smoke tests pass locally (extractor, generator, docx, drive, mailer)
[ ] .env values copied securely (encrypted USB or password manager)
[ ] GitHub repo is up to date (git push)
[ ] Google Cloud Console redirect URI includes http://localhost:3000/oauth/callback
[ ] Trigger.dev secret key noted from dashboard
```

### On Company Laptop

```
[ ] node -v returns 18 or higher
[ ] npm -v returns 9 or higher
[ ] git --version returns any version
[ ] IT access confirmed for api.anthropic.com, googleapis.com, smtp.gmail.com
[ ] Code pulled via git clone or unzipped
[ ] npm install completed with no errors
[ ] .env created with all values filled
[ ] npm run setup:gmail-token completed — new refresh token saved
[ ] npm run test:extractor passes
[ ] npm run test:generator passes
[ ] npm run test:docx passes — .docx file opens correctly
[ ] npm run test:drive passes — file visible in Google Drive folder
[ ] npm run test:mailer passes — email received with attachment
[ ] npm run dev starts with no errors — tasks registered
[ ] Demo run completed once before the real demo
```

---

*Document generated: 2026-08-12 | Project: AI Proposal Generator | Author: Dibyendu Mondal*
