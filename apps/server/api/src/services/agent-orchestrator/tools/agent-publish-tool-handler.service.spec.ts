import { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { CreateReleaseGroupInput } from '@api-types/contracts/scheduler.contract';
import {
  CredentialPlatform,
  IngredientCategory,
  PostVisibility,
  ReleaseStatus,
} from '@genfeedai/enums';
import { describe, expect, it, vi } from 'vitest';

function scopedContext(brandId: string): ToolExecutionContext {
  return {
    brandId,
    organizationId: 'org-1',
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
  const handler = new AgentPublishToolHandler(
    postGroupsService as never,
    { create: vi.fn(), findOne: vi.fn() } as never,
    { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
    ingredientsService,
    credentialsService,
    agentScopeContextService as never,
  );

  return {
    agentScopeContextService,
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
        confirmed: true,
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
      scopedContext('brand-1'),
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
        confirmed: true,
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
      scopedContext('brand-1'),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('YouTube does not support image media.');
    expect(postGroupsService.create).not.toHaveBeenCalled();
  });
});
