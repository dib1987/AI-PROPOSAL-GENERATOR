# AI Proposal Generator — Enterprise Architecture Guide (AWS + Microsoft 365)

**Project:** AI Proposal Generator  
**Author:** Dibyendu Mondal  
**Purpose:** Rewrite the pipeline from personal/local stack to company-grade AWS environment  
**Date:** 2026-08-12

---

## What Changes (Before vs. After)

| Component | Current (Personal/Local) | Company (Enterprise) |
|---|---|---|
| Job runner | Trigger.dev cloud | AWS Lambda + SQS |
| Email polling (lead intake) | Gmail OAuth2 + Gmail API | Microsoft Graph API (Outlook/M365) |
| Email sending | Nodemailer + Gmail SMTP | AWS SES or M365 SMTP relay |
| File storage | Google Drive (OAuth2) | AWS S3 (pre-signed URL) |
| Auth for email/polling | Google OAuth2 tokens | Azure AD app registration |
| Credentials storage | `.env` file | AWS Secrets Manager |
| Deployment | `npm run dev` locally | Lambda deploy via AWS CDK or SAM |
| Entry point (webhook) | Trigger.dev HTTP endpoint | AWS API Gateway → Lambda |

**What does NOT change:**
- Claude (Anthropic API) — same model, same prompt logic
- `.docx` builder — same `docx` npm package
- All pipeline logic in `proposal-pipeline.ts` — same flow, same steps
- TypeScript types in `types.ts` — same interfaces

---

## New Architecture Diagram

```
Company Outlook Inbox ──────► Microsoft Graph API (poll every 15 min)
                                         │
                                         ▼
                               AWS SQS Queue (lead-intake-queue)
                                         │
Typeform Webhook ──► API Gateway ────────┘
                                         │
                                         ▼
                               AWS Lambda (proposal-pipeline)
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                     ▼
             Claude API          AWS S3 (docx file)    AWS SES / M365 SMTP
          (extract + generate)   (pre-signed URL)       (email to manager)
```

---

## PART 1 — AWS Setup Requirements

### 1A — AWS Services to Provision

These need to exist before any code is deployed. Raise with your AWS admin or DevOps team.

```
[ ] AWS SQS Queue
    Name: lead-intake-queue (or your naming convention)
    Type: Standard queue (not FIFO — ordering not required here)
    Visibility timeout: 5 minutes (matches Lambda max duration)
    Why: Decouples lead intake from processing. If Lambda fails, SQS retries automatically.

[ ] AWS Lambda Function
    Name: proposal-pipeline-handler
    Runtime: Node.js 20.x
    Memory: 512 MB minimum (Claude responses can be large)
    Timeout: 5 minutes (300 seconds — same as current Trigger.dev config)
    Trigger: SQS (lead-intake-queue)
    Why: Replaces Trigger.dev task execution. SQS → Lambda is the standard AWS pattern.

[ ] AWS API Gateway (HTTP API)
    Endpoint: POST /webhook/typeform
    Integration: Lambda (typeform-handler function)
    Why: Replaces Trigger.dev HTTP endpoint. Typeform sends webhooks here.

[ ] AWS S3 Bucket
    Name: proposal-documents-[env] (e.g., proposal-documents-prod)
    Access: Private (no public access)
    Pre-signed URL expiry: 7 days
    Why: Replaces Google Drive. Manager gets a pre-signed URL in the email.

[ ] AWS Secrets Manager
    Secrets to store: ANTHROPIC_API_KEY, AZURE_CLIENT_SECRET, email credentials
    Why: Replaces .env file. Lambda reads secrets at runtime — nothing hardcoded.

[ ] AWS IAM Role for Lambda
    Permissions needed:
      - sqs:ReceiveMessage, sqs:DeleteMessage (read from queue)
      - s3:PutObject, s3:GetObject (upload + generate pre-signed URL)
      - secretsmanager:GetSecretValue (read credentials)
      - ses:SendRawEmail (if using SES for outbound email)
    Why: Lambda must have explicit permission for every AWS service it touches.
```

---

### 1B — IT Access Request Checklist

Raise these with IT before writing any code. Some need security team approval.

```
[ ] Microsoft Azure AD — App Registration
    Why: Needed to call Microsoft Graph API for Outlook inbox polling.
    What to request: A new Azure AD App Registration with these API permissions:
      - Mail.Read (read Outlook inbox)
      - Mail.ReadWrite (mark emails as processed)
    Auth type: Client credentials (client ID + client secret, no user login required)
    Who approves: Azure AD admin / IT security team

[ ] Microsoft Graph API access approved for the app registration
    Endpoint: https://graph.microsoft.com/v1.0/me/messages
    Why: Lambda polls this to read incoming proposal request emails.

[ ] AWS SES — domain/email verification
    What: Verify the organization sending email address (e.g., sales@cognizant.com)
    Why: SES will not send from an unverified address.
    Who approves: AWS account admin + email domain owner

[ ] OR: Microsoft 365 SMTP relay approved
    Endpoint: smtp.office365.com:587
    Why: Alternative to SES. Uses existing M365 infrastructure.
    What to request: An app password or service account for SMTP relay

[ ] Outbound HTTPS from Lambda to api.anthropic.com (port 443)
    Why: Claude API calls. Lambda needs internet access (attach to VPC with NAT Gateway,
         or use Lambda without VPC for simpler outbound access).

[ ] S3 bucket created in the correct AWS account and region
    Why: Must be in the same region as Lambda to avoid cross-region data transfer costs.

[ ] Lambda allowed to run up to 300 seconds (5 minutes)
    Why: Default Lambda timeout is 3 seconds — must be increased for this pipeline.
```

---

## PART 2 — Microsoft Graph API Setup (Replaces Gmail OAuth)

This replaces `gmail-poller.ts` and the Gmail OAuth2 credentials.

### Step 1 — Register an Azure AD App

An IT admin does this in the Azure Portal:

1. Go to **Azure Active Directory → App registrations → New registration**
2. Name: `proposal-pipeline-poller`
3. Account type: Single tenant (your org only)
4. No redirect URI needed (daemon app, no user login)
5. After creation, note:
   - **Application (client) ID** → `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_TENANT_ID`

### Step 2 — Add API Permissions

In the app registration → API permissions:
- Add `Microsoft Graph` → `Application permissions` (not delegated):
  - `Mail.Read`
  - `Mail.ReadWrite`
- Click **Grant admin consent** (requires Azure AD admin)

### Step 3 — Create a Client Secret

In the app registration → Certificates & secrets → New client secret:
- Expiry: 12 months (set a calendar reminder to rotate)
- Copy the secret value → `AZURE_CLIENT_SECRET`

### Step 4 — Get the Mailbox to Poll

The app will read a specific mailbox — this is the company email address where proposal requests arrive (e.g., `proposals@cognizant.com` or `sales@cognizant.com`).

```
[ ] Confirm which inbox receives proposal request emails
[ ] Add that email address to your config as POLLING_MAILBOX
[ ] Confirm the mailbox owner consents to programmatic access
```

---

## PART 3 — Code Changes Required

### 3A — Replace `gmail-poller.ts` with Outlook poller

**File to replace:** `src/trigger/tasks/gmail-poller.ts`

The new version calls Microsoft Graph instead of Gmail API.

```typescript
// NEW: src/lambda/outlook-poller.ts
// Runs on a CloudWatch Events schedule (every 15 min) — replaces gmail-poller schedules.task()

import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import { TokenCredentialAuthenticationProvider } from
  "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import { sendToQueue } from "./sqs-client";

export async function pollOutlookInbox() {
  const credential = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID!,
    process.env.AZURE_CLIENT_ID!,
    process.env.AZURE_CLIENT_SECRET!
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"]
  });

  const client = Client.initWithMiddleware({ authProvider });
  const mailbox = process.env.POLLING_MAILBOX!;

  // Read unread emails from the target folder
  const messages = await client
    .api(`/users/${mailbox}/mailFolders/Inbox/messages`)
    .filter("isRead eq false and subject eq 'Proposal Request'")
    .top(20)
    .get();

  for (const message of messages.value) {
    // Push to SQS for processing
    await sendToQueue({
      source: "outlook",
      messageId: message.id,
      from: message.from.emailAddress.address,
      subject: message.subject,
      body: message.body.content,
    });

    // Mark as read to prevent reprocessing
    await client
      .api(`/users/${mailbox}/messages/${message.id}`)
      .patch({ isRead: true });
  }
}
```

**New npm packages needed:**
```powershell
npm install @microsoft/microsoft-graph-client @azure/identity
```

---

### 3B — Replace Drive uploader with S3 uploader

**File to replace:** `src/trigger/lib/drive-uploader.ts`

```typescript
// NEW: src/lib/s3-uploader.ts

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({ region: process.env.AWS_REGION! });

export async function uploadToS3(
  buffer: Buffer,
  fileName: string
): Promise<{ key: string; shareableLink: string }> {
  const bucket = process.env.S3_BUCKET_NAME!;
  const key = `proposals/${new Date().toISOString().split("T")[0]}/${fileName}`;

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }));

  // Pre-signed URL valid for 7 days
  const shareableLink = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 604800 }
  );

  return { key, shareableLink };
}
```

**New npm packages needed:**
```powershell
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

---

### 3C — Replace Nodemailer with AWS SES (or M365 SMTP relay)

**File to replace:** `src/trigger/lib/notify-mailer.ts`

**Option A — AWS SES (recommended if using AWS):**

```typescript
// NEW: src/lib/ses-mailer.ts

import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import * as nodemailer from "nodemailer";

const ses = new SESClient({ region: process.env.AWS_REGION! });

export async function sendProposalEmail(params: {
  to: string;
  docxBuffer: Buffer;
  fileName: string;
  driveLink: string;
  companyName: string;
}) {
  // Use nodemailer to build the MIME message, then send via SES
  const transporter = nodemailer.createTransport({
    SES: { ses, aws: { SendRawEmailCommand } }
  });

  await transporter.sendMail({
    from: process.env.SALES_TEAM_EMAIL!,
    to: params.to,
    subject: `Proposal Ready: ${params.companyName}`,
    html: `<p>Please find the proposal attached and available at: <a href="${params.driveLink}">Download Proposal</a></p>`,
    attachments: [{
      filename: params.fileName,
      content: params.docxBuffer,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }]
  });
}
```

**Option B — Microsoft 365 SMTP relay (if SES is not available):**

```typescript
// Change only the transporter config — everything else stays the same
const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.M365_SMTP_USER!,       // e.g., sales@cognizant.com
    pass: process.env.M365_SMTP_PASSWORD!    // App password from M365 admin
  }
});
```

**New npm packages needed (Option A only):**
```powershell
npm install @aws-sdk/client-ses nodemailer-ses-transport
```

---

### 3D — Replace Trigger.dev task wrapper with Lambda handler

**File to replace:** `src/trigger/tasks/proposal-pipeline.ts`

```typescript
// NEW: src/lambda/proposal-pipeline-handler.ts
// This is the Lambda entry point. SQS triggers it with one message per invocation.

import { SQSEvent } from "aws-lambda";
import { extractEmailData } from "../lib/email-extractor";
import { generateProposal } from "../lib/proposal-generator";
import { buildDocx } from "../lib/docx-builder";
import { uploadToS3 } from "../lib/s3-uploader";
import { sendProposalEmail } from "../lib/ses-mailer";

export async function handler(event: SQSEvent) {
  for (const record of event.Records) {
    const lead = JSON.parse(record.body);

    const leadData = await extractEmailData(lead.body, lead.from);
    const proposal = await generateProposal(leadData);
    const docxBuffer = await buildDocx({ lead: leadData, proposal });

    const fileName = `${leadData.company_name.replace(/\s+/g, "-")}-proposal.docx`;
    const { shareableLink } = await uploadToS3(docxBuffer, fileName);

    await sendProposalEmail({
      to: leadData.manager_email || process.env.MANAGER_EMAIL!,
      docxBuffer,
      fileName,
      driveLink: shareableLink,
      companyName: leadData.company_name,
    });
  }
}
```

---

## PART 4 — Environment Variables (Updated)

Replace the personal `.env` with these values in **AWS Secrets Manager** (Lambda reads them at runtime).

```
# === Claude / Anthropic ===
ANTHROPIC_API_KEY

# === Microsoft Graph API (Outlook polling) ===
AZURE_TENANT_ID          # From Azure AD app registration
AZURE_CLIENT_ID          # From Azure AD app registration
AZURE_CLIENT_SECRET      # From Azure AD app registration → Certificates & secrets
POLLING_MAILBOX          # e.g., proposals@cognizant.com

# === Email Sending ===
SALES_TEAM_EMAIL         # e.g., sales@cognizant.com (verified in SES or M365)

# Option A: AWS SES (no extra credential — Lambda IAM role handles auth)
# Option B: Microsoft 365 SMTP relay
M365_SMTP_USER           # e.g., sales@cognizant.com
M365_SMTP_PASSWORD       # App password from M365 admin

# === AWS S3 ===
S3_BUCKET_NAME           # e.g., proposal-documents-prod
AWS_REGION               # e.g., ap-south-1 (Mumbai) or us-east-1

# === Proposal Config ===
MANAGER_EMAIL            # e.g., manager@cognizant.com (default recipient)
VENDOR_COMPANY_NAME      # e.g., Cognizant QA Practice

# === Typeform (if still using Typeform for lead intake) ===
TYPEFORM_WEBHOOK_SECRET  # HMAC secret from Typeform dashboard
```

**What is removed entirely (not needed in enterprise):**
```
GMAIL_APP_PASSWORD         # Replaced by SES or M365 SMTP
GMAIL_OAUTH_CLIENT_ID      # Replaced by Azure AD
GMAIL_OAUTH_CLIENT_SECRET  # Replaced by Azure AD
GMAIL_OAUTH_REFRESH_TOKEN  # Replaced by Azure AD client credentials
GOOGLE_DRIVE_FOLDER_ID     # Replaced by S3
TRIGGER_SECRET_KEY         # Trigger.dev removed
PORT                       # Webhook server replaced by API Gateway
```

---

## PART 5 — Deployment (Lambda + SQS)

### Option A — AWS SAM (Recommended for first deploy)

```yaml
# template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  LeadIntakeQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: lead-intake-queue
      VisibilityTimeout: 300

  ProposalPipelineFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: dist/lambda/proposal-pipeline-handler.handler
      Runtime: nodejs20.x
      Timeout: 300
      MemorySize: 512
      Events:
        SQSTrigger:
          Type: SQS
          Properties:
            Queue: !GetAtt LeadIntakeQueue.Arn
            BatchSize: 1
      Environment:
        Variables:
          S3_BUCKET_NAME: !Ref ProposalDocumentsBucket
          AWS_REGION: !Ref AWS::Region

  TypeformWebhookFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: dist/lambda/typeform-handler.handler
      Runtime: nodejs20.x
      Timeout: 30
      Events:
        WebhookAPI:
          Type: HttpApi
          Properties:
            Path: /webhook/typeform
            Method: POST

  ProposalDocumentsBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: proposal-documents-prod
```

Deploy:
```powershell
sam build
sam deploy --guided
```

### Option B — AWS CDK (if your team uses CDK)

```typescript
// cdk/proposal-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

export class ProposalStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string) {
    super(scope, id);

    const queue = new sqs.Queue(this, 'LeadIntakeQueue', {
      visibilityTimeout: cdk.Duration.seconds(300),
    });

    const bucket = new s3.Bucket(this, 'ProposalDocuments');

    const pipelineFn = new lambda.Function(this, 'ProposalPipeline', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'dist/lambda/proposal-pipeline-handler.handler',
      code: lambda.Code.fromAsset('dist'),
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
    });

    pipelineFn.addEventSource(new SqsEventSource(queue, { batchSize: 1 }));
    bucket.grantReadWrite(pipelineFn);
    queue.grantConsumeMessages(pipelineFn);
  }
}
```

---

## PART 6 — Migration Checklist (Print This)

### Approvals to Get (Do This First)

```
[ ] Azure AD app registration approved by IT/Azure admin
[ ] Graph API permissions granted (Mail.Read, Mail.ReadWrite)
[ ] Confirmed which mailbox receives proposal requests
[ ] AWS SES domain verified for SALES_TEAM_EMAIL
    OR M365 SMTP relay approved for service account
[ ] S3 bucket created in correct account and region
[ ] Lambda IAM role created with SQS, S3, SES permissions
[ ] API Gateway endpoint created for Typeform webhook
[ ] AWS Secrets Manager entries created for all credentials
[ ] Lambda internet access confirmed (NAT Gateway or no-VPC config)
[ ] Typeform webhook URL updated to new API Gateway endpoint
```

### Code Changes to Make

```
[ ] Replace gmail-poller.ts with outlook-poller.ts (Microsoft Graph API)
[ ] Replace drive-uploader.ts with s3-uploader.ts (AWS S3)
[ ] Replace notify-mailer.ts with ses-mailer.ts or m365-mailer.ts
[ ] Create Lambda handler (proposal-pipeline-handler.ts)
[ ] Create Lambda handler (typeform-handler.ts)
[ ] Create SQS client utility (sqs-client.ts)
[ ] Update package.json — add AWS SDK packages, remove Google packages
[ ] Update tsconfig.json if needed for Lambda target
[ ] Create SAM template or CDK stack
[ ] Test locally using AWS SAM Local before deploying
```

### Testing Before Go-Live

```
[ ] sam local invoke ProposalPipelineFunction with test event
[ ] Send test email to polling mailbox — confirm it's picked up
[ ] Confirm .docx appears in S3 bucket after pipeline run
[ ] Confirm pre-signed URL works and opens the document
[ ] Confirm manager email received with attachment
[ ] Typeform submission → API Gateway → SQS → Lambda → email (end-to-end)
[ ] CloudWatch Logs show no errors for a full run
```

---

## PART 7 — Demo Script (Enterprise Version)

### What to Show

| Step | What you show | What you say |
|---|---|---|
| 1 | Company Outlook inbox with a proposal request email | "A sales lead arrives in the team inbox." |
| 2 | CloudWatch Logs — Lambda invoked | "AWS Lambda picks it up automatically. No manual trigger." |
| 3 | Claude extraction in logs | "Claude reads the email and extracts structured lead data." |
| 4 | Claude generation in logs | "Claude generates a full 10-section proposal — scoped to this client." |
| 5 | S3 bucket — .docx file uploaded | "The proposal is stored in S3 with a 7-day secure link." |
| 6 | Manager email received | "The manager gets notified instantly with the proposal attached." |
| 7 | Open the .docx | "This is ready to send to the client. Total time: under 60 seconds." |

---

## Decision Log

| Decision | Choice | Reason |
|---|---|---|
| Job runner | Lambda + SQS | Event-driven, no server to manage, scales automatically, direct Trigger.dev equivalent |
| Email polling | Microsoft Graph API | Cognizant runs M365 — no Gmail allowed in enterprise |
| Email sending | AWS SES (primary) | AWS-native, cheapest at scale, no SMTP server to manage |
| Email sending | M365 SMTP relay (fallback) | If SES not approved, stays within existing M365 infra |
| File storage | AWS S3 + pre-signed URL | Replaces Google Drive, stays in AWS, pre-signed URL is more secure than shareable link |
| Credentials | AWS Secrets Manager | Replaces .env file, Lambda reads at runtime, no secrets in code |
| Infra-as-code | AWS SAM (recommended) or CDK | SAM is simpler for first deploy; CDK if team already uses it |

---

*Document generated: 2026-08-12 | Project: AI Proposal Generator Enterprise | Author: Dibyendu Mondal*
