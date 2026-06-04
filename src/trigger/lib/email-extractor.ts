import Anthropic from "@anthropic-ai/sdk";
import type { RawEmailLead, LeadData } from "../types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ExtractedFields {
  prospectName: string;
  companyName: string;
  contactEmail: string;
  requirementDescription: string;
  timeline: string;
  teamSize: string;
}

const SYSTEM_PROMPT = `You are a lead data extractor. Extract structured fields from the provided email text.
Return ONLY a valid JSON object — no markdown, no explanation, no surrounding text.
For any field you cannot find or infer, use the exact string "Not specified".
Never return null, undefined, or an empty string for any field.`;

const USER_PROMPT_TEMPLATE = (emailText: string) => `
Extract the following fields from this email and return a JSON object with exactly these keys:
- prospectName: the name of the person who sent the email (string)
- companyName: the company or organization they represent (string)
- contactEmail: their email address (string)
- requirementDescription: a detailed summary of what they need or want built (string, required). Preserve all specific technical details — frameworks, tools, design patterns, systems, methodologies (e.g., POM, TestNG, Selenium, Blackbird, SAP, ERP). Do not generalize or drop technical specifics.
- timeline: how long they want the project to take, or when they need it done (string)
- teamSize: number of people on their team who will use the system (string)

EMAIL:
${emailText}
`;

export async function extractLeadFromEmail(rawEmail: RawEmailLead): Promise<LeadData> {
  const emailText = [
    `From: ${rawEmail.from}`,
    `Subject: ${rawEmail.subject}`,
    `Received: ${rawEmail.receivedAt}`,
    ``,
    rawEmail.body,
  ].join("\n");

  let extracted: ExtractedFields;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: USER_PROMPT_TEMPLATE(emailText) }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";

    // Strip any accidental markdown fences before parsing
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    extracted = JSON.parse(cleaned) as ExtractedFields;
  } catch (err) {
    // If extraction fails entirely, build a safe fallback with whatever we can infer
    extracted = {
      prospectName: "Not specified",
      companyName: "Not specified",
      contactEmail: rawEmail.from.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)?.[0] ?? "Not specified",
      requirementDescription: rawEmail.body.slice(0, 500).trim() || rawEmail.subject,
      timeline: "Not specified",
      teamSize: "Not specified",
    };
  }

  // Normalise: ensure no field is empty or undefined
  const safe = (v: unknown): string =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : "Not specified";

  return {
    source: "gmail",
    sourceId: rawEmail.messageId,
    receivedAt: rawEmail.receivedAt,
    prospectName: safe(extracted.prospectName),
    companyName: safe(extracted.companyName),
    contactEmail: safe(extracted.contactEmail),
    requirementDescription: safe(extracted.requirementDescription),
    timeline: safe(extracted.timeline),
    teamSize: safe(extracted.teamSize),
    managerEmail: process.env.MANAGER_EMAIL ?? "",
  };
}
