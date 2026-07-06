export type CaseStudyStatus = 'template' | 'draft' | 'approved' | 'published';

export interface CaseStudyMetric {
  captureWindow: string;
  evidenceRequired: string;
  label: string;
  value: string;
}

export interface CaseStudyPipelineStep {
  description: string;
  exitCriteria: string;
  id: string;
  label: string;
  owner: string;
  title: string;
}

export interface CaseStudyProofSlot {
  description: string;
  label: string;
  metricPrompt: string;
  placement: string;
  title: string;
}

export interface CaseStudyTestimonial {
  approvedForPublicUse: boolean;
  attribution: string;
  metricLabel: string;
  metricValue: string;
  quote: string;
  role: string;
  sourceCaseStudySlug: string;
  statusLabel: string;
}

export interface CaseStudyWorkflowStep {
  description: string;
  evidence: string;
  title: string;
}

export interface CaseStudyChecklistItem {
  label: string;
  required: boolean;
}

export interface CaseStudy {
  approvedForPublicUse: boolean;
  challenge: string;
  companyName: string;
  consentSummary: string;
  customerType: string;
  headline: string;
  industry: string;
  metrics: CaseStudyMetric[];
  outcomeSummary: string;
  publishChecklist: CaseStudyChecklistItem[];
  solution: string;
  slug: string;
  status: CaseStudyStatus;
  statusLabel: string;
  summary: string;
  testimonial: CaseStudyTestimonial;
  updatedAt: string;
  workflow: CaseStudyWorkflowStep[];
}

export const requiredCaseStudyMetrics = [
  '60-day engagement lift',
  'Time saved per week',
  'Channels activated',
] as const;

export const caseStudyPipeline: CaseStudyPipelineStep[] = [
  {
    description:
      'Confirm the customer is open to a public outcome story before any interview or metric request.',
    exitCriteria:
      'Written approval covers name/logo use, quoted language, metric ranges, and the review window.',
    id: 'consent',
    label: '01',
    owner: 'Customer owner',
    title: 'Consent',
  },
  {
    description:
      'Capture the baseline and first 60 days of Genfeed-assisted publishing performance.',
    exitCriteria:
      'Engagement lift, time saved, and channels activated are backed by source exports or screenshots.',
    id: 'metrics',
    label: '02',
    owner: 'Customer owner + growth',
    title: 'Metrics',
  },
  {
    description:
      'Draft a short proof asset with challenge, workflow, measured outcome, quote, and publish locations.',
    exitCriteria:
      'Draft uses only customer-approved facts and clearly marks unverified fields as placeholders.',
    id: 'draft',
    label: '03',
    owner: 'Growth',
    title: 'Draft',
  },
  {
    description:
      'Send the customer the exact copy, testimonial, metric presentation, and page preview for approval.',
    exitCriteria:
      'Customer approves the final text, attribution, and metric wording in writing.',
    id: 'approval',
    label: '04',
    owner: 'Customer owner',
    title: 'Approval',
  },
  {
    description:
      'Publish the case study and reuse the approved testimonial in pricing and landing-page proof slots.',
    exitCriteria:
      'The case-study entry is marked published and approved testimonials render without new component work.',
    id: 'publish',
    label: '05',
    owner: 'Growth',
    title: 'Publish',
  },
];

export const caseStudyProofSlots: CaseStudyProofSlot[] = [
  {
    description:
      'A customer quote tied to the measured 60-day lift after Genfeed enters the workflow.',
    label: 'Slot 01',
    metricPrompt: '60-day engagement lift',
    placement: 'Homepage proof rail',
    title: 'Outcome quote',
  },
  {
    description:
      'A quote from the operator or founder about hours saved after moving content production into Genfeed.',
    label: 'Slot 02',
    metricPrompt: 'Time saved per week',
    placement: 'Pricing page',
    title: 'Efficiency quote',
  },
  {
    description:
      'A quote connected to the number of channels activated or campaigns shipped through the platform.',
    label: 'Slot 03',
    metricPrompt: 'Channels activated',
    placement: 'Case-study hub',
    title: 'Activation quote',
  },
];

export const caseStudies: CaseStudy[] = [
  {
    approvedForPublicUse: false,
    challenge:
      'Replace this with the customer-approved starting point: publishing cadence, workflow bottleneck, and measurable business goal before Genfeed.',
    companyName: 'Customer-approved name',
    consentSummary:
      'Template only. Do not publish as customer proof until written approval covers attribution, metrics, quote, and preview copy.',
    customerType: 'Early customer',
    headline: 'Customer outcome case study template',
    industry: 'Content, marketing, or creator team',
    metrics: [
      {
        captureWindow: 'First 60 days after Genfeed-assisted publishing starts',
        evidenceRequired: 'Baseline export plus 60-day analytics export',
        label: '60-day engagement lift',
        value: 'Replace with verified percentage or range',
      },
      {
        captureWindow: 'Representative production week after onboarding',
        evidenceRequired: 'Customer interview note or time-tracking summary',
        label: 'Time saved per week',
        value: 'Replace with verified hours saved',
      },
      {
        captureWindow: 'Channels live by the end of the case-study window',
        evidenceRequired: 'Connected-channel list or published campaign URLs',
        label: 'Channels activated',
        value: 'Replace with approved channel count',
      },
    ],
    outcomeSummary:
      'Replace with the customer-approved outcome summary after consent, metric capture, and final review.',
    publishChecklist: [
      {
        label: 'Consent covers public name, logo, attribution, and quote use',
        required: true,
      },
      {
        label: '60-day engagement lift is backed by source evidence',
        required: true,
      },
      {
        label:
          'Time saved and channels activated are verified with the customer',
        required: true,
      },
      {
        label: 'Customer has approved the final page preview',
        required: true,
      },
      {
        label:
          'Pricing and landing-page testimonial slots point to approved copy',
        required: true,
      },
    ],
    slug: 'first-customer-proof-template',
    solution:
      'Replace this with the approved Genfeed workflow: source inputs, content formats generated, approval path, publishing channels, and measurement loop.',
    status: 'template',
    statusLabel: 'Template - not public proof yet',
    summary:
      'A reusable case-study structure for the first permissioned customer receipt. Fill the data fields and switch the status to published after approval.',
    testimonial: {
      approvedForPublicUse: false,
      attribution: 'Approved customer spokesperson',
      metricLabel: 'Metric pending',
      metricValue: 'Awaiting verified result',
      quote:
        'Replace this with a customer-approved quote after the approval step.',
      role: 'Customer-approved title',
      sourceCaseStudySlug: 'first-customer-proof-template',
      statusLabel: 'Template copy',
    },
    updatedAt: '2026-07-06',
    workflow: [
      {
        description:
          'Document the customer baseline before Genfeed enters the publishing workflow.',
        evidence: '30-day baseline, current tools, weekly hours, channels live',
        title: 'Baseline',
      },
      {
        description:
          'Capture the Genfeed setup: brand system, workflow, generated formats, approvals, and publishing destinations.',
        evidence: 'Workflow summary, approved formats, channel list',
        title: 'Genfeed workflow',
      },
      {
        description:
          'Measure the first 60 days against the baseline and summarize the operational change.',
        evidence: '60-day analytics export, interview notes, approved quote',
        title: 'Measured outcome',
      },
    ],
  },
];

export function getAllCaseStudySlugs(): string[] {
  return caseStudies.map((caseStudy) => caseStudy.slug);
}

export function getApprovedCaseStudyTestimonials(
  limit = 3,
): CaseStudyTestimonial[] {
  return caseStudies
    .filter(
      (caseStudy) =>
        caseStudy.status === 'published' && caseStudy.approvedForPublicUse,
    )
    .map((caseStudy) => caseStudy.testimonial)
    .filter((testimonial) => testimonial.approvedForPublicUse)
    .slice(0, limit);
}

export function getCaseStudyBySlug(slug: string): CaseStudy | undefined {
  return caseStudies.find((caseStudy) => caseStudy.slug === slug);
}

export function getPublishedCaseStudies(): CaseStudy[] {
  return caseStudies.filter(
    (caseStudy) =>
      caseStudy.status === 'published' && caseStudy.approvedForPublicUse,
  );
}
