/**
 * Tests proposal-generator.ts in isolation.
 * Run: npx ts-node src/scripts/test-generator.ts
 */
import * as dotenv from "dotenv";
dotenv.config();

import { generateProposal } from "../trigger/lib/proposal-generator";
import type { LeadData } from "../trigger/types";

// Simulates a Gmail-path lead where many fields are "Not specified"
const sampleLead: LeadData = {
  source: "gmail",
  sourceId: "test-msg-001",
  receivedAt: new Date().toISOString(),
  prospectName: "Not specified",
  companyName: "Not specified",
  contactEmail: "prospect@company.com",
  requirementDescription:
    "We want to automate all the tech debt across all the projects. This includes legacy code cleanup, dependency upgrades, CI/CD improvements, and automated test coverage.",
  timeline: "3 months",
  teamSize: "Not specified",
  managerEmail: process.env.MANAGER_EMAIL ?? "test@example.com",
};

async function main() {
  console.log("Testing proposal-generator...\n");
  const proposal = await generateProposal(sampleLead);

  const sectionKeys = Object.keys(proposal.sections) as (keyof typeof proposal.sections)[];
  console.log(`Sections generated: ${sectionKeys.length}/10`);
  console.log(`Generated at: ${proposal.generatedAt}\n`);

  for (const key of sectionKeys) {
    const content = proposal.sections[key];
    console.log(`[${key}] — ${content.length} chars`);
    if (content.length < 50) {
      console.warn(`  WARNING: suspiciously short content`);
    }
  }

  console.log("\n--- Executive Summary Preview ---");
  console.log(proposal.sections.executiveSummary.slice(0, 400));

  if (sectionKeys.length === 10) {
    console.log("\nAll 10 sections present — generator passed.");
  } else {
    console.error(`\nFAIL: only ${sectionKeys.length} sections returned.`);
  }
}

main().catch(console.error);
