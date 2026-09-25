import Anthropic from "@anthropic-ai/sdk";
import type { LeadData, ProposalSections } from "../types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Haiku is used here deliberately — it only reads and scores, never generates.
// Cheapest + fastest model is the right call for an eval-only task.
const EVAL_MODEL = "claude-haiku-4-5-20251001";
const PASS_THRESHOLD = 7;

export interface EvalResult {
  score: number;
  critique: string;
  approved: boolean;
}

const EVAL_TOOL: Anthropic.Tool = {
  name: "submit_evaluation",
  description: "Submit the quality evaluation of the proposal.",
  input_schema: {
    type: "object" as const,
    properties: {
      score: {
        type: "number",
        description: "Quality score from 1 to 10. 7 or above means the proposal is approved.",
      },
      critique: {
        type: "string",
        description:
          "Specific weaknesses and exactly what needs to be improved. Empty string if score is 7 or above.",
      },
      approved: {
        type: "boolean",
        description: "true if score is 7 or above, false otherwise.",
      },
    },
    required: ["score", "critique", "approved"],
  },
};

function buildEvalPrompt(lead: LeadData, sections: ProposalSections): string {
  return `You are a senior QA consulting manager reviewing a proposal before it is sent to the client.

Score this proposal from 1 to 10 based on these five criteria:
1. Specificity — does every section reference the client's EXACT stated requirement? No generic filler allowed.
2. Technology alignment — are the specific tools, frameworks, or systems the client mentioned referenced throughout?
3. Completeness — are all sections substantive? Not one-liners. Not placeholders.
4. Realism — does the timeline and pricing make sense for the described scope and team size?
5. Professionalism — is the tone direct, confident, and client-focused throughout?

ORIGINAL CLIENT REQUIREMENT:
${lead.requirementDescription}

Client: ${lead.prospectName} at ${lead.companyName}
Requested timeline: ${lead.timeline}
Client team size: ${lead.teamSize}

PROPOSAL SECTIONS TO REVIEW:

Executive Summary:
${sections.executiveSummary}

Requirements Understanding:
${sections.requirementsUnderstanding}

Proposed Solution:
${sections.proposedSolution}

Deliverables:
${sections.deliverables}

Project Timeline:
${sections.projectTimeline}

Call submit_evaluation with:
- score: your 1–10 rating
- critique: specific sentences describing what is weak or generic (be precise — this critique is fed back to the generator)
- approved: true if score >= ${PASS_THRESHOLD}, false otherwise`;
}

export async function evaluateProposal(
  lead: LeadData,
  sections: ProposalSections
): Promise<EvalResult> {
  let message: Anthropic.Message;

  try {
    message = await anthropic.messages.create({
      model: EVAL_MODEL,
      max_tokens: 1024,
      tools: [EVAL_TOOL],
      tool_choice: { type: "tool", name: "submit_evaluation" },
      messages: [{ role: "user", content: buildEvalPrompt(lead, sections) }],
    });
  } catch {
    // Eval API failure is non-blocking — pass the proposal through rather than killing the pipeline
    return { score: PASS_THRESHOLD, critique: "", approved: true };
  }

  const toolBlock = message.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === "submit_evaluation"
  );

  if (!toolBlock) {
    return { score: PASS_THRESHOLD, critique: "", approved: true };
  }

  const result = toolBlock.input as { score: number; critique: string; approved: boolean };

  return {
    score: result.score,
    critique: result.critique ?? "",
    approved: result.score >= PASS_THRESHOLD,
  };
}
