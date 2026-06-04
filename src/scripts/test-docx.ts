/**
 * Tests docx-builder.ts in isolation. Writes output to disk so you can open it in Word.
 * Run: npx ts-node src/scripts/test-docx.ts
 */
import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "node:fs";
import * as path from "node:path";
import { buildDocx } from "../trigger/lib/docx-builder";
import type { ProposalDocument } from "../trigger/types";

const sampleProposal: ProposalDocument = {
  leadData: {
    source: "typeform",
    sourceId: "test-typeform-001",
    receivedAt: new Date().toISOString(),
    prospectName: "John Smith",
    companyName: "Acme Corp",
    contactEmail: "john@acmecorp.com",
    requirementDescription:
      "We want to automate all the tech debt across all our projects, including legacy code cleanup, dependency upgrades, CI/CD improvements, and automated test coverage.",
    timeline: "3 months",
    teamSize: "12 engineers",
    managerEmail: process.env.MANAGER_EMAIL ?? "test@example.com",
  },
  generatedAt: new Date().toISOString(),
  sections: {
    executiveSummary:
      "This proposal outlines our approach to systematically eliminating technical debt across Acme Corp's project portfolio. By combining automated tooling, structured refactoring sprints, and improved CI/CD practices, we will reduce maintenance overhead and improve delivery velocity within a 3-month engagement.",
    requirementsUnderstanding:
      "Acme Corp seeks a partner to address accumulated technical debt across multiple software projects. The core challenges include legacy code that is difficult to maintain, outdated dependencies with security risks, inconsistent CI/CD pipelines, and insufficient automated test coverage. The team of 12 engineers needs to continue delivering features while this remediation takes place.",
    proposedSolution:
      "We propose a phased approach: Phase 1 (Month 1) — audit and prioritize tech debt by risk and impact. Phase 2 (Month 2) — implement automated tooling for dependency management, linting, and test scaffolding. Phase 3 (Month 3) — refactor critical paths, harden CI/CD pipelines, and establish ongoing debt prevention practices.",
    projectTimeline:
      "Month 1: Codebase audit, risk matrix, tooling setup.\nMonth 2: Automated dependency updates, test coverage baseline, CI/CD standardization.\nMonth 3: Critical refactoring, pipeline hardening, documentation, and handover.",
    teamAndResources:
      "Our engagement team consists of a Lead Engineer, a DevOps Specialist, and a QA Automation Engineer. We will work alongside your 12 engineers in weekly sprint reviews and maintain a shared Jira board for full visibility.",
    investmentPricing:
      "Fixed-price engagement: $28,000 for the 3-month project.\nPayment schedule: 40% on kick-off, 30% at Month 2 milestone, 30% on completion.\nIncludes all tooling licenses, documentation, and a 30-day post-engagement support window.",
    whyUs:
      "We have delivered tech debt reduction programs for over 20 engineering teams in the past 3 years. Our structured methodology consistently reduces bug rates by 40% and deployment frequency by 60% within the engagement period. We work inside your existing workflows — no new tools forced on your team.",
    deliverables:
      "1. Tech debt audit report with prioritized backlog.\n2. Automated dependency management setup.\n3. CI/CD pipeline standardization across all projects.\n4. Automated test coverage raised to minimum 70% on critical paths.\n5. Developer playbook for ongoing debt prevention.\n6. Final retrospective and handover session.",
    nextSteps:
      "1. Review this proposal and confirm scope alignment.\n2. Schedule a 30-minute kick-off call to meet the team and confirm access.\n3. Sign the engagement agreement and process the first payment.\n4. Begin Month 1 audit within 5 business days of agreement.",
    termsAndConditions:
      "This proposal is valid for 14 days from the date of issue. Work begins within 5 business days of signed agreement and first payment receipt. All intellectual property created during the engagement is transferred to Acme Corp on final payment. Either party may terminate with 14 days written notice. Governing law: applicable jurisdiction of the client.",
  },
};

async function main() {
  console.log("Testing docx-builder...\n");
  const buffer = await buildDocx(sampleProposal);
  console.log(`DOCX buffer size: ${buffer.byteLength} bytes`);

  const outputPath = path.join(process.cwd(), "test-output-proposal.docx");
  fs.writeFileSync(outputPath, buffer);
  console.log(`\nFile written to: ${outputPath}`);
  console.log("Open it in Microsoft Word or Google Docs to verify formatting.");
}

main().catch(console.error);
