import { buildBrandRemixGenerateWorkflowDefinitions } from '@api/collections/content-runs/services/brand-remix-downstream-workflow-definition';
import { AD_BULK_UPLOAD_CHILD_WORKFLOWS } from '@api/collections/workflows/services/ad-bulk-upload-workflow.service';
import {
  AUTOMATION_CHILD_WORKFLOWS,
  AUTOMATION_PARENT_WORKFLOWS,
} from '@api/collections/workflows/services/automation-workflow-definitions';
import { AD_AUTOMATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/ad-automation-workflows.template';
import { AGENT_AUTOPILOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/agent-autopilot-workflows.template';
import { ANALYTICS_SYNC_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { AVATAR_UGC_WORKFLOW_TEMPLATE } from '@api/collections/workflows/templates/avatar-ugc-workflow.template';
import { AVATAR_UGC_X_LANDSCAPE_WORKFLOW_TEMPLATE } from '@api/collections/workflows/templates/avatar-ugc-x-landscape-workflow.template';
import { CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/campaign-orchestration-workflows.template';
import { CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/content-loop-autopilot-workflows.template';
import { CONTENT_PRODUCTION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/content-production-workflows.template';
import { LIVESTREAM_BOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/livestream-bot-workflows.template';
import { OUTREACH_CAMPAIGN_DISPATCH_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/outreach-campaign-dispatch-workflows.template';
import { PAID_CREATIVE_RESEARCH_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/paid-creative-research-workflows.template';
import { REPLY_POLLING_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/reply-polling-workflows.template';
import { TREND_NOTIFICATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/trend-notification-workflows.template';
import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import { getActionDefinition } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';

/**
 * Every shipped graph — customer templates and hidden system workflows alike —
 * authors node parameters that the engine validates against the action's
 * `inputSchema` before the executor runs. Those schemas are closed
 * (`additionalProperties: false`), so an authored key the contract does not
 * declare fails the whole execution at runtime. This spec is the guard that
 * keeps authored parameters and published contracts in lockstep.
 */

type ContractGap = {
  actionId: string;
  field: string;
};

type DanglingEdge = {
  edgeId: string;
  endpoint: string;
  side: 'source' | 'target';
};

const SHIPPED_GRAPH_SOURCES: readonly unknown[] = [
  WORKFLOW_TEMPLATES,
  AD_AUTOMATION_WORKFLOW_TEMPLATES,
  AGENT_AUTOPILOT_WORKFLOW_TEMPLATES,
  ANALYTICS_SYNC_WORKFLOW_TEMPLATES,
  AVATAR_UGC_WORKFLOW_TEMPLATE,
  AVATAR_UGC_X_LANDSCAPE_WORKFLOW_TEMPLATE,
  CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES,
  CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES,
  CONTENT_PRODUCTION_WORKFLOW_TEMPLATES,
  LIVESTREAM_BOT_WORKFLOW_TEMPLATES,
  OUTREACH_CAMPAIGN_DISPATCH_WORKFLOW_TEMPLATES,
  PAID_CREATIVE_RESEARCH_WORKFLOW_TEMPLATES,
  REPLY_POLLING_WORKFLOW_TEMPLATES,
  TREND_NOTIFICATION_WORKFLOW_TEMPLATES,
  AD_BULK_UPLOAD_CHILD_WORKFLOWS,
  AUTOMATION_CHILD_WORKFLOWS,
  AUTOMATION_PARENT_WORKFLOWS,
  ...buildBrandRemixGenerateWorkflowDefinitions(),
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readActionEnvelope(
  value: unknown,
): { actionId: string; parameters: Record<string, unknown> } | undefined {
  if (!isRecord(value)) return undefined;
  const actionId = value.actionId;
  if (typeof actionId !== 'string') return undefined;
  const parameters = value.parameters;
  return {
    actionId,
    parameters: isRecord(parameters) ? parameters : {},
  };
}

function collectActionEnvelopes(
  value: unknown,
  envelopes: Array<{ actionId: string; parameters: Record<string, unknown> }>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectActionEnvelopes(item, envelopes);
    return;
  }
  if (!isRecord(value)) return;

  const envelope =
    readActionEnvelope(value.config) ?? readActionEnvelope(value);
  if (envelope) envelopes.push(envelope);

  for (const item of Object.values(value))
    collectActionEnvelopes(item, envelopes);
}

/**
 * A graph is any record carrying both a node list and an edge list — the shape
 * every template, child workflow, and parent workflow shares.
 */
function collectGraphs(
  value: unknown,
  graphs: Array<{ edges: unknown[]; nodes: unknown[] }>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectGraphs(item, graphs);
    return;
  }
  if (!isRecord(value)) return;

  if (Array.isArray(value.nodes) && Array.isArray(value.edges)) {
    graphs.push({ edges: value.edges, nodes: value.nodes });
  }

  for (const item of Object.values(value)) collectGraphs(item, graphs);
}

function declaredInputFields(actionId: string): Set<string> | undefined {
  const schema = getActionDefinition(actionId)?.inputSchema;
  if (!isRecord(schema)) return undefined;
  if (schema.additionalProperties !== false) return undefined;
  const properties = schema.properties;
  return new Set(isRecord(properties) ? Object.keys(properties) : []);
}

describe('shipped workflow graphs honour published action input contracts', () => {
  const envelopes: Array<{
    actionId: string;
    parameters: Record<string, unknown>;
  }> = [];
  for (const source of SHIPPED_GRAPH_SOURCES) {
    collectActionEnvelopes(source, envelopes);
  }

  it('discovers action-backed nodes across every shipped graph', () => {
    expect(envelopes.length).toBeGreaterThan(0);
  });

  it('references only actions that exist in the shared catalog', () => {
    const unknownActionIds = [
      ...new Set(
        envelopes
          .map((envelope) => envelope.actionId)
          .filter((actionId) => !getActionDefinition(actionId)),
      ),
    ].sort();

    expect(unknownActionIds).toEqual([]);
  });

  it('wires every edge to a node that exists in the same graph', () => {
    const graphs: Array<{ edges: unknown[]; nodes: unknown[] }> = [];
    for (const source of SHIPPED_GRAPH_SOURCES) {
      collectGraphs(source, graphs);
    }
    expect(graphs.length).toBeGreaterThan(0);

    const dangling: DanglingEdge[] = [];
    for (const graph of graphs) {
      const nodeIds = new Set(
        graph.nodes
          .filter(isRecord)
          .map((node) => node.id)
          .filter((id): id is string => typeof id === 'string'),
      );

      for (const edge of graph.edges) {
        if (!isRecord(edge)) continue;
        const edgeId = typeof edge.id === 'string' ? edge.id : '(unnamed)';
        for (const side of ['source', 'target'] as const) {
          const endpoint = edge[side];
          if (typeof endpoint !== 'string' || nodeIds.has(endpoint)) continue;
          dangling.push({ edgeId, endpoint, side });
        }
      }
    }

    expect(dangling).toEqual([]);
  });

  it('authors no parameter the action input contract would reject', () => {
    const gaps = new Map<string, ContractGap>();

    for (const envelope of envelopes) {
      const declared = declaredInputFields(envelope.actionId);
      if (!declared) continue;
      for (const field of Object.keys(envelope.parameters)) {
        if (declared.has(field)) continue;
        gaps.set(`${envelope.actionId}.${field}`, {
          actionId: envelope.actionId,
          field,
        });
      }
    }

    expect(
      [...gaps.values()].sort((left, right) =>
        `${left.actionId}.${left.field}`.localeCompare(
          `${right.actionId}.${right.field}`,
        ),
      ),
    ).toEqual([]);
  });
});
