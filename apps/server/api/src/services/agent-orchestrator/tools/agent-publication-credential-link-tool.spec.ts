import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AgentScopeContextService } from '@api/index';
import { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import {
  type AgentToolDispatchHandlers,
  dispatchRegisteredAgentTool,
} from '@api/services/agent-orchestrator/tools/agent-tool-dispatch.routes';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { TurboRunService } from '@api/services/turbo-run/turbo-run.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

const params = {
  brandId: testId('brand'),
  credentialId: testId('credential'),
  postId: testId('post'),
};
const ctx: ToolExecutionContext = {
  brandId: params.brandId,
  organizationId: testId('org'),
  userId: testId('user'),
};

interface World {
  // Brands each organization owns.
  brandsByOrg: Map<string, Set<string>>;
  // Every write the tool could cause, in order.
  effects: string[];
  links: Array<{ credentialId: string; postId: string; scope: unknown }>;
}

async function fixture(world: World) {
  const effect = (name: string) => async () => {
    world.effects.push(name);
  };
  const module = await Test.createTestingModule({
    providers: [
      AgentPublishToolHandler,
      {
        provide: PostsService,
        useValue: {
          create: effect('post.create'),
          linkExternalPublicationCredential: async (
            input: { credentialId: string; postId: string },
            scope: unknown,
          ) => {
            world.effects.push('post.link');
            world.links.push({
              credentialId: input.credentialId,
              postId: input.postId,
              scope,
            });
            return {
              analyticsAvailability: 'eligible',
              credentialId: input.credentialId,
              postId: input.postId,
            };
          },
        },
      },
      {
        provide: PostGroupsService,
        useValue: {
          publish: effect('group.publish'),
          scheduleTarget: effect('group.schedule'),
        },
      },
      {
        provide: AgentScopeContextService,
        useValue: {
          assertBrandAuthorized: async (
            brandId: string,
            scope: { organizationId: string },
          ) => {
            if (!world.brandsByOrg.get(scope.organizationId)?.has(brandId)) {
              throw new ForbiddenException('Requested brand is not available');
            }
          },
          assertResourceBrand: () => undefined,
        },
      },
      {
        provide: LoggerService,
        useValue: {
          debug: () => {},
          error: () => {},
          log: () => {},
          warn: () => {},
        },
      },
      {
        provide: CreditsUtilsService,
        useValue: { deduct: effect('credits.deduct') },
      },
      { provide: TurboRunService, useValue: { generate: effect('generate') } },
    ],
  }).compile();
  return module.get(AgentPublishToolHandler);
}

describe('link_external_publication_credential execution', () => {
  let world: World;
  let handler: AgentPublishToolHandler;

  beforeEach(async () => {
    world = {
      brandsByOrg: new Map([[ctx.organizationId, new Set([params.brandId])]]),
      effects: [],
      links: [],
    };
    handler = await fixture(world);
  });

  it('links the credential for zero credits with no provider or publication effects', async () => {
    const handlers = { publishHandler: handler } as AgentToolDispatchHandlers;

    await expect(
      dispatchRegisteredAgentTool(
        handlers,
        'link_external_publication_credential',
        params,
        ctx,
      ),
    ).resolves.toEqual({
      creditsUsed: 0,
      data: {
        analyticsAvailability: 'eligible',
        credentialId: params.credentialId,
        postId: params.postId,
      },
      success: true,
    });
    expect(world.links).toEqual([
      {
        credentialId: params.credentialId,
        postId: params.postId,
        scope: {
          brandId: ctx.brandId,
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        },
      },
    ]);
    expect(world.effects).toEqual(['post.link']);
  });

  it.each([
    { ...params, organizationId: 'forged' },
    { ...params, author: { handle: 'forged' } },
    { ...params, postId: 'invalid' },
    { ...params, confirmed: true },
  ])('rejects malformed identity %j', async (invalid) => {
    await expect(
      handler.linkExternalPublicationCredential(invalid, ctx),
    ).rejects.toThrow();
    expect(world.effects).toEqual([]);
  });

  it('rejects a brand the organization does not own before persistence', async () => {
    world.brandsByOrg.set(ctx.organizationId, new Set());

    await expect(
      handler.linkExternalPublicationCredential(params, ctx),
    ).rejects.toThrow('not available');
    expect(world.effects).toEqual([]);
  });

  it('authorizes the brand against the authenticated organization, not another one owning it', async () => {
    world.brandsByOrg = new Map([
      [testId('org', 2), new Set([params.brandId])],
    ]);

    await expect(
      handler.linkExternalPublicationCredential(params, ctx),
    ).rejects.toThrow('not available');
    expect(world.links).toEqual([]);
  });

  it.each([testId('other-brand'), undefined])(
    'rejects foreign or absent authenticated brand %s',
    async (brandId) => {
      await expect(
        handler.linkExternalPublicationCredential(params, { ...ctx, brandId }),
      ).rejects.toThrow();
      expect(world.effects).toEqual([]);
    },
  );
});
