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
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

const params = {
  brandId: testId('brand'),
  postId: testId('post'),
  credentialId: testId('credential'),
};
const ctx: ToolExecutionContext = {
  brandId: params.brandId,
  organizationId: testId('org'),
  userId: testId('user'),
};
const result = {
  postId: params.postId,
  credentialId: params.credentialId,
  analyticsAvailability: 'eligible',
};

async function fixture() {
  const posts = {
    linkExternalPublicationCredential: vi.fn().mockResolvedValue(result),
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

describe('link_external_publication_credential execution', () => {
  it('dispatches the canonical handler for zero credits and no provider or publication effects', async () => {
    const f = await fixture();
    const handlers = { publishHandler: f.handler } as AgentToolDispatchHandlers;
    expect(
      await dispatchRegisteredAgentTool(
        handlers,
        'link_external_publication_credential',
        params,
        ctx,
      ),
    ).toEqual({ success: true, creditsUsed: 0, data: result });
    expect(f.posts.linkExternalPublicationCredential).toHaveBeenCalledWith(
      params,
      {
        brandId: ctx.brandId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
    );
    expect(f.posts.create).not.toHaveBeenCalled();
    expect(f.groups.publish).not.toHaveBeenCalled();
    expect(f.groups.scheduleTarget).not.toHaveBeenCalled();
    expect(f.credits.deduct).not.toHaveBeenCalled();
    expect(f.generation.generate).not.toHaveBeenCalled();
  });
  it.each([
    { ...params, organizationId: 'forged' },
    { ...params, author: { handle: 'forged' } },
    { ...params, postId: 'invalid' },
    { ...params, confirmed: true },
  ])('rejects malformed identity %j', async (invalid) => {
    const f = await fixture();
    await expect(
      f.handler.linkExternalPublicationCredential(invalid, ctx),
    ).rejects.toThrow();
    expect(f.posts.linkExternalPublicationCredential).not.toHaveBeenCalled();
  });
  it('authorizes the brand against the authenticated organization before persistence', async () => {
    const f = await fixture();
    await f.handler.linkExternalPublicationCredential(params, ctx);
    expect(f.scopeService.assertBrandAuthorized).toHaveBeenCalledWith(
      params.brandId,
      ctx.organizationId,
    );
  });
  it('rejects a brand the organization does not own before persistence', async () => {
    const f = await fixture();
    f.scopeService.assertBrandAuthorized.mockRejectedValue(
      new ForbiddenException('Requested brand is not available'),
    );
    await expect(
      f.handler.linkExternalPublicationCredential(params, ctx),
    ).rejects.toThrow('not available');
    expect(f.posts.linkExternalPublicationCredential).not.toHaveBeenCalled();
  });
  it.each([testId('other-brand'), undefined])(
    'rejects foreign or absent authenticated brand %s',
    async (brandId) => {
      const f = await fixture();
      await expect(
        f.handler.linkExternalPublicationCredential(params, {
          ...ctx,
          brandId,
        }),
      ).rejects.toThrow();
      expect(f.posts.linkExternalPublicationCredential).not.toHaveBeenCalled();
    },
  );
});
