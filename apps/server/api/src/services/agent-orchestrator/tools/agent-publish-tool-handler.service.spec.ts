import { runWithActionOrigin } from '@api/index';
import { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  ActionOrigin,
  AgentAutonomyMode,
  AgentPublishDecision,
  CredentialPlatform,
  IngredientCategory,
  PostVisibility,
  ReleaseStatus,
} from '@genfeedai/contracts';
import { evaluateAgentPublishPolicy } from '@genfeedai/contracts/api-types/contracts/agent-publish-policy.contract';
import type { CreateReleaseGroupInput } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';

import { describe, expect, it, vi } from 'vitest';

function confirmedContext(brandId: string): ToolExecutionContext {
  return { ...scopedContext(brandId), confirmationOrigin: 'thread-ui-action' };
}

function scopedContext(brandId: string): ToolExecutionContext {
  return {
    brandId,
    organizationId: 'org-1',
    runId: 'run-1',
    strategyId: 'strategy-1',
    threadId: 'thread-1',
    userId: 'user-1',
    validatedScope: {
      brandId,
      contextVersion: 1,
      isLegacyFallback: false,
      isVersionExplicit: true,
      organizationId: 'org-1',
      source: 'explicit',
      threadId: 'thread-1',
      userId: 'user-1',
    },
  };
}

function createHandler() {
  const postGroupsService = {
    create: vi
      .fn()
      .mockImplementation(
        (
          organizationId: string,
          _userId: string,
          input: CreateReleaseGroupInput,
        ) =>
          Promise.resolve({
            id: 'release-1',
            organizationId,
            status: input.status,
            targets: input.targets.map((target, index) => ({
              executionState: 'draft',
              id: `target-${index + 1}`,
              platform: target.platform,
            })),
          }),
      ),
    publishNow: vi.fn().mockResolvedValue({
      id: 'release-1',
      organizationId: 'org-1',
      status: ReleaseStatus.SCHEDULED,
      targets: [
        { executionState: 'scheduled', id: 'target-1', platform: 'linkedin' },
        { executionState: 'scheduled', id: 'target-2', platform: 'twitter' },
      ],
    }),
  };
  const ingredientsService = {
    findOne: vi.fn(),
  };
  const credentialsService = {
    find: vi.fn(),
  };
  const agentScopeContextService = {
    assertConsequentialBoundary: vi.fn().mockResolvedValue(undefined),
    assertResourceBrand: vi.fn(),
  };
  const agentStrategiesService = {
    findOne: vi.fn().mockResolvedValue({
      autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
      publishPolicy: { autoPublishEnabled: true },
    }),
  };
  const agentPublishAuditsService = {
    createAudit: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  };
  // Server-owned confirmation cache backing `verifyPendingToolConfirmation`
  // (`agent-tool-pending-confirmation.util.ts`). Resolves a pending
  // confirmation matching whatever `sourceActionId` the caller requested so
  // existing card-confirmed tests keep passing without asserting on cache
  // internals; tests exercising rejection override `get` per-call.
  const cacheService = {
    get: vi.fn().mockImplementation((key: string) =>
      Promise.resolve({
        organizationId: 'org-1',
        sourceActionId: key.split(':').pop(),
        threadId: 'thread-1',
        toolName: 'create_post',
      }),
    ),
    set: vi.fn().mockResolvedValue(true),
  };
  const mediaReadinessService = {
    evaluatePublishReadiness: vi.fn().mockResolvedValue({
      checkedAt: '2026-09-19T10:00:00.000Z',
      diagnostics: [],
      isBlocked: false,
    }),
  };
  const postsService = { create: vi.fn(), findOne: vi.fn() };
  const autonomousPolicy = {
    assessMediaForPolicy: vi.fn().mockResolvedValue(undefined),
    resolveForTarget: vi
      .fn()
      .mockImplementation(
        async (input: { channelAllowsAutoPublish: boolean }) => {
          const strategy = await agentStrategiesService.findOne();
          return {
            autonomyMode: strategy.autonomyMode,
            result: evaluateAgentPublishPolicy({
              autonomyMode: strategy.autonomyMode,
              brandAllowsAutoPublish: strategy.publishPolicy.autoPublishEnabled,
              channelAllowsAutoPublish: input.channelAllowsAutoPublish,
            }),
          };
        },
      ),
    resolveForPost: vi.fn().mockResolvedValue({
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      result: evaluateAgentPublishPolicy({
        autonomyMode: AgentAutonomyMode.SUPERVISED,
        brandAllowsAutoPublish: false,
        channelAllowsAutoPublish: false,
      }),
    }),
  };
  const batchGenerationService = {
    createManualReviewBatch: vi.fn().mockResolvedValue({ id: 'review' }),
  };
  const handler = new AgentPublishToolHandler(
    postGroupsService as never,
    postsService as never,
    { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
    ingredientsService,
    credentialsService,
    agentScopeContextService as never,
    undefined,
    undefined,
    agentStrategiesService as never,
    agentPublishAuditsService as never,
    cacheService as never,
    mediaReadinessService as never,
    autonomousPolicy as never,
    batchGenerationService as never,
  );

  return {
    autonomousPolicy,
    batchGenerationService,
    agentPublishAuditsService,
    agentScopeContextService,
    agentStrategiesService,
    cacheService,
    credentialsService,
    handler,
    ingredientsService,
    mediaReadinessService,
    postGroupsService,
    postsService,
  };
}

describe('AgentPublishToolHandler per-channel review', () => {
  it('rejects another brand before preparing connected account details', async () => {
    const {
      agentScopeContextService,
      cacheService,
      credentialsService,
      handler,
      ingredientsService,
    } = createHandler();
    ingredientsService.findOne.mockResolvedValue({
      brandId: 'brand-2',
      category: IngredientCategory.IMAGE,
      id: 'ingredient-2',
    });
    credentialsService.find.mockResolvedValue([
      { id: 'other-brand-account', platform: 'LINKEDIN' },
    ]);
    agentScopeContextService.assertResourceBrand.mockImplementation(() => {
      throw new Error(
        'selected content is outside the validated thread brand scope.',
      );
    });

    await expect(
      handler.preparePost(
        { contentId: 'ingredient-2' },
        scopedContext('brand-1'),
      ),
    ).rejects.toThrow('outside the validated thread brand scope');
    expect(agentScopeContextService.assertResourceBrand).toHaveBeenCalledWith(
      scopedContext('brand-1').validatedScope,
      'brand-2',
      'selected content',
    );
    expect(credentialsService.find).not.toHaveBeenCalled();
    expect(cacheService.set).not.toHaveBeenCalled();
  });

  it('attaches structured target proposals to the publish review card', async () => {
    const { credentialsService, handler, ingredientsService } = createHandler();
    ingredientsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      id: 'ingredient-1',
    });
    credentialsService.find.mockResolvedValue([
      { id: 'cred-linkedin', platform: 'LINKEDIN' },
      { id: 'cred-twitter', platform: 'twitter' },
    ]);

    const result = await handler.buildPublishCardResult(
      {
        caption: 'Ship this now',
        contentId: 'ingredient-1',
        platforms: ['linkedin', 'twitter'],
        visibility: PostVisibility.PUBLIC,
      },
      scopedContext('brand-1'),
    );

    expect(result.success).toBe(true);
    expect(result.nextActions?.[0]).toEqual(
      expect.objectContaining({
        contentId: 'ingredient-1',
        platforms: ['linkedin', 'twitter'],
        targets: expect.arrayContaining([
          expect.objectContaining({
            credentialId: 'cred-linkedin',
            label: 'LinkedIn',
            platform: CredentialPlatform.LINKEDIN,
            settings: expect.objectContaining({ visibility: 'PUBLIC' }),
          }),
          expect.objectContaining({
            credentialId: 'cred-twitter',
            label: 'X (Twitter)',
            platform: CredentialPlatform.TWITTER,
          }),
        ]),
        type: 'publish_post_card',
      }),
    );
  });

  it('marks a YouTube image proposal with a target-specific capability blocker', async () => {
    const { credentialsService, handler, ingredientsService } = createHandler();
    ingredientsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      category: 'image',
      id: 'ingredient-1',
    });
    credentialsService.find.mockResolvedValue([
      { id: 'cred-youtube', platform: CredentialPlatform.YOUTUBE },
    ]);

    const result = await handler.buildPublishCardResult(
      {
        caption: 'Launch clip',
        contentId: 'ingredient-1',
        platforms: ['youtube'],
        visibility: PostVisibility.PUBLIC,
      },
      scopedContext('brand-1'),
    );

    const youtube = result.nextActions?.[0]?.targets?.find(
      (target) => target.platform === CredentialPlatform.YOUTUBE,
    );
    expect(youtube?.blockers.map((blocker) => blocker.message)).toEqual(
      expect.arrayContaining(['YouTube does not support image media.']),
    );
  });

  it('sends canonical validated target payloads to the scheduler on confirm', async () => {
    const {
      credentialsService,
      handler,
      ingredientsService,
      postGroupsService,
    } = createHandler();
    ingredientsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      id: 'ingredient-1',
    });
    credentialsService.find.mockResolvedValue([
      { id: 'cred-linkedin', platform: CredentialPlatform.LINKEDIN },
      { id: 'cred-twitter', platform: CredentialPlatform.TWITTER },
    ]);

    const result = await handler.createPost(
      {
        caption: 'Shared caption',
        contentId: 'ingredient-1',
        sourceActionId: 'publish-card-1',
        targets: [
          {
            caption: 'LinkedIn version',
            credentialId: 'cred-linkedin',
            platform: 'linkedin',
            settings: { visibility: 'PUBLIC' },
            visibility: PostVisibility.PUBLIC,
          },
          {
            caption: 'X version',
            credentialId: 'cred-twitter',
            platform: 'twitter',
            settings: { replyPolicy: 'mentioned' },
            visibility: PostVisibility.PUBLIC,
          },
        ],
      },
      confirmedContext('brand-1'),
    );

    expect(result.success).toBe(true);
    expect(postGroupsService.create).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        baseContent: 'Shared caption',
        targets: [
          expect.objectContaining({
            caption: 'LinkedIn version',
            credentialId: 'cred-linkedin',
            platform: CredentialPlatform.LINKEDIN,
            settings: expect.objectContaining({ visibility: 'PUBLIC' }),
          }),
          expect.objectContaining({
            caption: 'X version',
            credentialId: 'cred-twitter',
            platform: CredentialPlatform.TWITTER,
            settings: expect.objectContaining({ replyPolicy: 'mentioned' }),
          }),
        ],
      }),
      expect.stringMatching(/^agent-publish:/),
      expect.objectContaining({ sourceActionId: 'publish-card-1' }),
    );
    expect(postGroupsService.publishNow).toHaveBeenCalled();
  });

  it('applies posting-set provenance and signature attachments on schedule mutation', async () => {
    const {
      credentialsService,
      handler,
      ingredientsService,
      postGroupsService,
    } = createHandler();
    ingredientsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      id: 'ingredient-1',
    });
    credentialsService.find.mockResolvedValue([
      { id: 'cred-twitter', platform: 'twitter' },
    ]);

    const result = await handler.createPost(
      {
        caption: 'Launch copy',
        contentId: 'ingredient-1',
        postingSetId: 'set-launch',
        sourceActionId: 'publish-card-1',
        targets: [
          {
            attachments: [
              {
                body: '— Genfeed',
                kind: 'signature',
                order: 0,
                platform: 'twitter',
              },
            ],
            credentialId: 'cred-twitter',
            platform: 'twitter',
            signatureIds: ['sig-twitter'],
          },
        ],
        timezone: 'Europe/Malta',
      },
      confirmedContext('brand-1'),
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        autoPublishPolicyId: 'supervised.require_approval',
        postingSetId: 'set-launch',
      }),
    );
    expect(postGroupsService.create).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        postingSetId: 'set-launch',
        targets: [
          expect.objectContaining({
            attachments: [
              expect.objectContaining({
                body: '— Genfeed',
                kind: 'signature',
              }),
            ],
            credentialId: 'cred-twitter',
          }),
        ],
        timezone: 'Europe/Malta',
      }),
      expect.stringMatching(/^agent-publish:/),
      expect.objectContaining({
        autoPublishPolicyId: 'supervised.require_approval',
        postingSetId: 'set-launch',
      }),
    );
  });

  it('rejects confirmation when a selected target violates channel capabilities', async () => {
    const {
      credentialsService,
      handler,
      ingredientsService,
      postGroupsService,
    } = createHandler();
    ingredientsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      id: 'ingredient-1',
    });
    credentialsService.find.mockResolvedValue([
      { id: 'cred-youtube', platform: CredentialPlatform.YOUTUBE },
    ]);

    const result = await handler.createPost(
      {
        caption: 'Launch clip',
        contentId: 'ingredient-1',
        sourceActionId: 'publish-card-1',
        targets: [
          {
            credentialId: 'cred-youtube',
            platform: 'youtube',
            settings: { madeForKids: false, privacyStatus: 'private' },
          },
        ],
      },
      confirmedContext('brand-1'),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('YouTube does not support image media.');
    expect(postGroupsService.create).not.toHaveBeenCalled();
  });

  it('maps Prisma SCREAMING credential platforms onto release targets', async () => {
    const {
      credentialsService,
      handler,
      ingredientsService,
      postGroupsService,
    } = createHandler();
    ingredientsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      id: 'ingredient-1',
    });
    credentialsService.find.mockResolvedValue([
      { id: 'cred-1', platform: 'TWITTER' },
    ]);

    const result = await handler.createPost(
      {
        caption: 'Launch post',
        contentId: 'ingredient-1',
        sourceActionId: 'action-1',
        targets: [
          {
            credentialId: 'cred-1',
            platform: 'twitter',
            visibility: PostVisibility.PUBLIC,
          },
        ],
      },
      confirmedContext('brand-1'),
    );

    expect(result.success).toBe(true);
    expect(postGroupsService.create).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        targets: [
          expect.objectContaining({
            credentialId: 'cred-1',
            platform: CredentialPlatform.TWITTER,
          }),
        ],
      }),
      expect.any(String),
      expect.any(Object),
    );
    expect(
      postGroupsService.create.mock.calls[0]?.[2].targets[0].platform,
    ).toBe('twitter');
  });

  it('writes a permitted audit and publishes when autonomy, brand, and channel allow it', async () => {
    const {
      agentPublishAuditsService,
      credentialsService,
      handler,
      ingredientsService,
      postGroupsService,
    } = createHandler();
    ingredientsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      id: 'ingredient-1',
    });
    credentialsService.find.mockResolvedValue([
      { id: 'cred-1', isConnected: true, platform: 'TWITTER' },
    ]);

    const result = await handler.createPost(
      {
        caption: 'Launch post',
        contentId: 'ingredient-1',
        sourceActionId: 'action-1',
        targets: [
          {
            credentialId: 'cred-1',
            platform: 'twitter',
            visibility: PostVisibility.PUBLIC,
          },
        ],
      },
      confirmedContext('brand-1'),
    );

    expect(result.success).toBe(true);
    expect(postGroupsService.publishNow).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'release-1',
    );
    expect(agentPublishAuditsService.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
        decision: AgentPublishDecision.PERMITTED,
        postGroupId: 'release-1',
      }),
    );
  });

  it('blocks an off-spec asset before the release is created', async () => {
    const {
      credentialsService,
      handler,
      ingredientsService,
      mediaReadinessService,
      postGroupsService,
    } = createHandler();
    ingredientsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      category: IngredientCategory.VIDEO,
      id: 'ingredient-1',
    });
    credentialsService.find.mockResolvedValue([
      { id: 'cred-1', isConnected: true, platform: 'TWITTER' },
    ]);
    mediaReadinessService.evaluatePublishReadiness.mockResolvedValue({
      checkedAt: '2026-09-19T10:00:00.000Z',
      diagnostics: [
        {
          actual: '1200s',
          assetId: 'ingredient-1',
          code: 'media_duration_above_maximum',
          kind: 'video',
          limit: 'maximum 140s',
          message: 'twitter: Duration 1200s exceeds the maximum of 140s.',
          platform: CredentialPlatform.TWITTER,
          property: 'duration',
          severity: 'error',
        },
      ],
      isBlocked: true,
    });

    const result = await handler.createPost(
      {
        caption: 'Launch post',
        contentId: 'ingredient-1',
        sourceActionId: 'action-1',
        targets: [
          {
            credentialId: 'cred-1',
            platform: 'twitter',
            visibility: PostVisibility.PUBLIC,
          },
        ],
      },
      confirmedContext('brand-1'),
    );

    expect(mediaReadinessService.evaluatePublishReadiness).toHaveBeenCalledWith(
      {
        assetIds: ['ingredient-1'],
        organizationId: 'org-1',
        platforms: [CredentialPlatform.TWITTER],
      },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('1200s');
    expect(postGroupsService.create).not.toHaveBeenCalled();
    expect(postGroupsService.publishNow).not.toHaveBeenCalled();
  });

  it('publishes but surfaces warning diagnostics on the publish card', async () => {
    const {
      credentialsService,
      handler,
      ingredientsService,
      mediaReadinessService,
      postGroupsService,
    } = createHandler();
    ingredientsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      id: 'ingredient-1',
    });
    credentialsService.find.mockResolvedValue([
      { id: 'cred-1', isConnected: true, platform: 'TWITTER' },
    ]);
    const warning = {
      actual: '4:1',
      assetId: 'ingredient-1',
      code: 'media_aspect_ratio_out_of_tolerance',
      kind: 'image',
      limit: '16:9 (±10%)',
      message: 'twitter: Aspect ratio 4:1 is outside the accepted ratios.',
      platform: CredentialPlatform.TWITTER,
      property: 'aspectRatio',
      severity: 'warning',
    };
    mediaReadinessService.evaluatePublishReadiness.mockResolvedValue({
      checkedAt: '2026-09-19T10:00:00.000Z',
      diagnostics: [warning],
      isBlocked: false,
    });

    const result = await handler.createPost(
      {
        caption: 'Launch post',
        contentId: 'ingredient-1',
        sourceActionId: 'action-1',
        targets: [
          {
            credentialId: 'cred-1',
            platform: 'twitter',
            visibility: PostVisibility.PUBLIC,
          },
        ],
      },
      confirmedContext('brand-1'),
    );

    expect(result.success).toBe(true);
    expect(postGroupsService.create).toHaveBeenCalled();
    expect(result.data).toEqual(
      expect.objectContaining({ mediaDiagnostics: [warning] }),
    );
  });

  it('does not publish when policy denies auto-publish and returns an approval next action', async () => {
    const {
      agentPublishAuditsService,
      agentStrategiesService,
      credentialsService,
      handler,
      ingredientsService,
      postGroupsService,
    } = createHandler();
    agentStrategiesService.findOne.mockResolvedValue({
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      publishPolicy: { autoPublishEnabled: true },
    });
    ingredientsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      id: 'ingredient-1',
    });
    credentialsService.find.mockResolvedValue([
      { id: 'cred-1', isConnected: true, platform: 'TWITTER' },
    ]);

    const result = await handler.createPost(
      {
        caption: 'Launch post',
        contentId: 'ingredient-1',
        sourceActionId: 'action-1',
        targets: [
          {
            credentialId: 'cred-1',
            platform: 'twitter',
            visibility: PostVisibility.PUBLIC,
          },
        ],
      },
      confirmedContext('brand-1'),
    );

    expect(result.success).toBe(true);
    expect(postGroupsService.publishNow).not.toHaveBeenCalled();
    expect(result.data).toEqual(
      expect.objectContaining({ requiredAction: 'approval' }),
    );
    expect(result.nextActions?.[0]).toEqual(
      expect.objectContaining({
        requiresConfirmation: true,
        title: 'Publish requires approval',
        type: 'publish_post_card',
      }),
    );
    expect(agentPublishAuditsService.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        autonomyMode: AgentAutonomyMode.SUPERVISED,
        decision: AgentPublishDecision.DENIED,
      }),
    );
  });
});

describe('AgentPublishToolHandler server-owned confirmation (#4306)', () => {
  it('renders a publish card instead of scheduling when the model forges confirmed:true without a card', async () => {
    const {
      credentialsService,
      handler,
      ingredientsService,
      postGroupsService,
    } = createHandler();
    ingredientsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      id: 'ingredient-1',
    });
    credentialsService.find.mockResolvedValue([
      { id: 'cred-1', isConnected: true, platform: 'TWITTER' },
    ]);

    const result = await handler.createPost(
      {
        caption: 'Launch post',
        confirmed: true,
        contentId: 'ingredient-1',
        platforms: ['twitter'],
        scheduledAt: '2026-09-10T12:00:00.000Z',
        sourceActionId: 'forged-action-id',
      },
      scopedContext('brand-1'),
    );

    expect(result.success).toBe(true);
    expect(result.nextActions?.[0]).toEqual(
      expect.objectContaining({
        requiresConfirmation: true,
        type: 'publish_post_card',
      }),
    );
    expect(postGroupsService.create).not.toHaveBeenCalled();
    expect(postGroupsService.publishNow).not.toHaveBeenCalled();
  });

  it('publishes when the card-button resume presents a verified sourceActionId', async () => {
    const {
      cacheService,
      credentialsService,
      handler,
      ingredientsService,
      postGroupsService,
    } = createHandler();
    ingredientsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      id: 'ingredient-1',
    });
    credentialsService.find.mockResolvedValue([
      { id: 'cred-1', isConnected: true, platform: 'TWITTER' },
    ]);
    cacheService.get.mockResolvedValueOnce({
      organizationId: 'org-1',
      sourceActionId: 'verified-action-id',
      threadId: 'thread-1',
      toolName: 'create_post',
    });

    const result = await handler.createPost(
      {
        caption: 'Launch post',
        contentId: 'ingredient-1',
        sourceActionId: 'verified-action-id',
        targets: [
          {
            credentialId: 'cred-1',
            platform: 'twitter',
            visibility: PostVisibility.PUBLIC,
          },
        ],
      },
      confirmedContext('brand-1'),
    );

    expect(result.success).toBe(true);
    expect(postGroupsService.create).toHaveBeenCalled();
  });

  it('rejects publishing when sourceActionId does not match a persisted confirmation', async () => {
    const {
      cacheService,
      credentialsService,
      handler,
      ingredientsService,
      postGroupsService,
    } = createHandler();
    ingredientsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      id: 'ingredient-1',
    });
    credentialsService.find.mockResolvedValue([
      { id: 'cred-1', isConnected: true, platform: 'TWITTER' },
    ]);
    cacheService.get.mockResolvedValueOnce(null);

    const result = await handler.createPost(
      {
        caption: 'Launch post',
        contentId: 'ingredient-1',
        sourceActionId: 'unknown-action-id',
        targets: [
          {
            credentialId: 'cred-1',
            platform: 'twitter',
            visibility: PostVisibility.PUBLIC,
          },
        ],
      },
      confirmedContext('brand-1'),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      'sourceActionId does not match a persisted publish card.',
    );
    expect(postGroupsService.create).not.toHaveBeenCalled();
  });

  it('rejects confirmed:true on the MCP surface without publishing', async () => {
    const { handler, postGroupsService, postsService } = createHandler();

    const result = await runWithActionOrigin(
      { origin: ActionOrigin.MCP },
      async () => {
        const direct = await handler.createPost(
          {
            confirmed: true,
            content: 'Draft text',
            contentId: 'ingredient-1',
            platforms: ['twitter'],
          },
          scopedContext('brand-1'),
        );
        const prepared = await handler.preparePost(
          {
            confirmed: true,
            contentId: 'ingredient-1',
            platforms: ['twitter'],
          },
          scopedContext('brand-1'),
        );
        return { direct, prepared };
      },
    );

    expect(result.direct).toEqual(
      expect.objectContaining({
        creditsUsed: 0,
        error: expect.stringContaining('create_scheduled_release'),
        success: false,
      }),
    );
    expect(result.prepared).toEqual(
      expect.objectContaining({
        creditsUsed: 0,
        error: expect.stringContaining('create_scheduled_release'),
        success: false,
      }),
    );
    expect(result.prepared.nextActions).toBeUndefined();
    expect(postGroupsService.create).not.toHaveBeenCalled();
    expect(postGroupsService.publishNow).not.toHaveBeenCalled();
    expect(postsService.create).not.toHaveBeenCalled();
  });

  it('keeps the in-app confirmation card when confirmed:true is not an MCP call', async () => {
    const {
      credentialsService,
      handler,
      ingredientsService,
      postGroupsService,
    } = createHandler();
    ingredientsService.findOne.mockResolvedValue({
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
      id: 'ingredient-1',
    });
    credentialsService.find.mockResolvedValue([
      { id: 'cred-1', isConnected: true, platform: 'TWITTER' },
    ]);

    const result = await runWithActionOrigin(
      { origin: ActionOrigin.AGENT },
      () =>
        handler.createPost(
          {
            caption: 'Launch post',
            confirmed: true,
            contentId: 'ingredient-1',
            platforms: ['twitter'],
            sourceActionId: 'forged-action-id',
          },
          scopedContext('brand-1'),
        ),
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.nextActions?.[0]).toEqual(
      expect.objectContaining({
        requiresConfirmation: true,
        type: 'publish_post_card',
      }),
    );
    expect(postGroupsService.create).not.toHaveBeenCalled();
    expect(postGroupsService.publishNow).not.toHaveBeenCalled();
  });
});

describe('proactive publishing review boundary', () => {
  it('retains scheduled supervised content as a draft and links the same posts to review', async () => {
    const h = createHandler();
    h.agentStrategiesService.findOne.mockResolvedValue({
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      publishPolicy: { autoPublishEnabled: true },
    });
    h.ingredientsService.findOne.mockResolvedValue({
      id: 'ingredient-1',
      brandId: 'brand-1',
      category: IngredientCategory.IMAGE,
    });
    h.credentialsService.find.mockResolvedValue([
      { id: 'cred-1', isConnected: true, platform: 'TWITTER' },
    ]);
    const result = await h.handler.createPost(
      {
        contentId: 'ingredient-1',
        caption: 'Review me',
        platforms: ['twitter'],
        scheduledAt: '2030-01-01T10:00:00Z',
      },
      { ...scopedContext('brand-1'), isProactive: true },
    );
    expect(result.success).toBe(true);
    expect(h.autonomousPolicy.resolveForTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        brandId: 'brand-1',
        strategyId: 'strategy-1',
        credentialId: 'cred-1',
      }),
    );
    expect(h.postGroupsService.create).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        status: ReleaseStatus.DRAFT,
        targets: [expect.objectContaining({ platform: 'twitter' })],
      }),
      expect.any(String),
      expect.any(Object),
    );
    const target = h.postGroupsService.create.mock.calls[0]?.[2].targets[0];
    expect(target?.scheduledAt).toBeUndefined();
    expect(h.postGroupsService.publishNow).not.toHaveBeenCalled();
    expect(
      h.batchGenerationService.createManualReviewBatch,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        agentStrategyId: 'strategy-1',
        items: [
          expect.objectContaining({
            postId: 'target-1',
            workflowExecutionId: 'run-1',
          }),
        ],
      }),
      'user-1',
      'org-1',
      expect.stringContaining('agent-review:'),
    );
  });
  it('denies rescheduling a supervised strategy post before calling the scheduler', async () => {
    const h = createHandler();
    h.postsService.findOne.mockResolvedValue({
      id: 'post-1',
      brandId: 'brand-1',
      groupId: 'group-1',
    });
    const result = await h.handler.schedulePost(
      { postId: 'post-1', scheduledAt: '2030-01-01T10:00:00Z' },
      { ...scopedContext('brand-1'), isProactive: true },
    );
    expect(result.success).toBe(false);
    expect(result.data).toEqual({ id: 'post-1', requiredAction: 'approval' });
  });
});

it('creates proactive text as canonical channel targets and review items, never standalone drafts', async () => {
  const f = createHandler();
  f.agentStrategiesService.findOne.mockResolvedValue({
    autonomyMode: AgentAutonomyMode.SUPERVISED,
    publishPolicy: { autoPublishEnabled: true },
  });
  f.credentialsService.find.mockResolvedValue([
    { id: 'cred', isConnected: true, platform: 'TWITTER' },
  ]);
  const result = await f.handler.createPost(
    { content: 'A scoped text draft.', platform: 'twitter' },
    { ...scopedContext('brand-1'), isProactive: true },
  );
  expect(result.success).toBe(true);
  expect(f.postsService.create).not.toHaveBeenCalled();
  expect(f.postGroupsService.create).toHaveBeenCalledWith(
    'org-1',
    'user-1',
    expect.objectContaining({
      brandId: 'brand-1',
      status: ReleaseStatus.DRAFT,
      media: [],
    }),
    expect.any(String),
    expect.objectContaining({
      agentStrategyId: 'strategy-1',
      workflowExecutionId: 'run-1',
    }),
  );
  expect(f.batchGenerationService.createManualReviewBatch).toHaveBeenCalledWith(
    expect.objectContaining({
      items: [
        expect.objectContaining({ postId: 'target-1', platform: 'twitter' }),
      ],
    }),
    'user-1',
    'org-1',
    expect.any(String),
  );
  expect(f.postGroupsService.publishNow).not.toHaveBeenCalled();
});

describe('authorized proactive text draft constraint', () => {
  function constrainedHandler() {
    const f = createHandler();
    f.credentialsService.find.mockResolvedValue([
      { id: 'credential', isConnected: true, platform: 'LINKEDIN' },
    ]);
    return {
      ...f,
      ctx: {
        ...scopedContext('brand-1'),
        isProactive: true,
        proactiveTextDraftOnly: true as const,
      },
    };
  }

  it('keeps canonical targets unscheduled and review-bound when current policy permits publishing', async () => {
    const f = constrainedHandler();
    const result = await f.handler.createPost(
      {
        content: 'Draft under the admitted supervised run.',
        platforms: ['linkedin'],
        scheduledAt: '2099-01-01T10:00:00Z',
      },
      f.ctx,
    );
    expect(result).toMatchObject({
      success: true,
      data: { requiredAction: 'approval', postIds: ['target-1'] },
    });
    expect(f.autonomousPolicy.resolveForTarget).toHaveBeenCalledOnce();
    const release = f.postGroupsService.create.mock.calls[0][2];
    expect(release.status).toBe(ReleaseStatus.DRAFT);
    expect(release).not.toHaveProperty('scheduledDate');
    expect(release.targets[0].scheduledDate).toBeUndefined();
    expect(
      f.batchGenerationService.createManualReviewBatch,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        agentStrategyId: 'strategy-1',
        items: [
          expect.objectContaining({
            postId: 'target-1',
            platform: 'linkedin',
            workflowExecutionId: 'run-1',
          }),
        ],
      }),
      'user-1',
      'org-1',
      expect.any(String),
    );
    expect(f.agentPublishAuditsService.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        autonomyMode: AgentAutonomyMode.SUPERVISED,
        decision: AgentPublishDecision.DENIED,
        workflowExecutionId: 'run-1',
      }),
    );
    expect(f.postGroupsService.publishNow).not.toHaveBeenCalled();
    expect(f.postsService.create).not.toHaveBeenCalled();
  });

  it.each([ReleaseStatus.SCHEDULED, ReleaseStatus.PUBLISHED])(
    'refuses an incompatible idempotent %s release',
    async (status) => {
      const f = constrainedHandler();
      f.postGroupsService.create.mockResolvedValue({
        id: 'release-1',
        organizationId: 'org-1',
        status,
        targets: [
          { executionState: 'scheduled', id: 'target-1', platform: 'linkedin' },
        ],
      });
      const result = await f.handler.createPost(
        { content: 'Draft', platforms: ['linkedin'] },
        f.ctx,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('existing release');
      expect(f.agentPublishAuditsService.createAudit).not.toHaveBeenCalled();
      expect(
        f.batchGenerationService.createManualReviewBatch,
      ).not.toHaveBeenCalled();
      expect(f.postGroupsService.publishNow).not.toHaveBeenCalled();
    },
  );

  it('retains release and review idempotency keys across same-run retries', async () => {
    const f = constrainedHandler();
    const params = {
      content: 'Same authorized draft',
      platforms: ['linkedin'],
    };
    await f.handler.createPost(params, f.ctx);
    await f.handler.createPost(params, f.ctx);
    const releaseKeys = f.postGroupsService.create.mock.calls.map(
      (call) => call[2].idempotencyKey,
    );
    const reviewKeys =
      f.batchGenerationService.createManualReviewBatch.mock.calls.map(
        (call) => call[3],
      );
    expect(releaseKeys[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(releaseKeys[1]).toBe(releaseKeys[0]);
    expect(reviewKeys).toEqual([
      `agent-review:${releaseKeys[0]}`,
      `agent-review:${releaseKeys[0]}`,
    ]);
    expect(f.postGroupsService.publishNow).not.toHaveBeenCalled();
  });

  it('preserves the unflagged policy path', async () => {
    const f = constrainedHandler();
    const { proactiveTextDraftOnly: _constraint, ...ctx } = f.ctx;
    expect(
      (
        await f.handler.createPost(
          { content: 'Unconstrained existing path', platforms: ['linkedin'] },
          ctx,
        )
      ).success,
    ).toBe(true);
    expect(f.postGroupsService.publishNow).toHaveBeenCalledOnce();
    expect(
      f.batchGenerationService.createManualReviewBatch,
    ).not.toHaveBeenCalled();
  });

  const invalidInputs: Array<[string, Record<string, unknown>]> = [
    ['blank text', { content: '   ', platforms: ['linkedin'] }],
    ['no platforms', { content: 'Draft' }],
    ['unsupported platform', { content: 'Draft', platforms: ['unsupported'] }],
    ['unconnected platform', { content: 'Draft', platforms: ['twitter'] }],
    [
      'invalid schedule',
      { content: 'Draft', platforms: ['linkedin'], scheduledAt: 'tomorrow' },
    ],
    [
      'past schedule',
      {
        content: 'Draft',
        platforms: ['linkedin'],
        scheduledAt: '2000-01-01T10:00:00Z',
      },
    ],
    [
      'invalid visibility',
      { content: 'Draft', platforms: ['linkedin'], visibility: 'corrupt' },
    ],
    [
      'foreign selected credential',
      {
        content: 'Draft',
        targets: [{ platform: 'linkedin', credentialId: 'foreign' }],
      },
    ],
  ];
  it.each(invalidInputs)(
    'rejects %s before draft/review/publish writes',
    async (_name, params) => {
      const f = constrainedHandler();
      expect((await f.handler.createPost(params, f.ctx)).success).toBe(false);
      expect(f.postGroupsService.create).not.toHaveBeenCalled();
      expect(
        f.batchGenerationService.createManualReviewBatch,
      ).not.toHaveBeenCalled();
      expect(f.postGroupsService.publishNow).not.toHaveBeenCalled();
    },
  );

  it('rejects a connected platform that cannot accept text-only content', async () => {
    const f = constrainedHandler();
    f.credentialsService.find.mockResolvedValue([
      { id: 'instagram-credential', isConnected: true, platform: 'INSTAGRAM' },
    ]);
    expect(
      (
        await f.handler.createPost(
          { content: 'Text only', platforms: ['instagram'] },
          f.ctx,
        )
      ).success,
    ).toBe(false);
    expect(f.postGroupsService.create).not.toHaveBeenCalled();
    expect(
      f.batchGenerationService.createManualReviewBatch,
    ).not.toHaveBeenCalled();
    expect(f.postGroupsService.publishNow).not.toHaveBeenCalled();
  });
  it('requires a connected credential within the current tenant and brand', async () => {
    const f = constrainedHandler();
    f.credentialsService.find.mockResolvedValue([]);
    expect(
      (
        await f.handler.createPost(
          { content: 'Draft', platforms: ['linkedin'] },
          f.ctx,
        )
      ).success,
    ).toBe(false);
    expect(f.credentialsService.find).toHaveBeenCalledWith({
      brandId: 'brand-1',
      organizationId: 'org-1',
      isDeleted: false,
      isConnected: true,
      platform: { in: ['linkedin'] },
    });
    expect(f.postGroupsService.create).not.toHaveBeenCalled();
    expect(
      f.batchGenerationService.createManualReviewBatch,
    ).not.toHaveBeenCalled();
    expect(f.postGroupsService.publishNow).not.toHaveBeenCalled();
  });
});
