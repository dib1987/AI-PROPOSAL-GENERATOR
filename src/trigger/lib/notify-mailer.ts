import nodemailer from "nodemailer";
import type { ProposalDocument } from "../types";

interface SendProposalEmailParams {
  proposal: ProposalDocument;
  docxBuffer: Buffer;
  driveLink: string;
  fileName: string;
}

function buildTransport() {
  const user = process.env.SALES_TEAM_EMAIL;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("SALES_TEAM_EMAIL or GMAIL_APP_PASSWORD env vars are not set");
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

function buildHtml(proposal: ProposalDocument, driveLink: string): string {
  const { leadData } = proposal;

  const rows = [
    ["Prospect", leadData.prospectName],
    ["Company", leadData.companyName],
    ["Contact", leadData.contactEmail],
    ["Requirement", leadData.requirementDescription.slice(0, 200) + (leadData.requirementDescription.length > 200 ? "…" : "")],
    ["Timeline", leadData.timeline],
    ["Team Size", leadData.teamSize],
    ["Source", leadData.source === "typeform" ? "Web Form (Typeform)" : "Email (Gmail)"],
    ["Generated", new Date(proposal.generatedAt).toLocaleString()],
  ];

  const tableRows = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:8px 12px;font-weight:bold;background:#f5f5f5;width:160px;vertical-align:top;border-bottom:1px solid #eee;">${label}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${value}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#333;">

  <div style="background:#1a1a2e;color:white;padding:28px 24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;font-weight:bold;">New Proposal Generated</h1>
    <p style="margin:6px 0 0;opacity:0.7;font-size:14px;">AI Proposal Generator — Automated</p>
  </div>

  <div style="padding:24px;border:1px solid #eee;border-top:none;">
    <h2 style="color:#1a1a2e;font-size:16px;margin-top:0;">Lead Summary</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${tableRows}
    </table>
  </div>

  <div style="padding:20px 24px;border:1px solid #eee;border-top:none;text-align:center;">
    <a href="${driveLink}"
       style="display:inline-block;background:#0066cc;color:white;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">
      View Proposal on Google Drive
    </a>
    <p style="margin-top:12px;font-size:13px;color:#666;">
      The .docx file is also attached to this email for offline review.
    </p>
  </div>

  <div style="padding:16px 24px;border:1px solid #eee;border-top:none;">
    <h3 style="font-size:14px;color:#333;margin:0 0 8px;">Proposal Preview — Executive Summary</h3>
    <p style="font-size:13px;color:#555;line-height:1.6;margin:0;">
      ${proposal.sections.executiveSummary.slice(0, 400)}${proposal.sections.executiveSummary.length > 400 ? "…" : ""}
    </p>
  </div>

  <div style="background:#f5f5f5;padding:14px 24px;border-radius:0 0 8px 8px;text-align:center;font-size:12px;color:#999;">
    Generated automatically by AI Proposal Generator · ${new Date(proposal.generatedAt).toISOString()}
  </div>

</body>
</html>`;
}

export async function sendProposalEmail({
  proposal,
  docxBuffer,
  driveLink,
  fileName,
}: SendProposalEmailParams): Promise<void> {
  const { leadData } = proposal;
  const transport = buildTransport();

  const subject = `New Proposal Ready — ${leadData.companyName} (${leadData.prospectName})`;

  await transport.sendMail({
    from: `"AI Proposal Generator" <${process.env.SALES_TEAM_EMAIL}>`,
    to: leadData.managerEmail,
    subject,
    html: buildHtml(proposal, driveLink),
    attachments: [
      {
        filename: fileName,
        content: docxBuffer,
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ],
  });
}
