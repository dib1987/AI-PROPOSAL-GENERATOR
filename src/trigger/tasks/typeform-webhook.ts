import { task, logger } from "@trigger.dev/sdk/v3";
import { createHmac } from "node:crypto";
import type { TypeformWebhookPayload, TypeformAnswer, LeadData } from "../types";
import { proposalPipeline } from "./proposal-pipeline";

// Maps Typeform answer field refs to LeadData fields.
// Update these refs to match the field references you set in your Typeform.
const FIELD_REFS: Record<string, keyof Pick<LeadData,
  "prospectName" | "companyName" | "contactEmail" |
  "requirementDescription" | "timeline" | "teamSize" | "managerEmail"
>> = {
  prospect_name: "prospectName",
  company_name: "companyName",
  contact_email: "contactEmail",
  requirement_description: "requirementDescription",
  timeline: "timeline",
  team_size: "teamSize",
  manager_email: "managerEmail",
};

function extractValue(answer: TypeformAnswer): string {
  if (answer.text !== undefined) return answer.text;
  if (answer.email !== undefined) return answer.email;
  if (answer.number !== undefined) return String(answer.number);
  if (answer.choice?.label !== undefined) return answer.choice.label;
  return "Not specified";
}

function mapAnswersToLeadData(
  answers: TypeformAnswer[],
  token: string,
  submittedAt: string
): LeadData {
  const mapped: Partial<LeadData> = {
    source: "typeform",
    sourceId: token,
    receivedAt: submittedAt,
    prospectName: "Not specified",
    companyName: "Not specified",
    contactEmail: "Not specified",
    requirementDescription: "",
    timeline: "Not specified",
    teamSize: "Not specified",
    managerEmail: process.env.MANAGER_EMAIL ?? "",
  };

  for (const answer of answers) {
    const ref = answer.field.ref;
    const field = FIELD_REFS[ref];
    if (field) {
      mapped[field] = extractValue(answer);
    }
  }

  return mapped as LeadData;
}

export const typeformWebhook = task({
  id: "typeform-webhook",
  run: async (payload: {
    headers: Record<string, string>;
    body: TypeformWebhookPayload;
  }): Promise<{ queued: boolean; token?: string; error?: string }> => {

    logger.info("typeform-webhook: received payload", {
      eventType: payload.body.event_type,
      formId: payload.body.form_response?.form_id,
    });

    // ── Validate HMAC signature ───────────────────────────────────────────────
    const secret = process.env.TYPEFORM_WEBHOOK_SECRET;
    if (secret) {
      const sig = payload.headers["typeform-signature"] ?? "";
      const expected =
        "sha256=" +
        createHmac("sha256", secret)
          .update(JSON.stringify(payload.body))
          .digest("base64");

      if (sig !== expected) {
        logger.warn("typeform-webhook: invalid HMAC signature — rejecting request");
        return { queued: false, error: "Invalid webhook signature" };
      }
      logger.info("typeform-webhook: HMAC signature valid");
    } else {
      logger.warn("typeform-webhook: TYPEFORM_WEBHOOK_SECRET not set — skipping signature check");
    }

    const { token, submitted_at, answers } = payload.body.form_response;

    // ── Map to LeadData ───────────────────────────────────────────────────────
    const leadData = mapAnswersToLeadData(answers, token, submitted_at);

    logger.info("typeform-webhook: mapped lead data", {
      prospectName: leadData.prospectName,
      companyName: leadData.companyName,
      timeline: leadData.timeline,
      requirementLength: leadData.requirementDescription.length,
    });

    // ── Trigger pipeline ──────────────────────────────────────────────────────
    await proposalPipeline.trigger(leadData, {
      idempotencyKey: `typeform-${token}`,
    });

    logger.info("typeform-webhook: pipeline triggered", { idempotencyKey: `typeform-${token}` });

    return { queued: true, token };
  },
});
