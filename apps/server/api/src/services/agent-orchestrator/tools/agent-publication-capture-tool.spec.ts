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
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
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

async function fixture() {
  const posts = {
    recordExternalPublication: vi.fn().mockResolvedValue(result),
    create: vi.fn(),
  };
  const scopeService = {
    assertBrandAuthorized: vi.fn().mockResolvedValue(undefined),
    assertResourceBrand: vi.fn(),
  };
  const groups = { scheduleTarget: vi.fn(), publish: vi.fn() };
  const credits = { deduct: vi.fn() };
  const generation = { generate: vi.fn() };
  const module = await Test.createTestingModule({
    providers: [
      AgentPublishToolHandler,
      { provide: PostsService, useValue: posts },
      { provide: PostGroupsService, useValue: groups },
      { provide: AgentScopeContextService, useValue: scopeService },
      {
        provide: LoggerService,
        useValue: {
          log: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
        },
      },
      { provide: CreditsUtilsService, useValue: credits },
      { provide: BatchGenerationService, useValue: generation },
    ],
  }).compile();
  return {
    handler: module.get(AgentPublishToolHandler),
    posts,
    scopeService,
    groups,
    credits,
    generation,
  };
}

describe('record_external_publication execution', () => {
  it('dispatches the catalog action into the strict recording handler with no publishing side effects', async () => {
    const f = await fixture();
    // Only the selected family is reachable for this fixture; accidental routing
    // to another handler fails instead of silently providing an alternate path.
    const handlers = { publishHandler: f.handler } as AgentToolDispatchHandlers;
    expect(
      await dispatchRegisteredAgentTool(
        handlers,
        'record_external_publication',
        params,
        ctx,
      ),
    ).toEqual({ success: true, creditsUsed: 0, data: result });
    expect(f.posts.recordExternalPublication).toHaveBeenCalledWith(params, {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(f.posts.create).not.toHaveBeenCalled();
    expect(f.groups.scheduleTarget).not.toHaveBeenCalled();
    expect(f.groups.publish).not.toHaveBeenCalled();
    expect(f.credits.deduct).not.toHaveBeenCalled();
    expect(f.generation.generate).not.toHaveBeenCalled();
  });
  it('authorizes the brand against the authenticated organization before persistence', async () => {
    const f = await fixture();
    await f.handler.recordExternalPublication(params, ctx);
    expect(f.scopeService.assertBrandAuthorized).toHaveBeenCalledWith(
      'brand-1',
      'org-1',
    );
  });
  it('rejects a brand the organization does not own before persistence', async () => {
    const f = await fixture();
    f.scopeService.assertBrandAuthorized.mockRejectedValue(
      new ForbiddenException('Requested brand is not available'),
    );
    await expect(
      f.handler.recordExternalPublication(params, ctx),
    ).rejects.toThrow('not available');
    expect(f.posts.recordExternalPublication).not.toHaveBeenCalled();
  });
  it('rejects a validated thread scope bound to another brand', async () => {
    const f = await fixture();
    f.scopeService.assertResourceBrand.mockImplementation(() => {
      throw new ForbiddenException('outside the validated thread brand scope');
    });
    await expect(
      f.handler.recordExternalPublication(params, {
        ...ctx,
        validatedScope: { brandId: 'other' } as never,
      }),
    ).rejects.toThrow('validated thread brand scope');
    expect(f.posts.recordExternalPublication).not.toHaveBeenCalled();
  });
  it.each(['other', undefined])(
    'rejects context brand %s before persistence',
    async (brandId) => {
      const f = await fixture();
      await expect(
        f.handler.recordExternalPublication(params, { ...ctx, brandId }),
      ).rejects.toThrow();
      expect(f.posts.recordExternalPublication).not.toHaveBeenCalled();
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
    const f = await fixture();
    await expect(
      f.handler.recordExternalPublication(
        { ...params, [field]: 'forged' },
        ctx,
      ),
    ).rejects.toThrow();
    expect(f.posts.recordExternalPublication).not.toHaveBeenCalled();
  });
  it('returns a truthful free replay', async () => {
    const f = await fixture();
    f.posts.recordExternalPublication.mockResolvedValue({
      ...result,
      created: false,
      source: 'api',
      observedVisibility: 'private',
    });
    expect(
      await f.handler.recordExternalPublication(params, ctx),
    ).toMatchObject({
      success: true,
      creditsUsed: 0,
      data: { created: false, source: 'api', observedVisibility: 'private' },
    });
  });
});
