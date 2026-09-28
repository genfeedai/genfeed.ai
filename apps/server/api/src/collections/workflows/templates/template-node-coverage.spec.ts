import { getNodeDefinition } from '@api/collections/workflows/registry/node-registry-adapter';
import {
  SHOWCASE_WORKFLOW_TEMPLATE_IDS,
  WORKFLOW_TEMPLATES,
} from '@api/collections/workflows/templates/workflow-templates';
import { getActionDefinition } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';

/**
 * Known template defects outside the showcase set, tracked for burn-down in
 * #5533. Each entry is `<templateId>:<edgeId>` or `<templateId>:<placeholder>`.
 * The guards compare against these lists exactly: a new defect fails, and so
 * does a fixed one that is still listed.
 */
const KNOWN_UNRESOLVED_SOURCE_HANDLES: readonly string[] = [
  'floor-plan-interior-preview:edge-floor-plan-alt-output',
  'floor-plan-interior-preview:edge-floor-plan-detail-output',
  'floor-plan-interior-preview:edge-floor-plan-hero-output',
  'instagram-remix-review:edge-instagram-remix-review',
  'source-maintenance:edge-capture-to-read',
  'source-maintenance:edge-read-to-capture',
  'virtual-staging-rescue:edge-virtual-staging-cleanup-output',
  'virtual-staging-rescue:edge-virtual-staging-premium-output',
];
const KNOWN_UNDECLARED_PLACEHOLDERS: readonly string[] = [
  'daily-image-generation:prompt',
  'motivational-quote-image:quote',
  'scheduled-video-creation:prompt',
  'social-media-video-series:prompt',
  'tiktok-slideshow-automation:niche',
  'tiktok-slideshow-automation:product',
  'webhook-notification:GENFEEDAI_WEBHOOKS_URL',
  'weekly-article-batch:topic',
];

const PLACEHOLDER_PATTERN = /\$\{([^}]+)\}/g;

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Whether the engine can deliver `handle` from an output matching `schema`.
 * `gatherInputs` passes a non-object output whole, but drops a named handle
 * that an object (or array) output does not carry.
 */
function outputCarriesHandle(schema: unknown, handle: string): boolean {
  const record = readRecord(schema);
  if (Array.isArray(record.anyOf)) {
    return record.anyOf.some((branch) => outputCarriesHandle(branch, handle));
  }
  if (record.type === 'array') {
    return false;
  }
  if (record.type !== 'object' || record.additionalProperties !== false) {
    return true;
  }
  return handle in readRecord(record.properties);
}

function readActionId(node: { data?: { config?: unknown } }): string | null {
  const actionId = readRecord(node.data?.config).actionId;
  return typeof actionId === 'string' ? actionId : null;
}

describe('workflow template node coverage', () => {
  it('exposes a registry definition for every visual template node type', () => {
    const templateNodeTypes = new Set(
      Object.values(WORKFLOW_TEMPLATES)
        .flatMap((template) => template.nodes ?? [])
        .map((node) => node.type),
    );

    const missingNodeTypes = [...templateNodeTypes].filter(
      (nodeType) => !getNodeDefinition(nodeType),
    );

    expect(missingNodeTypes).toEqual([]);
  });
});

describe('workflow template wiring guard (#5533)', () => {
  it('names only source handles the source action output contract declares', () => {
    const unresolved: string[] = [];

    for (const [templateId, template] of Object.entries(WORKFLOW_TEMPLATES)) {
      const nodesById = new Map(
        (template.nodes ?? []).map((node) => [node.id, node]),
      );
      for (const edge of template.edges ?? []) {
        if (edge.sourceHandle === undefined) {
          continue;
        }
        const sourceNode = nodesById.get(edge.source);
        const actionId = sourceNode ? readActionId(sourceNode) : null;
        if (!actionId) {
          // Workflow inputs and other native nodes emit scalars, which the
          // engine delivers whole whatever the handle is called.
          continue;
        }
        const outputSchema = getActionDefinition(actionId)?.outputSchema;
        if (!outputCarriesHandle(outputSchema, edge.sourceHandle)) {
          unresolved.push(`${templateId}:${edge.id}`);
        }
      }
    }

    expect(unresolved.sort()).toEqual([...KNOWN_UNRESOLVED_SOURCE_HANDLES]);
  });

  it('uses only dollar-brace placeholders that the template declares as inputs', () => {
    const undeclared: string[] = [];

    for (const [templateId, template] of Object.entries(WORKFLOW_TEMPLATES)) {
      const declaredInputs = new Set(
        (template.inputVariables ?? []).map((variable) => variable.key),
      );
      const placeholders = new Set(
        [...JSON.stringify(template.nodes ?? []).matchAll(PLACEHOLDER_PATTERN)]
          .map((match) => match[1])
          .filter((name): name is string => typeof name === 'string'),
      );
      for (const placeholder of placeholders) {
        if (!declaredInputs.has(placeholder)) {
          undeclared.push(`${templateId}:${placeholder}`);
        }
      }
    }

    expect(undeclared.sort()).toEqual([...KNOWN_UNDECLARED_PLACEHOLDERS]);
  });

  it('keeps every showcase template off the known-defect baselines', () => {
    const showcaseIds = new Set<string>(SHOWCASE_WORKFLOW_TEMPLATE_IDS);
    const baselinedShowcase = [
      ...KNOWN_UNRESOLVED_SOURCE_HANDLES,
      ...KNOWN_UNDECLARED_PLACEHOLDERS,
    ].filter((entry) => showcaseIds.has(entry.split(':')[0] ?? ''));

    expect(baselinedShowcase).toEqual([]);
  });

  it('flags a named handle the source output contract does not declare', () => {
    const imageGenOutput = getActionDefinition('imageGen')?.outputSchema;

    expect(outputCarriesHandle(imageGenOutput, 'imageUrl')).toBe(true);
    expect(outputCarriesHandle(imageGenOutput, 'image')).toBe(false);
    expect(
      outputCarriesHandle(
        getActionDefinition('effect-captions')?.outputSchema,
        'video',
      ),
    ).toBe(false);
  });
});
