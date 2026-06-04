export interface LeadData {
  source: "typeform" | "gmail";
  sourceId: string;
  receivedAt: string;
  prospectName: string;
  companyName: string;
  contactEmail: string;
  requirementDescription: string;
  timeline: string;
  teamSize: string;
  managerEmail: string;
}

export interface ProposalSections {
  executiveSummary: string;
  requirementsUnderstanding: string;
  proposedSolution: string;
  projectTimeline: string;
  teamAndResources: string;
  investmentPricing: string;
  whyUs: string;
  deliverables: string;
  nextSteps: string;
  termsAndConditions: string;
}

export interface ProposalDocument {
  leadData: LeadData;
  generatedAt: string;
  sections: ProposalSections;
}

export interface StepResult {
  step: string;
  status: "success" | "failed";
  detail: string;
}

export interface PipelineResult {
  success: boolean;
  steps: StepResult[];
  driveLink?: string;
  emailSent?: boolean;
  error?: string;
}

export interface RawEmailLead {
  messageId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
}

// Typeform webhook structures
export interface TypeformAnswer {
  field: { id: string; type: string; ref: string };
  type: string;
  text?: string;
  number?: number;
  email?: string;
  choice?: { label: string };
}

export interface TypeformWebhookPayload {
  event_id: string;
  event_type: "form_response";
  form_response: {
    form_id: string;
    token: string;
    submitted_at: string;
    answers: TypeformAnswer[];
    hidden?: Record<string, string>;
  };
}
