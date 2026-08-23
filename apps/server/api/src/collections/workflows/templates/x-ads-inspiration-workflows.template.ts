import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

export type XAdsInspirationWorkflowTemplate = WorkflowTemplate & {
  schedule: string;
};

/**
 * Daily per-organization X Ads Repository (DSA transparency) ingestion for
 * every watched advertiser (#3395 item 3). `XAdsRepositoryIngestionService`
 * fans out across brands internally, so a single organization-scoped node is
 * sufficient — no per-brand template variants needed.
 */
export const X_ADS_INSPIRATION_WORKFLOW_TEMPLATES = [
  {
    category: 'ads',
    description:
      'Daily per-organization X Ads Repository ingestion for every watched public advertiser.',
    icon: 'megaphone',
    id: 'x-ads-inspiration-ingestion',
    name: 'X Ads Inspiration Ingestion',
    nodes: [
      {
        data: {
          config: {},
          label: 'Ingest X Ads Inspiration',
        },
        id: 'xAdsInspirationIngestion',
        position: { x: 0, y: 120 },
        type: 'xAdsInspirationIngestion',
      },
    ],
    schedule: '0 6 * * *',
    steps: [],
  },
] satisfies XAdsInspirationWorkflowTemplate[];
