/**
 * Tests email-extractor.ts in isolation.
 * Run: npx ts-node src/scripts/test-extractor.ts
 */
import * as dotenv from "dotenv";
dotenv.config();

import { extractLeadFromEmail } from "../trigger/lib/email-extractor";
import type { RawEmailLead } from "../trigger/types";

const sampleEmail: RawEmailLead = {
  messageId: "test-msg-001",
  from: "john.smith@acmecorp.com",
  subject: "Request for proposal — tech debt automation",
  receivedAt: new Date().toISOString(),
  body: `Hi,

We are looking for a technology partner to help us automate all the tech debt across all our projects.
This includes legacy code cleanup, updating outdated dependencies, improving our CI/CD pipelines,
and establishing proper automated test coverage.

We have around 12 engineers on the team. We would ideally like this completed within 3 months.

Please let us know your availability and rates.

Best regards,
John Smith
Head of Engineering
Acme Corp`,
};

async function main() {
  console.log("Testing email-extractor...\n");
  const result = await extractLeadFromEmail(sampleEmail);
  console.log("Extracted LeadData:");
  console.log(JSON.stringify(result, null, 2));

  // Verify no "undefined" or empty strings slipped through
  const issues = Object.entries(result).filter(([, v]) => !v || v === "");
  if (issues.length > 0) {
    console.error("\nWARNING — empty or undefined fields:", issues.map(([k]) => k));
  } else {
    console.log("\nAll fields present — extraction passed.");
  }
}

main().catch(console.error);
