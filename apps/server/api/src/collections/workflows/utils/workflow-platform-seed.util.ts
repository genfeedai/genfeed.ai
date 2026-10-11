import { AD_AUTOMATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/ad-automation-workflows.template';
import { AGENT_AUTOPILOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/agent-autopilot-workflows.template';
import { ANALYTICS_SYNC_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/campaign-orchestration-workflows.template';
import { CONTENT_LEARNING_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/content-learning-workflows.template';
import { CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/content-loop-autopilot-workflows.template';
import { CONTENT_PRODUCTION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/content-production-workflows.template';
import { LIVESTREAM_BOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/livestream-bot-workflows.template';
import { OUTREACH_CAMPAIGN_DISPATCH_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/outreach-campaign-dispatch-workflows.template';
import { REPLY_POLLING_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/reply-polling-workflows.template';
import { TREND_NOTIFICATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/trend-notification-workflows.template';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';
import {
  buildWorkflowVersionDefinition,
  type WorkflowDefinitionInput,
} from '@api/collections/workflows/workflow-version-definition';
import { WorkflowLifecycle } from '@genfeedai/contracts';

export type SeedableWorkflowTemplate = WorkflowTemplate & { schedule?: string };

export interface PlatformSeedTemplateSet {
  lifecycle?: WorkflowLifecycle;
  sourceIssue: number;
  templates: readonly SeedableWorkflowTemplate[];
}

/**
 * The code-owned catalog sets `WorkflowTemplateSeederService` writes. The seeder reads its
 * templates from here and the scheduler validates a marked row against the same objects, so the
 * canonical graph a row is checked against is always the one the seeder would write.
 */
export const PLATFORM_SEED_TEMPLATE_SETS = {
  adAutomation: {
    lifecycle: WorkflowLifecycle.PUBLISHED,
    sourceIssue: 782,
    templates: AD_AUTOMATION_WORKFLOW_TEMPLATES,
  },
  agentAutopilot: {
    sourceIssue: 784,
    templates: AGENT_AUTOPILOT_WORKFLOW_TEMPLATES,
  },
  analyticsSync: {
    sourceIssue: 785,
    templates: ANALYTICS_SYNC_WORKFLOW_TEMPLATES,
  },
  campaignOrchestration: {
    sourceIssue: 783,
    templates: CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES,
  },
  contentLearning: {
    sourceIssue: 5728,
    templates: CONTENT_LEARNING_WORKFLOW_TEMPLATES,
  },
  contentLoopAutopilot: {
    sourceIssue: 3018,
    templates: CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES,
  },
  contentProduction: {
    sourceIssue: 786,
    templates: CONTENT_PRODUCTION_WORKFLOW_TEMPLATES,
  },
  livestreamBot: {
    sourceIssue: 793,
    templates: LIVESTREAM_BOT_WORKFLOW_TEMPLATES,
  },
  outreachCampaignDispatch: {
    sourceIssue: 3407,
    templates: OUTREACH_CAMPAIGN_DISPATCH_WORKFLOW_TEMPLATES,
  },
  replyPolling: {
    sourceIssue: 787,
    templates: REPLY_POLLING_WORKFLOW_TEMPLATES,
  },
  trendNotification: {
    sourceIssue: 788,
    templates: TREND_NOTIFICATION_WORKFLOW_TEMPLATES,
  },
} as const satisfies Record<string, PlatformSeedTemplateSet>;

/**
 * Only a template that ships a canonical cron runs under platform authority: it is platform
 * automation. A manual-run template always needs the person who runs it.
 */
export function isPlatformScheduledTemplate(
  template: SeedableWorkflowTemplate,
): boolean {
  return typeof template.schedule === 'string' && template.schedule.length > 0;
}

let templatesByKey: ReadonlyMap<string, SeedableWorkflowTemplate> | undefined;
const hashesByKey = new Map<string, string | null>();

function platformScheduledTemplatesByKey(): ReadonlyMap<
  string,
  SeedableWorkflowTemplate
> {
  if (!templatesByKey) {
    const index = new Map<string, SeedableWorkflowTemplate>();
    for (const set of Object.values(PLATFORM_SEED_TEMPLATE_SETS)) {
      for (const template of set.templates) {
        if (isPlatformScheduledTemplate(template)) {
          index.set(template.id, template);
        }
      }
    }
    templatesByKey = index;
  }
  return templatesByKey;
}

/** The canonical scheduled template a platform seed key names, if any. */
export function findPlatformSeedTemplate(
  platformSeedKey: string,
): SeedableWorkflowTemplate | undefined {
  return platformScheduledTemplatesByKey().get(platformSeedKey);
}

/**
 * The content hash the seeder's version row gets for a template, computed by the same
 * definition builder `WorkflowsService.create` uses. `undefined` when the template does not
 * build (it then can never match a stored version).
 */
export function getPlatformSeedContentHash(
  template: SeedableWorkflowTemplate,
): string | undefined {
  const cached = hashesByKey.get(template.id);
  if (cached !== undefined) {
    return cached ?? undefined;
  }
  let hash: string | null = null;
  try {
    hash = buildWorkflowVersionDefinition({
      edges: (template.edges ??
        []) as unknown as WorkflowDefinitionInput['edges'],
      inputVariables: (template.inputVariables ??
        []) as unknown as WorkflowDefinitionInput['inputVariables'],
      nodes: (template.nodes ??
        []) as unknown as WorkflowDefinitionInput['nodes'],
    }).contentHash;
  } catch {
    hash = null;
  }
  hashesByKey.set(template.id, hash);
  return hash ?? undefined;
}

export type PlatformSeedCandidate = {
  brandId?: string | null;
  currentVersion?: { contentHash?: string | null } | null;
  platformSeedKey?: string | null;
};

/**
 * Whether a row still is the canonical seeded workflow its marker claims: the marker names a
 * scheduled catalog template, the row is organization-wide (never brand-scoped), and its
 * current immutable version has exactly the template's content hash. Any edit appends a new
 * version, so an edited, stale or tampered row fails here even if its marker survived.
 */
export function isCanonicalPlatformSeed(
  workflow: PlatformSeedCandidate,
): boolean {
  const key = workflow.platformSeedKey;
  if (typeof key !== 'string' || key.length === 0 || workflow.brandId) {
    return false;
  }
  const template = findPlatformSeedTemplate(key);
  if (!template) {
    return false;
  }
  const canonicalHash = getPlatformSeedContentHash(template);
  return (
    canonicalHash !== undefined &&
    workflow.currentVersion?.contentHash === canonicalHash
  );
}

/**
 * Patch fields that change what a seeded workflow is or runs. A tenant write that carries any
 * of them ends the platform exemption in the same write; schedule, timezone and enable/disable
 * do not.
 */
export const PLATFORM_SEED_INVALIDATING_PATCH_FIELDS = [
  'brandId',
  'config',
  'edgeStyle',
  'edges',
  'inputVariables',
  'lockedNodeIds',
  'metadata',
  'nodes',
  'recurrence',
  'templateId',
  'trigger',
] as const;
