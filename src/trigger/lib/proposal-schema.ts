// Single source of truth for the 10 proposal section key names.
// The required array in proposal-generator.ts and the validation loop
// both derive from this — add, remove, or rename a section here and
// both places update automatically.
export const PROPOSAL_SECTION_KEYS = [
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
] as const;

export type ProposalSectionKey = typeof PROPOSAL_SECTION_KEYS[number];
