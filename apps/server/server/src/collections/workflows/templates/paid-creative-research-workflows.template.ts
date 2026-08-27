import type { WorkflowTemplate } from '@server/collections/workflows/templates/workflow-templates';

export type PaidCreativeResearchWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

/**
 * Daily per-organization competitor paid-creative research for every watched
 * advertiser on every ad platform (#3537).
 *
 * `PaidCreativeResearchIngestionService` fans out across brands and platforms
 * internally and resolves each watched advertiser's provider adapter from its
 * own `platform` column, so a single organization-scoped node covers Meta,
 * TikTok, Google/YouTube, and X — no per-platform template variants.
 */
export const PAID_CREATIVE_RESEARCH_WORKFLOW_TEMPLATES = [
  {
    category: 'ads',
    description:
      'Daily per-organization competitor ad research across every watched advertiser and ad platform.',
    icon: 'megaphone',
    id: 'paid-creative-research-ingestion',
    name: 'Competitor Ad Research',
    nodes: [
      {
        data: {
          config: {},
          label: 'Ingest Competitor Ads',
        },
        id: 'paidCreativeResearchIngestion',
        position: { x: 0, y: 120 },
        type: 'paidCreativeResearchIngestion',
      },
    ],
    schedule: '0 6 * * *',
    steps: [],
  },
] satisfies PaidCreativeResearchWorkflowTemplate[];
