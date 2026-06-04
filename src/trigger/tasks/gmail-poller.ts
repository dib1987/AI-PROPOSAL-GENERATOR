import { schedules, logger } from "@trigger.dev/sdk/v3";
import { google } from "googleapis";
import { extractLeadFromEmail } from "../lib/email-extractor";
import { proposalPipeline } from "./proposal-pipeline";
import type { RawEmailLead } from "../types";

const LABEL_INBOX = "proposal-leads";
const LABEL_PROCESSED = "processed-proposal";

function buildOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GMAIL_OAUTH_CLIENT_ID,
    process.env.GMAIL_OAUTH_CLIENT_SECRET
  );
  client.setCredentials({ refresh_token: process.env.GMAIL_OAUTH_REFRESH_TOKEN });
  return client;
}

function decodeBase64(encoded: string): string {
  return Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function extractBody(payload: any): string {
  if (!payload) return "";

  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return "";
}

async function getLabelId(gmail: any, labelName: string): Promise<string | null> {
  const res = await gmail.users.labels.list({ userId: "me" });
  const labels: any[] = res.data.labels ?? [];
  return labels.find((l) => l.name === labelName)?.id ?? null;
}

async function fetchUnreadLeads(gmail: any, labelId: string): Promise<RawEmailLead[]> {
  const res = await gmail.users.messages.list({
    userId: "me",
    labelIds: [labelId, "UNREAD"],
    maxResults: 20,
  });

  const messages: any[] = res.data.messages ?? [];
  if (messages.length === 0) return [];

  const leads: RawEmailLead[] = [];

  for (const msg of messages) {
    try {
      const full = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers: any[] = full.data.payload?.headers ?? [];
      const from = headers.find((h: any) => h.name === "From")?.value ?? "";
      const subject = headers.find((h: any) => h.name === "Subject")?.value ?? "(no subject)";
      const date = headers.find((h: any) => h.name === "Date")?.value ?? new Date().toISOString();
      const body = extractBody(full.data.payload);

      leads.push({
        messageId: msg.id,
        from,
        subject,
        body,
        receivedAt: new Date(date).toISOString(),
      });
    } catch (err) {
      logger.error("gmail-poller: failed to fetch message", {
        messageId: msg.id,
        error: (err as Error).message,
      });
    }
  }

  return leads;
}

async function markAsProcessed(
  gmail: any,
  messageId: string,
  processedLabelId: string
): Promise<void> {
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds: [processedLabelId],
      removeLabelIds: ["UNREAD"],
    },
  });
}

export const gmailPoller = schedules.task({
  id: "gmail-poller",
  cron: "*/15 * * * *", // every 15 minutes
  run: async (payload): Promise<{ processed: number; skipped: number }> => {
    logger.info("gmail-poller: starting run", { timestamp: payload.timestamp });

    const auth = buildOAuth2Client();
    const gmail = google.gmail({ version: "v1", auth });

    const inboxLabelId = await getLabelId(gmail, LABEL_INBOX);
    if (!inboxLabelId) {
      logger.error(
        `gmail-poller: required label "${LABEL_INBOX}" not found. ` +
        `Create it in Gmail: Settings > Labels > Create new label > "${LABEL_INBOX}". ` +
        `Then set up a Gmail filter (From: client domain → apply label "${LABEL_INBOX}") so incoming leads are picked up automatically.`
      );
      return { processed: 0, skipped: 0 };
    }

    let processedLabelId = await getLabelId(gmail, LABEL_PROCESSED);
    if (!processedLabelId) {
      logger.warn(
        `gmail-poller: label "${LABEL_PROCESSED}" not found — processed emails will only have UNREAD removed. ` +
        `Create it in Gmail to prevent re-processing: Settings > Labels > Create new label > "${LABEL_PROCESSED}".`
      );
    }

    const leads = await fetchUnreadLeads(gmail, inboxLabelId);
    logger.info("gmail-poller: unread leads found", { count: leads.length });

    let processed = 0;
    let skipped = 0;

    for (const lead of leads) {
      try {
        logger.info("gmail-poller: extracting lead data from email", {
          messageId: lead.messageId,
          from: lead.from,
          subject: lead.subject,
        });

        const leadData = await extractLeadFromEmail(lead);

        if (!leadData.requirementDescription || leadData.requirementDescription.trim().length < 10) {
          logger.warn("gmail-poller: requirement too short — skipping email", {
            messageId: lead.messageId,
          });
          skipped++;
          continue;
        }

        await proposalPipeline.trigger(leadData, {
          idempotencyKey: `gmail-${lead.messageId}`,
        });

        // Mark email as processed to prevent re-processing on next poll
        if (processedLabelId) {
          await markAsProcessed(gmail, lead.messageId, processedLabelId);
        } else {
          await gmail.users.messages.modify({
            userId: "me",
            id: lead.messageId,
            requestBody: { removeLabelIds: ["UNREAD"] },
          });
        }

        logger.info("gmail-poller: pipeline triggered", {
          idempotencyKey: `gmail-${lead.messageId}`,
        });

        processed++;
      } catch (err) {
        logger.error("gmail-poller: failed to process email", {
          messageId: lead.messageId,
          error: (err as Error).message,
        });
        skipped++;
      }
    }

    logger.info("gmail-poller: run complete", { processed, skipped });
    return { processed, skipped };
  },
});
