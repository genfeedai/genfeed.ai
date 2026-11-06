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
import type { ValidatedAgentScope } from '@genfeedai/contracts/interfaces';
import type { ExtensionPublicationCaptureResult } from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

const params = {
  brandId: 'brand-1',
  platform: 'twitter',
  publicationKind: 'post',
  url: 'https://x.com/alice/status/123',
  description: '',
  publicationDate: '2026-01-01T00:00:00.000Z',
};
const ctx: ToolExecutionContext = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};
const result: ExtensionPublicationCaptureResult = {
  postId: 'post-1',
  created: true,
  source: 'extension',
  externalId: '123',
  url: 'https://twitter.com/alice/status/123',
  contextUrl: null,
  urlKind: 'permalink',
  credentialId: null,
  analyticsAvailability: 'missing-credential',
  observedVisibility: 'unknown',
  urlIdentity: { kind: 'platform-publication-id', value: '123' },
};

type Recording = { input: unknown; scope: unknown };

async function fixture() {
  const world = {
    authorizations: [] as unknown[],
    // Every side effect other than recording lands here; it must stay empty.
    effects: [] as string[],
    ownedBrands: new Set(['org-1:brand-1']),
    recordings: [] as Recording[],
    replay: result,
  };
  const effect = (name: string) => async () => {
    world.effects.push(name);
  };
  const module = await Test.createTestingModule({
    providers: [
      AgentPublishToolHandler,
      {
        provide: PostsService,
        useValue: {
          create: effect('posts.create'),
          recordExternalPublication: async (input: unknown, scope: unknown) => {
            world.recordings.push({ input, scope });
            return world.replay;
          },
        },
      },
      {
        provide: PostGroupsService,
        useValue: {
          publish: effect('groups.publish'),
          scheduleTarget: effect('groups.scheduleTarget'),
        },
      },
      {
        provide: AgentScopeContextService,
        useValue: {
          assertBrandAuthorized: async (
            brandId: string,
            principal: { organizationId: string },
          ) => {
            world.authorizations.push({ brandId, principal });
            if (
              !world.ownedBrands.has(`${principal.organizationId}:${brandId}`)
            ) {
              throw new ForbiddenException('Requested brand is not available');
            }
          },
          assertResourceBrand: (
            scope: ValidatedAgentScope,
            resourceBrandId: string,
          ) => {
            if (scope.brandId !== resourceBrandId) {
              throw new ForbiddenException(
                'External publication is outside the validated thread brand scope.',
              );
            }
          },
        },
      },
      {
        provide: LoggerService,
        useValue: {
          debug: () => undefined,
          error: () => undefined,
          log: () => undefined,
          warn: () => undefined,
        },
      },
      {
        provide: CreditsUtilsService,
        useValue: { deduct: effect('credits.deduct') },
      },
      {
        provide: TurboRunService,
        useValue: { generate: effect('generation.generate') },
      },
    ],
  }).compile();
  return { handler: module.get(AgentPublishToolHandler), world };
}

describe('record_external_publication execution', () => {
  it('dispatches the catalog action into the strict recording handler with no publishing side effects', async () => {
    const { handler, world } = await fixture();
    // Only the selected family is reachable for this fixture; accidental routing
    // to another handler fails instead of silently providing an alternate path.
    const handlers = { publishHandler: handler } as AgentToolDispatchHandlers;

    await expect(
      dispatchRegisteredAgentTool(
        handlers,
        'record_external_publication',
        params,
        ctx,
      ),
    ).resolves.toEqual({ success: true, creditsUsed: 0, data: result });
    expect(world.recordings).toEqual([
      {
        input: params,
        scope: {
          brandId: 'brand-1',
          organizationId: 'org-1',
          userId: 'user-1',
        },
      },
    ]);
    expect(world.effects).toEqual([]);
  });

  it('authorizes the brand against the authenticated organization before persistence', async () => {
    const { handler, world } = await fixture();

    await handler.recordExternalPublication(params, ctx);

    expect(world.authorizations).toEqual([
      {
        brandId: 'brand-1',
        principal: { organizationId: 'org-1', userId: 'user-1' },
      },
    ]);
  });

  it('rejects a brand the organization does not own before persistence', async () => {
    const { handler, world } = await fixture();
    world.ownedBrands.clear();

    await expect(
      handler.recordExternalPublication(params, ctx),
    ).rejects.toThrow('not available');
    expect(world.recordings).toEqual([]);
  });

  it('rejects a validated thread scope bound to another brand', async () => {
    const { handler, world } = await fixture();

    await expect(
      handler.recordExternalPublication(params, {
        ...ctx,
        validatedScope: { brandId: 'other' } as ValidatedAgentScope,
      }),
    ).rejects.toThrow('validated thread brand scope');
    expect(world.recordings).toEqual([]);
  });

  it.each(['other', undefined])(
    'rejects context brand %s before persistence',
    async (brandId) => {
      const { handler, world } = await fixture();

      await expect(
        handler.recordExternalPublication(params, { ...ctx, brandId }),
      ).rejects.toThrow();
      expect(world.recordings).toEqual([]);
    },
  );

  it.each([
    'organizationId',
    'userId',
    'source',
    'status',
    'credentialId',
    'confirmed',
    'receipt',
  ])('rejects forged body field %s', async (field) => {
    const { handler, world } = await fixture();

    await expect(
      handler.recordExternalPublication({ ...params, [field]: 'forged' }, ctx),
    ).rejects.toThrow();
    expect(world.recordings).toEqual([]);
  });

  it('returns a truthful free replay', async () => {
    const { handler, world } = await fixture();
    world.replay = {
      ...result,
      created: false,
      observedVisibility: 'private',
      source: 'api',
    };

    await expect(
      handler.recordExternalPublication(params, ctx),
    ).resolves.toMatchObject({
      creditsUsed: 0,
      data: { created: false, observedVisibility: 'private', source: 'api' },
      success: true,
    });
  });
});
