import Anthropic from "@anthropic-ai/sdk";
import type { LeadData, ProposalDocument, ProposalSections } from "../types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a senior proposal writer at a QA and test automation consulting firm specializing in enterprise test frameworks, automation scripts, and quality engineering.
Your proposals are professional, specific, and persuasive — every section must be grounded in the client's actual stated requirement, not generic filler.
Write each section in plain business English. No jargon, no vague statements.
Where the client has mentioned specific technologies, frameworks, or systems (e.g., POM, TestNG, Blackbird, SAP, Selenium), reference them directly in the relevant sections.
Return ONLY a valid JSON object — no markdown, no explanation, no surrounding text.`;

function buildUserPrompt(lead: LeadData): string {
  const today = new Date().toISOString().split("T")[0];
  const validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const vendor = process.env.VENDOR_COMPANY_NAME || "Our QA Consulting Team";

  return `Generate a complete professional project proposal for the following client.
Return a JSON object with exactly these 10 keys. Each value is a complete section in plain text (no markdown headers inside the values).

Keys and instructions for each:

- executiveSummary: A 2–3 paragraph opening addressed to ${lead.prospectName} at ${lead.companyName}. Summarize what they are looking for, why it matters to their business, and how ${vendor} is positioned to deliver it. Reference their specific requirement directly.

- requirementsUnderstanding: Demonstrate a thorough understanding of what the client needs based on their exact request. Break this into clear bullet points or structured paragraphs. Reference any specific technologies, frameworks, design patterns, or systems the client mentioned (e.g., POM, TestNG, Blackbird Framework, existing project structure). Do not generalize — pull details directly from their requirement.

- proposedSolution: Describe the concrete solution ${vendor} will deliver. Align it to exactly what the client described. If they mentioned a specific framework or design pattern, outline how the solution will follow or extend it. Include scope boundaries — what is in scope and what is out of scope. 3–5 paragraphs.

- projectTimeline: The client has requested delivery within ${lead.timeline}. Break this timeline into logical phases (e.g., Discovery, Development, Testing, Deployment, Handover). Assign realistic week ranges to each phase fitting within the stated timeline. Be specific — do not say "TBD".

- teamAndResources: Calculate and present the team composition required for this engagement. Use these exact billing rates: QA Engineer = $65/hour, Developer = $90/hour. Based on the scope and ${lead.timeline} timeline, estimate the number of resources per role, estimated hours per role, and total cost per role. Present as a structured breakdown. End with a total engagement cost.

- investmentPricing: Summarize the investment in a clear pricing table format (plain text). Include role, rate, estimated hours, and subtotal for each resource type. Show the total project cost. Note payment terms: 30% upfront, 40% at midpoint, 30% on delivery.

- whyUs: 3–4 reasons why ${vendor} is the right partner for this engagement. Tie each reason directly to the client's industry or stated requirement. Avoid generic claims — be specific to QA automation, test framework expertise, or the technologies mentioned.

- deliverables: A numbered list of all tangible deliverables the client will receive at the end of the engagement. Tie these to the specific requirement (e.g., automated test scripts, CI/CD integration, framework documentation, knowledge transfer sessions).

- nextSteps: A short, action-oriented list of 4–5 next steps for both parties after the proposal is accepted. Include a discovery call, requirement sign-off, contract execution, and kickoff.

- termsAndConditions: Standard consulting engagement terms: proposal validity (14 days from ${today}), payment terms, IP ownership (client owns all deliverables), confidentiality, change request process, and termination clause.

CLIENT DETAILS:
Prospect Name: ${lead.prospectName}
Company: ${lead.companyName}
Contact Email: ${lead.contactEmail}
Requirement: ${lead.requirementDescription}
Timeline: ${lead.timeline}
Team Size (client side): ${lead.teamSize}
Proposal Date: ${today}
Valid Until: ${validUntil}
Prepared By: ${vendor}

IMPORTANT: Every section must reflect the client's actual stated requirement. Do not write generic technology consulting content. If the client mentioned specific frameworks, tools, or systems, those must appear in requirementsUnderstanding, proposedSolution, deliverables, and teamAndResources.`;
}

export async function generateProposal(lead: LeadData): Promise<ProposalDocument> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(lead) }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";

  // Strip any accidental markdown fences
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();

  let sections: ProposalSections;
  try {
    sections = JSON.parse(cleaned) as ProposalSections;
  } catch {
    throw new Error(
      `Claude returned malformed JSON. Raw response (first 300 chars): ${raw.slice(0, 300)}`
    );
  }

  // Validate all 10 keys are present
  const required: (keyof ProposalSections)[] = [
    "executiveSummary",
    "requirementsUnderstanding",
    "proposedSolution",
    "projectTimeline",
    "teamAndResources",
    "investmentPricing",
    "whyUs",
    "deliverables",
    "nextSteps",
    "termsAndConditions",
  ];

  for (const key of required) {
    if (!sections[key] || typeof sections[key] !== "string") {
      sections[key] = "Content not available — please review and complete this section.";
    }
  }

  return {
    leadData: lead,
    generatedAt: new Date().toISOString(),
    sections,
  };
}
