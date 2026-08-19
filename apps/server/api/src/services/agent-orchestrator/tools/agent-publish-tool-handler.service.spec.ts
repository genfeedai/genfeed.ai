import { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import {
  CredentialPlatform,
  IngredientCategory,
  PostVisibility,
} from '@genfeedai/enums';
import { AgentScopeContextService } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

describe('AgentPublishToolHandler', () => {
  it('maps Prisma SCREAMING credential platforms onto release targets', async () => {
    const postGroupsService = {
      create: vi.fn().mockResolvedValue({
        id: 'release-1',
        targets: [{ id: 'post-1' }],
      }),
      publishNow: vi.fn().mockResolvedValue({
        id: 'release-1',
        targets: [{ id: 'post-1' }],
      }),
    };
    const handler = new AgentPublishToolHandler(
      postGroupsService as never,
      { create: vi.fn(), findOne: vi.fn() } as never,
      { error: vi.fn() } as unknown as LoggerService,
    );

    const result = await handler.publishConfirmedContent({
      caption: 'Launch post',
      contentId: 'ingredient-1',
      credentials: [
        {
          id: 'cred-1',
          platform: 'TWITTER',
        },
      ],
      ctx: {
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      },
      ingredient: {
        brandId: 'brand-1',
        category: IngredientCategory.IMAGE,
      },
      platforms: ['twitter'],
      sourceActionId: 'action-1',
      visibility: PostVisibility.PUBLIC,
    });

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

  it('lists domain platforms from Prisma SCREAMING credentials on the publish card', async () => {
    const handler = new AgentPublishToolHandler(
      { create: vi.fn() } as never,
      { create: vi.fn(), findOne: vi.fn() } as never,
      { error: vi.fn() } as unknown as LoggerService,
      {
        findOne: vi.fn().mockResolvedValue({
          brandId: 'brand-1',
          category: IngredientCategory.IMAGE,
          id: 'ingredient-1',
        }),
      },
      {
        find: vi
          .fn()
          .mockResolvedValue([{ id: 'cred-1', platform: 'INSTAGRAM' }]),
      },
      {
        assertConsequentialBoundary: vi.fn(),
        assertResourceBrand: vi.fn(),
      } as unknown as AgentScopeContextService,
    );

    const result = await handler.buildPublishCardResult(
      {
        contentId: 'ingredient-1',
        visibility: PostVisibility.PUBLIC,
      },
      {
        organizationId: 'org-1',
        threadId: 'thread-1',
        userId: 'user-1',
      },
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        availablePlatforms: [CredentialPlatform.INSTAGRAM],
      }),
    );
    expect(
      (result.data as { availablePlatforms: string[] }).availablePlatforms[0],
    ).toBe('instagram');
  });
});
