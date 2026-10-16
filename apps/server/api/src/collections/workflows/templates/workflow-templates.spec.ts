import { listSystemWorkflowCatalog } from '@api/collections/workflows/system-workflow-catalog';
import { ENGINE_VERIFIED_TEMPLATE_IDS } from '@api/collections/workflows/templates/__fixtures__/engine-verified-template-ids';
import { SHOWCASE_WORKFLOW_TEMPLATE_IDS } from '@api/collections/workflows/templates/showcase-workflow-template-ids';
import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import { describe, expect, it } from 'vitest';

const UNRESOLVED_TEMPLATE_PLACEHOLDER = /\$\{[^}]+\}/;

describe('WorkflowTemplates engine-verified starters', () => {
  it('ranks only the showcase set, in showcase order (#5510)', () => {
    const ranked = Object.values(WORKFLOW_TEMPLATES)
      .flatMap((template) =>
        typeof template.featuredRank === 'number'
          ? [[template.id, template.featuredRank] as const]
          : [],
      )
      .sort((left, right) => left[1] - right[1]);

    expect(ranked).toEqual(
      SHOWCASE_WORKFLOW_TEMPLATE_IDS.map(
        (templateId, index) => [templateId, index + 1] as const,
      ),
    );
    expect(new Set(ranked.map(([templateId]) => templateId)).size).toBe(
      ranked.length,
    );
  });

  it('keeps showcase templates out of the system catalog', () => {
    const systemIds = new Set(
      listSystemWorkflowCatalog().map((entry) => entry.canonicalId),
    );

    for (const templateId of SHOWCASE_WORKFLOW_TEMPLATE_IDS) {
      expect(systemIds.has(templateId)).toBe(false);
      expect(WORKFLOW_TEMPLATES[templateId]?.name.length).toBeGreaterThan(0);
    }
  });

  it('are complete graphs with wired edges and no unresolved placeholders', () => {
    for (const templateId of ENGINE_VERIFIED_TEMPLATE_IDS) {
      const template = WORKFLOW_TEMPLATES[templateId];

      expect(template?.id).toBe(templateId);
      expect(template?.nodes?.length).toBeGreaterThan(0);
      expect(template?.edges?.length).toBeGreaterThan(0);
      expect(JSON.stringify(template?.nodes)).not.toMatch(
        UNRESOLVED_TEMPLATE_PLACEHOLDER,
      );
    }
  });

  it('never carry featuredRank on system catalog entries', () => {
    const rankedCatalogEntries = listSystemWorkflowCatalog()
      .filter((entry) => 'featuredRank' in entry)
      .map((entry) => entry.canonicalId);

    expect(rankedCatalogEntries).toEqual([]);
  });
});

describe('WorkflowTemplates', () => {
  it('includes the draft-only Instagram remix template with a review gate', () => {
    const template = WORKFLOW_TEMPLATES['instagram-remix-review'];

    expect(template?.isScheduleEnabled).toBe(false);
    expect(template?.nodes?.map((node) => node.type)).toEqual([
      'genfeedAction',
      'reviewGate',
    ]);
    expect(template?.edges).toEqual([
      expect.objectContaining({
        source: 'generate-instagram-remix',
        target: 'review-instagram-remix',
      }),
    ]);
  });

  it('includes the X landscape avatar starter in the public template registry', () => {
    expect(WORKFLOW_TEMPLATES).toHaveProperty('avatar-ugc-x-landscape-heygen');
  });

  it('includes the real-estate workflow starters in the public template registry', () => {
    expect(WORKFLOW_TEMPLATES).toHaveProperty('virtual-staging-rescue');
    expect(WORKFLOW_TEMPLATES).toHaveProperty('floor-plan-interior-preview');
  });

  it('includes the on-demand launch-kit template with a review gate and no schedule', () => {
    const launchKit = WORKFLOW_TEMPLATES['launch-kit'];

    expect(launchKit?.name).toBe('Launch Kit');
    expect(launchKit?.category).toBe('launch');
    // On-demand, not a scheduled daily routine.
    expect(launchKit?.isScheduleEnabled).toBeFalsy();
    expect(launchKit?.schedule).toBeUndefined();
    expect(launchKit?.routine).toBeUndefined();

    const nodeTypes = (launchKit?.nodes ?? []).map((node) => node.type);
    const actionIds = (launchKit?.nodes ?? []).map(
      (node) => node.data.config.actionId,
    );
    expect(nodeTypes).toContain('reviewGate');
    expect(actionIds).toContain('promptConstructor');
    expect(actionIds).toContain('workflow.collect-output');
  });

  it('includes the weekly brand AI content loop with source collection and post image attachment', () => {
    const template = WORKFLOW_TEMPLATES['weekly-brand-ai-content-loop'];

    expect(template?.name).toBe('Weekly Brand AI Content Loop');
    expect(template?.category).toBe('content');
    expect(template?.schedule).toBe('0 9 * * 1');

    const actionIds = new Set(
      (template?.nodes ?? []).map((node) => node.data.config.actionId),
    );
    expect(actionIds).toContain('sourceCorpus');
    expect(actionIds).toContain('newsletterGen');
    expect(actionIds).toContain('postGen');
    expect(actionIds).toContain('imageGen');
    expect(actionIds).toContain('attachPostIngredient');

    expect(
      template?.nodes.find((node) => node.id === 'x-post-draft')?.data.config
        .parameters,
    ).toMatchObject({ platform: 'twitter' });

    expect(template?.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'image-ingredient',
          sourceHandle: 'id',
          target: 'attach-image-to-post',
          targetHandle: 'ingredientId',
        }),
        expect.objectContaining({
          source: 'x-post-draft',
          sourceHandle: 'id',
          target: 'attach-image-to-post',
          targetHandle: 'postId',
        }),
      ]),
    );
  });

  it('includes productized daily routine templates with review and tracking metadata', () => {
    const dailyTrendLoop = WORKFLOW_TEMPLATES['daily-trend-loop'];
    const releaseLoop = WORKFLOW_TEMPLATES['release-loop'];

    expect(dailyTrendLoop?.name).toBe('Daily Trend Loop');
    expect(releaseLoop?.name).toBe('Release Loop');

    for (const template of [dailyTrendLoop, releaseLoop]) {
      expect(template).toMatchObject({
        category: 'routines',
        isScheduleEnabled: true,
        routine: {
          cadence: 'daily',
          kind: 'productized-daily-routine',
          parentIssue: 224,
          reviewDefaults: {
            requireApproval: true,
            reviewState: 'pending_approval',
          },
          sourceIssue: 976,
          version: 1,
        },
        timezone: 'UTC',
      });
      expect(template?.inputVariables?.length).toBeGreaterThan(0);
      expect(template?.routine?.requiredSkills.length).toBeGreaterThan(0);
      expect(template?.routine?.recommendedSkills.length).toBeGreaterThan(0);
      expect(template?.routine?.trackingTasks.length).toBeGreaterThan(0);
      expect(template?.routine?.outputDestinations.length).toBeGreaterThan(0);
      expect(template?.schedule).toMatch(/\* \* \*/);
    }
  });
});
