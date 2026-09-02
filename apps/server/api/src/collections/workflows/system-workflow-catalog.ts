import {
  SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE,
  SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
  SYSTEM_WORKFLOW_TEMPLATE_VERSION,
} from '@api/collections/workflows/system-workflow.contract';
import { AD_AUTOMATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/ad-automation-workflows.template';
import { AGENT_AUTOPILOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/agent-autopilot-workflows.template';
import { ANALYTICS_SYNC_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/campaign-orchestration-workflows.template';
import { CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/content-loop-autopilot-workflows.template';
import { CONTENT_PRODUCTION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/content-production-workflows.template';
import { DAILY_TRENDS_DIGEST_TEMPLATE } from '@api/collections/workflows/templates/daily-trends-digest.template';
import { LIVESTREAM_BOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/livestream-bot-workflows.template';
import { OUTREACH_CAMPAIGN_DISPATCH_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/outreach-campaign-dispatch-workflows.template';
import { PAID_CREATIVE_RESEARCH_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/paid-creative-research-workflows.template';
import { REPLY_POLLING_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/reply-polling-workflows.template';
import { TREND_NOTIFICATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/trend-notification-workflows.template';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

/**
 * Installable system workflow catalog (#2176).
 *
 * Canonical graphs live in code, not as per-organization clones created at
 * signup. Tenants discover entries here and install the ones they want.
 */

export type SystemWorkflowCatalogFamily =
  | 'ad-automation'
  | 'agent-autopilot'
  | 'analytics-sync'
  | 'campaign-orchestration'
  | 'content-loop-autopilot'
  | 'content-production'
  | 'livestream-bot'
  | 'outreach-campaign-dispatch'
  | 'paid-creative-research'
  | 'product'
  | 'reply-polling'
  | 'system-action'
  | 'trend-notification';

export type SystemWorkflowCatalogEntry = {
  canonicalId: string;
  category: string;
  changeSummary: string;
  description: string;
  edges: WorkflowTemplate['edges'];
  family: SystemWorkflowCatalogFamily;
  icon?: string;
  inputVariables: NonNullable<WorkflowTemplate['inputVariables']>;
  installable: boolean;
  isScheduleEnabled: boolean;
  label: string;
  nodes: NonNullable<WorkflowTemplate['nodes']>;
  schedule?: string;
  sourceIssue: number;
  timezone: string;
  version: number;
};

type CatalogTemplateSource = {
  family: SystemWorkflowCatalogFamily;
  installable: boolean;
  sourceIssue: number;
  templates: readonly WorkflowTemplate[];
};

const CATALOG_TEMPLATE_SOURCES: readonly CatalogTemplateSource[] = [
  {
    family: 'product',
    installable: true,
    sourceIssue: SYSTEM_WORKFLOW_PRODUCTIZATION_ISSUE,
    templates: [DAILY_TRENDS_DIGEST_TEMPLATE],
  },
  {
    family: 'ad-automation',
    installable: true,
    sourceIssue: 782,
    templates: AD_AUTOMATION_WORKFLOW_TEMPLATES,
  },
  {
    family: 'campaign-orchestration',
    installable: true,
    sourceIssue: 783,
    templates: CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES,
  },
  {
    family: 'outreach-campaign-dispatch',
    installable: true,
    sourceIssue: 3407,
    templates: OUTREACH_CAMPAIGN_DISPATCH_WORKFLOW_TEMPLATES,
  },
  {
    family: 'paid-creative-research',
    installable: true,
    sourceIssue: 3537,
    templates: PAID_CREATIVE_RESEARCH_WORKFLOW_TEMPLATES,
  },
  {
    family: 'agent-autopilot',
    installable: true,
    sourceIssue: 784,
    templates: AGENT_AUTOPILOT_WORKFLOW_TEMPLATES,
  },
  {
    family: 'analytics-sync',
    installable: true,
    sourceIssue: 785,
    templates: ANALYTICS_SYNC_WORKFLOW_TEMPLATES,
  },
  {
    family: 'content-production',
    installable: true,
    sourceIssue: 786,
    templates: CONTENT_PRODUCTION_WORKFLOW_TEMPLATES,
  },
  {
    family: 'content-loop-autopilot',
    installable: true,
    sourceIssue: 3018,
    templates: CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES,
  },
  {
    family: 'reply-polling',
    installable: true,
    sourceIssue: 787,
    templates: REPLY_POLLING_WORKFLOW_TEMPLATES,
  },
  {
    family: 'trend-notification',
    installable: true,
    sourceIssue: 788,
    templates: TREND_NOTIFICATION_WORKFLOW_TEMPLATES,
  },
  {
    family: 'livestream-bot',
    installable: true,
    sourceIssue: 793,
    templates: LIVESTREAM_BOT_WORKFLOW_TEMPLATES,
  },
];

function toCatalogEntry(
  template: WorkflowTemplate,
  source: Pick<CatalogTemplateSource, 'family' | 'installable' | 'sourceIssue'>,
): SystemWorkflowCatalogEntry {
  const version = template.version ?? SYSTEM_WORKFLOW_TEMPLATE_VERSION;
  const schedule = template.schedule;
  const hasSchedule =
    typeof schedule === 'string' && schedule.trim().length > 0;

  return {
    canonicalId: template.id,
    category: template.category,
    changeSummary:
      template.changeSummary ?? SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
    description: template.description,
    edges: template.edges ?? [],
    family: source.family,
    icon: template.icon,
    inputVariables: template.inputVariables ?? [],
    installable: source.installable,
    isScheduleEnabled: template.isScheduleEnabled ?? hasSchedule,
    label: template.name,
    nodes: template.nodes ?? [],
    schedule,
    sourceIssue: source.sourceIssue,
    timezone: template.timezone ?? 'UTC',
    version,
  };
}

let cachedCatalog: readonly SystemWorkflowCatalogEntry[] | null = null;

export function listSystemWorkflowCatalog(): readonly SystemWorkflowCatalogEntry[] {
  if (cachedCatalog) {
    return cachedCatalog;
  }

  const entries: SystemWorkflowCatalogEntry[] = [];

  for (const source of CATALOG_TEMPLATE_SOURCES) {
    for (const template of source.templates) {
      entries.push(toCatalogEntry(template, source));
    }
  }

  cachedCatalog = entries;
  return cachedCatalog;
}

export function getSystemWorkflowCatalogEntry(
  canonicalId: string,
): SystemWorkflowCatalogEntry | null {
  return (
    listSystemWorkflowCatalog().find(
      (entry) => entry.canonicalId === canonicalId,
    ) ?? null
  );
}

export function listInstallableSystemWorkflowCatalog(): readonly SystemWorkflowCatalogEntry[] {
  return listSystemWorkflowCatalog().filter((entry) => entry.installable);
}
