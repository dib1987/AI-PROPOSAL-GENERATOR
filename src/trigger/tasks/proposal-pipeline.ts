import { task, logger } from "@trigger.dev/sdk/v3";
import type { LeadData, PipelineResult, StepResult } from "../types";
import { generateProposal } from "../lib/proposal-generator";
import { buildDocx } from "../lib/docx-builder";
import { uploadToDrive } from "../lib/drive-uploader";
import { sendProposalEmail } from "../lib/notify-mailer";

export const proposalPipeline = task({
  id: "proposal-pipeline",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 3000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: LeadData): Promise<PipelineResult> => {
    const steps: StepResult[] = [];

    logger.info("proposal-pipeline: started", {
      source: payload.source,
      sourceId: payload.sourceId,
      prospect: payload.prospectName,
      company: payload.companyName,
    });

    // ── STEP 1: Validate ──────────────────────────────────────────────────────
    logger.info("proposal-pipeline: step 1 — validating payload");

    if (!payload.requirementDescription || payload.requirementDescription.trim().length < 10) {
      const detail = "requirementDescription is missing or too short — cannot generate a meaningful proposal";
      logger.error("proposal-pipeline: validation failed", { detail });
      steps.push({ step: "validate", status: "failed", detail });
      return { success: false, steps, error: detail };
    }

    if (!payload.managerEmail || !payload.managerEmail.includes("@")) {
      const detail = "managerEmail is missing or invalid — cannot deliver the proposal";
      logger.error("proposal-pipeline: validation failed", { detail });
      steps.push({ step: "validate", status: "failed", detail });
      return { success: false, steps, error: detail };
    }

    steps.push({ step: "validate", status: "success", detail: "All required fields present" });
    logger.info("proposal-pipeline: validation passed");

    // ── STEP 2: Generate proposal via Claude ──────────────────────────────────
    logger.info("proposal-pipeline: step 2 — generating proposal via Claude API");

    let proposal;
    try {
      proposal = await generateProposal(payload);
      const sectionCount = Object.keys(proposal.sections).length;
      steps.push({ step: "generate", status: "success", detail: `${sectionCount} sections generated` });
      logger.info("proposal-pipeline: proposal generated", { sections: sectionCount });
    } catch (err) {
      const detail = `Claude generation failed: ${(err as Error).message}`;
      logger.error("proposal-pipeline: generation error", { detail });
      steps.push({ step: "generate", status: "failed", detail });
      return { success: false, steps, error: detail };
    }

    // ── STEP 3: Build .docx ───────────────────────────────────────────────────
    logger.info("proposal-pipeline: step 3 — building .docx file");

    let docxBuffer: Buffer;
    try {
      docxBuffer = await buildDocx(proposal);
      steps.push({ step: "build-docx", status: "success", detail: `${docxBuffer.byteLength} bytes` });
      logger.info("proposal-pipeline: docx built", { bytes: docxBuffer.byteLength });
    } catch (err) {
      const detail = `DOCX build failed: ${(err as Error).message}`;
      logger.error("proposal-pipeline: docx error", { detail });
      steps.push({ step: "build-docx", status: "failed", detail });
      return { success: false, steps, error: detail };
    }

    // ── STEP 4: Upload to Google Drive ────────────────────────────────────────
    logger.info("proposal-pipeline: step 4 — uploading to Google Drive");

    let driveLink: string;
    let fileId: string;
    const safeCompany = payload.companyName.replace(/[^a-zA-Z0-9]/g, "_");
    const dateStr = new Date().toISOString().split("T")[0];
    const fileName = `Proposal_${safeCompany}_${dateStr}.docx`;

    try {
      ({ fileId, shareableLink: driveLink } = await uploadToDrive(docxBuffer, fileName));
      steps.push({ step: "upload-drive", status: "success", detail: `File ID: ${fileId}` });
      logger.info("proposal-pipeline: uploaded to Drive", { fileId, driveLink });
    } catch (err) {
      const detail = `Drive upload failed: ${(err as Error).message}`;
      logger.error("proposal-pipeline: drive error", { detail });
      steps.push({ step: "upload-drive", status: "failed", detail });
      return { success: false, steps, error: detail };
    }

    // ── STEP 5: Send email to manager ─────────────────────────────────────────
    logger.info("proposal-pipeline: step 5 — sending email to manager", {
      to: payload.managerEmail,
    });

    try {
      await sendProposalEmail({ proposal, docxBuffer, driveLink, fileName });
      steps.push({ step: "send-email", status: "success", detail: `Sent to ${payload.managerEmail}` });
      logger.info("proposal-pipeline: email sent", { to: payload.managerEmail });
    } catch (err) {
      // Email failure is non-fatal — Drive upload already succeeded
      const detail = `Email send failed: ${(err as Error).message}`;
      logger.error("proposal-pipeline: email error", { detail });
      steps.push({ step: "send-email", status: "failed", detail });
      return { success: true, steps, driveLink, emailSent: false, error: detail };
    }

    logger.info("proposal-pipeline: all steps complete", {
      driveLink,
      source: payload.source,
      prospect: payload.prospectName,
    });

    return { success: true, steps, driveLink, emailSent: true };
  },
});
