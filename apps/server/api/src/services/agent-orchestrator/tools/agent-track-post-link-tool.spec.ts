import { AgentScopeContextService } from '@api/agent-context/agent-scope-context.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { PostLinkTrackingService } from '@api/collections/posts/services/post-link-tracking.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';

const ctx: ToolExecutionContext = {
  brandId: testId('brand'),
  organizationId: testId('org'),
  userId: testId('user'),
};
const input = { brandId: testId('brand'), url: 'https://youtu.be/abc' };
async function fixture() {
  const tracking = {
    trackLink: vi.fn().mockResolvedValue({
      postId: testId('post'),
      created: false,
      analyticsAvailability: 'eligible',
    }),
  };
  const scope = {
    assertBrandAuthorized: vi.fn().mockResolvedValue(undefined),
    assertResourceBrand: vi.fn(),
  };
  const module = await Test.createTestingModule({
    providers: [
      AgentPublishToolHandler,
      { provide: PostsService, useValue: {} },
      { provide: PostGroupsService, useValue: {} },
      { provide: LoggerService, useValue: { log: vi.fn() } },
      { provide: AgentScopeContextService, useValue: scope },
      { provide: PostLinkTrackingService, useValue: tracking },
    ],
  }).compile();
  return { handler: module.get(AgentPublishToolHandler), tracking, scope };
}
describe('track_post_link agent action', () => {
  it('authorizes the brand and uses the same free idempotent importer', async () => {
    const f = await fixture();
    expect(await f.handler.trackPostLink(input, ctx)).toMatchObject({
      success: true,
      creditsUsed: 0,
      data: { postId: testId('post'), created: false },
    });
    expect(f.scope.assertBrandAuthorized).toHaveBeenCalledWith(input.brandId, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
    expect(f.tracking.trackLink).toHaveBeenCalledWith(input, ctx);
  });
  it('rejects a foreign context brand before import', async () => {
    const f = await fixture();
    await expect(
      f.handler.trackPostLink(input, { ...ctx, brandId: testId('other') }),
    ).rejects.toThrow('brand context');
    expect(f.tracking.trackLink).not.toHaveBeenCalled();
  });
  it('rejects a brand not owned by this organization', async () => {
    const f = await fixture();
    f.scope.assertBrandAuthorized.mockRejectedValue(new Error('unavailable'));
    await expect(f.handler.trackPostLink(input, ctx)).rejects.toThrow(
      'unavailable',
    );
    expect(f.tracking.trackLink).not.toHaveBeenCalled();
  });
  it.each(['organizationId', 'userId', 'credentialId', 'source'])(
    'rejects forged %s',
    async (field) => {
      const f = await fixture();
      await expect(
        f.handler.trackPostLink({ ...input, [field]: 'forged' }, ctx),
      ).rejects.toThrow();
      expect(f.tracking.trackLink).not.toHaveBeenCalled();
    },
  );
});
