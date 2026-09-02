import type { CreateReleaseGroupInput } from '@api-types/contracts/scheduler.contract';
import {
  AgentAutonomyMode,
  AgentPublishDecision,
  CredentialPlatform,
  IngredientCategory,
  PostVisibility,
  ReleaseStatus,
} from '@genfeedai/enums';
import { AgentToolName } from '@genfeedai/interfaces';
import { AgentPublishToolHandler } from '@server/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import type { ToolExecutionContext } from '@server/services/agent-orchestrator/tools/agent-tool-executor.service';
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
        toolName: AgentToolName.CREATE_POST,
      }),
    ),
    set: vi.fn().mockResolvedValue(true),
  };
  const handler = new AgentPublishToolHandler(
    postGroupsService as never,
    { create: vi.fn(), findOne: vi.fn() } as never,
    { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
    ingredientsService,
    credentialsService,
    agentScopeContextService as never,
    undefined,
    undefined,
    agentStrategiesService as never,
    agentPublishAuditsService as never,
    cacheService as never,
  );

  return {
    agentPublishAuditsService,
    agentScopeContextService,
    agentStrategiesService,
    cacheService,
    credentialsService,
    handler,
    ingredientsService,
    postGroupsService,
  };
}

describe('AgentPublishToolHandler per-channel review', () => {
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
      toolName: AgentToolName.CREATE_POST,
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
});
