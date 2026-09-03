import {
  BRAND_REMIX_DOWNSTREAM_ACTION_IDS,
  BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS,
  buildBrandRemixGenerateDispatchWorkflowDefinition,
  buildBrandRemixGenerateResolveCreditsWorkflowDefinition,
  buildBrandRemixGenerateWorkflowDefinition,
  buildBrandRemixMetaPausedDraftWorkflowDefinition,
  buildBrandRemixReviewWorkflowDefinition,
  buildBrandRemixXPausedDraftWorkflowDefinition,
} from '@api/collections/content-runs/services/brand-remix-downstream-workflow-definition';
import { getActionDefinition } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';

function actionIds(
  definition: ReturnType<typeof buildBrandRemixReviewWorkflowDefinition>,
) {
  return definition.definition.nodes.flatMap((node) => {
    const actionId = node.data.config.actionId;
    return typeof actionId === 'string' ? [actionId] : [];
  });
}

function branch(
  definition: ReturnType<typeof buildBrandRemixReviewWorkflowDefinition>,
  source: string,
) {
  return definition.definition.edges
    .filter((edge) => edge.source === source)
    .map((edge) => ({
      sourceHandle: edge.sourceHandle,
      target: edge.target,
    }));
}

describe('brand remix downstream workflow definitions', () => {
  it('models review claiming, handoff, optional lineage, completion, and projection as nodes', () => {
    const definition = buildBrandRemixReviewWorkflowDefinition();

    expect(definition.canonicalId).toBe(
      BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS.REVIEW_HANDOFF,
    );
    expect(actionIds(definition)).toEqual([
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_PREPARE,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_CLAIM,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_CREATE_HANDOFF,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_RECORD_LINEAGE,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_COMPLETE,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_PROJECT,
    ]);
    expect(branch(definition, 'needs-handoff')).toEqual([
      { sourceHandle: 'true', target: 'claim-review' },
      { sourceHandle: 'false', target: 'project-review' },
    ]);
    expect(branch(definition, 'has-trend-lineage')).toEqual([
      { sourceHandle: 'true', target: 'record-lineage' },
      { sourceHandle: 'false', target: 'complete-review' },
    ]);
  });

  it('branches Meta replay before creative creation and rejoins at explicit pause nodes', () => {
    const definition = buildBrandRemixMetaPausedDraftWorkflowDefinition();

    expect(definition.canonicalId).toBe(
      BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS.META_PAUSED_DRAFT,
    );
    expect(actionIds(definition)).toEqual([
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_VALIDATE_SOURCE,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_RESOLVE_ACCOUNT,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_ENSURE_CAMPAIGN,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_ENSURE_AD_SET,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_FIND_AD,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_PREPARE_CREATIVE,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_CREATE_AD,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_PAUSE_CAMPAIGN,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_PAUSE_AD_SET,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_PAUSE_AD,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_PERSIST_MAPPING,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.META_PERSIST_LINEAGE,
    ]);
    expect(branch(definition, 'has-existing-ad')).toEqual([
      { sourceHandle: 'true', target: 'pause-campaign' },
      { sourceHandle: 'false', target: 'prepare-creative' },
    ]);
  });

  it('models each X Ads provider and persistence boundary as a sequential action', () => {
    const definition = buildBrandRemixXPausedDraftWorkflowDefinition();

    expect(definition.canonicalId).toBe(
      BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS.X_PAUSED_DRAFT,
    );
    expect(actionIds(definition)).toEqual([
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_VALIDATE_SOURCE,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_RESOLVE_ACCOUNT,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_RESOLVE_FUNDING,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_VALIDATE_TWEET,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_ENSURE_CAMPAIGN,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_ENSURE_LINE_ITEM,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_ENSURE_PROMOTED_TWEET,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_PERSIST_MAPPING,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.X_PERSIST_LINEAGE,
    ]);
    expect(definition.definition.edges).toHaveLength(8);
  });

  it('contains no legacy generate service macros', async () => {
    const { readFile } = await import('node:fs/promises');
    const execution = await readFile(
      new URL('./brand-remix-run-execution.service.ts', import.meta.url),
      'utf8',
    );
    const dispatch = await readFile(
      new URL(
        './brand-remix-run-provider-dispatch.service.ts',
        import.meta.url,
      ),
      'utf8',
    );

    expect(execution).not.toContain('generateCopyVariants');
    expect(execution).not.toContain('dispatchMediaVariants');
    expect(execution).not.toContain('finalizeOutputCredits');
    expect(execution).not.toContain('GenerationReservationBarrier');
    expect(dispatch).not.toContain('generateCopyVariants');
    expect(dispatch).not.toContain('persistCopyGenerationResult');
  });

  it('contains no legacy macro action IDs', () => {
    const serialized = JSON.stringify([
      buildBrandRemixGenerateWorkflowDefinition(),
      buildBrandRemixReviewWorkflowDefinition(),
      buildBrandRemixMetaPausedDraftWorkflowDefinition(),
      buildBrandRemixXPausedDraftWorkflowDefinition(),
    ]);

    expect(serialized).not.toContain('brand-remix-review-handoff');
    expect(serialized).not.toContain('brand-remix-paused-meta-draft');
    expect(serialized).not.toContain('brand-remix-paused-x-ads-draft');
    expect(serialized).not.toContain('brand-remix.execute');
  });

  it('models generation claim, credit reservation, and per-variant dispatch as nodes', () => {
    const definition = buildBrandRemixGenerateWorkflowDefinition();

    expect(definition.canonicalId).toBe(
      BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS.GENERATE,
    );
    expect(actionIds(definition)).toEqual([
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.GENERATE_CLAIM,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.GENERATE_ADOPT_ORPHANS,
      'workflow.for-each',
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.GENERATE_RESERVE_CREDITS,
      'workflow.for-each',
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.GENERATE_RECONCILE,
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.GENERATE_CLEAR_CLAIM,
    ]);
    const resolveFanOut = definition.definition.nodes.find(
      (node) => node.id === 'resolve-variant-credits',
    );
    const dispatchFanOut = definition.definition.nodes.find(
      (node) => node.id === 'dispatch-variant',
    );
    expect(resolveFanOut?.data.config.parameters).toMatchObject({
      childWorkflowId:
        BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS.GENERATE_RESOLVE_CREDITS,
      mode: 'await',
    });
    expect(dispatchFanOut?.data.config.parameters).toMatchObject({
      childWorkflowId:
        BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS.GENERATE_DISPATCH_VARIANT,
      failureMode: 'collect',
      mode: 'await',
    });
  });

  it('backs every Brand Remix generation node with a registered action contract', () => {
    const ids = [
      ...actionIds(buildBrandRemixGenerateWorkflowDefinition()),
      ...actionIds(buildBrandRemixGenerateResolveCreditsWorkflowDefinition()),
      ...actionIds(buildBrandRemixGenerateDispatchWorkflowDefinition()),
    ];

    expect(ids.every((actionId) => getActionDefinition(actionId))).toBe(true);
  });
});
