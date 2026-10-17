import { WORKFLOW_ARTIFACT_MAINTENANCE_WORKFLOW_IDS } from '@api/collections/workflows/services/workflow-artifact-workflow-definition';
import { LIFECYCLE_MAINTENANCE_IDS } from '@api/services/lifecycle-emails/lifecycle-email-maintenance-workflow';
import { ENGAGEMENT_SWEEP_WORKFLOW_IDS } from '@workers/crons/engagement/engagement-sweep-workflow-definition';
import { REVIEW_GATE_TIMEOUT_WORKFLOW_IDS } from '@workers/crons/review-gate/review-gate-timeout-workflow-definition';
import { TIKTOK_STATUS_WORKFLOW_IDS } from '@workers/crons/tiktok/tiktok-status-workflow-definition';
import { YOUTUBE_MAINTENANCE_WORKFLOW_IDS } from '@workers/crons/youtube/youtube-maintenance-workflow-definition';

/**
 * Sweep workflows whose queued jobs are worthless once a newer tick exists. The
 * one-time #5634 drain removes only jobs of these workflows, so a workflow that
 * is not listed here is never touched.
 */
export const LEGACY_SWEEP_CANONICAL_IDS: ReadonlySet<string> = new Set<string>([
  ...Object.values(ENGAGEMENT_SWEEP_WORKFLOW_IDS),
  ...Object.values(LIFECYCLE_MAINTENANCE_IDS),
  ...Object.values(REVIEW_GATE_TIMEOUT_WORKFLOW_IDS),
  ...Object.values(TIKTOK_STATUS_WORKFLOW_IDS),
  ...Object.values(WORKFLOW_ARTIFACT_MAINTENANCE_WORKFLOW_IDS),
  ...Object.values(YOUTUBE_MAINTENANCE_WORKFLOW_IDS),
]);
