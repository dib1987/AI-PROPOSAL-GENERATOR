import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ShadingType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  PageBreak,
} from "docx";
import type { ProposalDocument } from "../types";

const BRAND_COLOR = "1a1a2e";
const ACCENT_COLOR = "0066cc";

function titleParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 48,
        color: BRAND_COLOR,
        font: "Calibri",
      }),
    ],
  });
}

function subtitleParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      new TextRun({
        text,
        size: 24,
        color: "555555",
        font: "Calibri",
      }),
    ],
  });
}

function sectionHeading(number: number, title: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
    children: [
      new TextRun({
        text: `${number}. ${title}`,
        bold: true,
        size: 28,
        color: ACCENT_COLOR,
        font: "Calibri",
      }),
    ],
  });
}

function bodyParagraph(text: string): Paragraph[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(
      (line) =>
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: line,
              size: 22,
              font: "Calibri",
            }),
          ],
        })
    );
}

function divider(): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "dddddd" },
    },
    children: [],
  });
}

function metaTable(leadData: ProposalDocument["leadData"], generatedAt: string): Table {
  const rows = [
    ["Prepared for", `${leadData.prospectName} — ${leadData.companyName}`],
    ["Contact", leadData.contactEmail],
    ["Timeline Requested", leadData.timeline],
    ["Team Size", leadData.teamSize],
    ["Date", new Date(generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
    ["Source", leadData.source === "typeform" ? "Web Form" : "Email"],
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: "f5f5f5" },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: label, bold: true, size: 20, font: "Calibri", color: "333333" }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: value, size: 20, font: "Calibri" })],
                }),
              ],
            }),
          ],
        })
    ),
  });
}

function footerParagraph(generatedAt: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 600 },
    children: [
      new TextRun({
        text: `Generated automatically · ${new Date(generatedAt).toLocaleString()} · Confidential`,
        size: 16,
        color: "999999",
        font: "Calibri",
        italics: true,
      }),
    ],
  });
}

const SECTIONS: Array<{ key: keyof ProposalDocument["sections"]; title: string }> = [
  { key: "executiveSummary", title: "Executive Summary" },
  { key: "requirementsUnderstanding", title: "Understanding of Requirements" },
  { key: "proposedSolution", title: "Proposed Solution / Scope of Work" },
  { key: "projectTimeline", title: "Project Timeline" },
  { key: "teamAndResources", title: "Team & Resources" },
  { key: "investmentPricing", title: "Investment & Pricing" },
  { key: "whyUs", title: "Why Choose Us" },
  { key: "deliverables", title: "Deliverables" },
  { key: "nextSteps", title: "Next Steps" },
  { key: "termsAndConditions", title: "Terms & Conditions" },
];

export async function buildDocx(proposal: ProposalDocument): Promise<Buffer> {
  const { leadData, sections, generatedAt } = proposal;

  const displayCompany = leadData.companyName === "Not specified" ? "Prospective Client" : leadData.companyName;
  const displayProspect = leadData.prospectName === "Not specified" ? "Prospect" : leadData.prospectName;

  const children: any[] = [
    // Cover block
    new Paragraph({ spacing: { after: 600 }, children: [] }),
    titleParagraph("PROJECT PROPOSAL"),
    subtitleParagraph(`Prepared for: ${displayProspect} · ${displayCompany}`),
    new Paragraph({ spacing: { after: 400 }, children: [] }),
    metaTable(leadData, generatedAt),
    divider(),
  ];

  // Append all 10 sections
  SECTIONS.forEach(({ key, title }, index) => {
    children.push(sectionHeading(index + 1, title));
    children.push(...bodyParagraph(sections[key]));
    children.push(divider());
  });

  // Footer
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(footerParagraph(generatedAt));

  const doc = new Document({
    creator: "AI Proposal Generator",
    title: `Proposal — ${displayCompany}`,
    description: `Automated proposal generated for ${displayProspect} at ${displayCompany}`,
    sections: [
      {
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
