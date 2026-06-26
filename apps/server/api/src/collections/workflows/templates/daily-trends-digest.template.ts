import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';
import { TREND_DIGEST_CREDIT_COST } from '@genfeedai/constants';

/**
 * Daily Trends Digest — a predetermined, per-org workflow.
 *
 * Seeded ON (`isScheduleEnabled: true`) for every organization and toggled off
 * from the automation/workflow list UI when needed. The canonical
 * WorkflowSchedulerService fires it daily; the node graph assembles a curated
 * digest from the existing global trend corpus (no scrape, no LLM) and emails it
 * to the org owner. Credits are charged once per confirmed send by the adapter.
 *
 * Node graph: trendDigest → sendEmail (explicit edge handles carry the rendered
 * `to`/`subject`/`html` plus the `skipped`/`reason` short-circuit signal).
 */
export const DAILY_TRENDS_DIGEST_TEMPLATE: WorkflowTemplate = {
  category: 'trends',
  description:
    'Scan the latest social trends daily and email a curated digest to the organization owner. Uses credits per delivered email.',
  icon: 'trending-up',
  id: 'daily-trends-digest',
  name: 'Daily Trends Digest',
  nodes: [
    {
      data: {
        config: {
          creditCost: TREND_DIGEST_CREDIT_COST,
          minViralScore: 70,
          platforms: ['tiktok', 'instagram', 'youtube', 'twitter'],
          topN: 5,
        },
        label: 'Assemble Trend Digest',
      },
      id: 'trend-digest',
      position: { x: 0, y: 120 },
      type: 'trendDigest',
    },
    {
      data: {
        config: {},
        label: 'Email Digest to Owner',
      },
      id: 'send-email',
      position: { x: 360, y: 120 },
      type: 'sendEmail',
    },
  ],
  edges: [
    {
      id: 'edge-digest-to',
      source: 'trend-digest',
      sourceHandle: 'to',
      target: 'send-email',
      targetHandle: 'to',
    },
    {
      id: 'edge-digest-subject',
      source: 'trend-digest',
      sourceHandle: 'subject',
      target: 'send-email',
      targetHandle: 'subject',
    },
    {
      id: 'edge-digest-html',
      source: 'trend-digest',
      sourceHandle: 'html',
      target: 'send-email',
      targetHandle: 'html',
    },
    {
      id: 'edge-digest-skipped',
      source: 'trend-digest',
      sourceHandle: 'skipped',
      target: 'send-email',
      targetHandle: 'skipped',
    },
    {
      id: 'edge-digest-reason',
      source: 'trend-digest',
      sourceHandle: 'reason',
      target: 'send-email',
      targetHandle: 'reason',
    },
  ],
  steps: [],
};
