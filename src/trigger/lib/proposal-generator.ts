import Anthropic from "@anthropic-ai/sdk";
import type { LeadData, ProposalDocument, ProposalSections } from "../types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a senior proposal writer at a QA and test automation consulting firm specializing in enterprise test frameworks, automation scripts, and quality engineering.
Your proposals are professional, specific, and persuasive — every section must be grounded in the client's actual stated requirement, not generic filler.
Write each section in plain business English. No jargon, no vague statements.
Where the client has mentioned specific technologies, frameworks, or systems (e.g., POM, TestNG, Blackbird, SAP, Selenium), reference them directly in the relevant sections.`;

// Tool definition — schema enforced at the API level.
// Claude is forced to call this tool (tool_choice: forced), so it cannot
// return prose or deviate from the structure. No JSON.parse needed.
const PROPOSAL_TOOL: Anthropic.Tool = {
  name: "submit_proposal",
  description: "Submit the completed proposal with all 10 required sections.",
  input_schema: {
    type: "object" as const,
    properties: {
      executiveSummary:          { type: "string", description: "2–3 paragraph opening addressed to the prospect" },
      requirementsUnderstanding: { type: "string", description: "Structured breakdown of the client's exact requirement" },
      proposedSolution:          { type: "string", description: "Concrete solution aligned to the client's stated need" },
      projectTimeline:           { type: "string", description: "Phased timeline fitting within the client's stated deadline" },
      teamAndResources:          { type: "string", description: "Team composition with billing rates and total cost" },
      investmentPricing:         { type: "string", description: "Clear pricing table with payment terms" },
      whyUs:                     { type: "string", description: "3–4 specific reasons tailored to this client's industry" },
      deliverables:              { type: "string", description: "Numbered list of tangible deliverables" },
      nextSteps:                 { type: "string", description: "4–5 action-oriented next steps for both parties" },
      termsAndConditions:        { type: "string", description: "Proposal validity, payment, IP ownership, confidentiality" },
    },
    required: [
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
    ],
  },
};

function buildUserPrompt(lead: LeadData, critiqueFeedback?: string): string {
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

IMPORTANT: Every section must reflect the client's actual stated requirement. Do not write generic technology consulting content. If the client mentioned specific frameworks, tools, or systems, those must appear in requirementsUnderstanding, proposedSolution, deliverables, and teamAndResources.${
    critiqueFeedback
      ? `\n\nPREVIOUS ATTEMPT WAS REJECTED — REVIEWER FEEDBACK:\n${critiqueFeedback}\n\nYou MUST address every point above in this revised proposal. Do not repeat the same mistakes.`
      : ""
  }`;
}

export async function generateProposal(
  lead: LeadData,
  critiqueFeedback?: string
): Promise<ProposalDocument> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    tools: [PROPOSAL_TOOL],
    // Force Claude to always call submit_proposal — it cannot respond with prose
    tool_choice: { type: "tool", name: "submit_proposal" },
    messages: [{ role: "user", content: buildUserPrompt(lead, critiqueFeedback) }],
  });

  // With tool_choice forced, content[0] is always a tool_use block — no text parsing needed
  const toolBlock = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "submit_proposal"
  );

  if (!toolBlock) {
    throw new Error("Claude did not call the submit_proposal tool — unexpected response structure");
  }

  const sections = toolBlock.input as ProposalSections;

  // Defensive: fill any missing keys rather than throwing (tool_choice makes this unlikely)
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
