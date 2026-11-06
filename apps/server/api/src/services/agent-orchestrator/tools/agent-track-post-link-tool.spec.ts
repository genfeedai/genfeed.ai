import { AgentScopeContextService } from '@api/agent-context/agent-scope-context.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostLinkTrackingService } from '@api/collections/posts/services/post-link-tracking.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { AgentAnalyticsToolHandler } from '@api/services/agent-orchestrator/tools/agent-analytics-tool-handler.service';
import { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { testId } from '@helpers/testing/test-id.helper';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

type TrackedLink = {
  brandId: string;
  organizationId: string;
  url: string;
  userId: string;
};

const ctx: ToolExecutionContext = {
  brandId: testId('brand'),
  organizationId: testId('org'),
  userId: testId('user'),
};
const input = { brandId: testId('brand'), url: 'https://youtu.be/abc' };

async function fixture() {
  // Brands the scope service treats as owned, keyed by brand id -> org id.
  const brandOwners = new Map([[testId('brand'), testId('org')]]);
  const tracked: TrackedLink[] = [];
  const tracking = {
    trackLink: async (
      link: { brandId: string; url: string },
      owner: { brandId: string; organizationId: string; userId: string },
    ) => {
      tracked.push({ ...owner, url: link.url });
      return {
        analyticsAvailability: 'eligible',
        created: false,
        postId: `post-for-${link.url}`,
      };
    },
  };
  const scope = {
    assertBrandAuthorized: async (
      brandId: string,
      params: { organizationId: string },
    ) => {
      if (brandOwners.get(brandId) !== params.organizationId) {
        throw new ForbiddenException('Brand is unavailable');
      }
    },
    assertResourceBrand: () => undefined,
  };
  const module = await Test.createTestingModule({
    providers: [
      AgentAnalyticsToolHandler,
      { provide: AgentPublishToolHandler, useValue: {} },
      { provide: PostsService, useValue: {} },
      { provide: AnalyticsService, useValue: {} },
      { provide: PostAnalyticsService, useValue: {} },
      { provide: AgentScopeContextService, useValue: scope },
      { provide: PostLinkTrackingService, useValue: tracking },
    ],
  }).compile();
  return {
    brandOwners,
    handler: module.get(AgentAnalyticsToolHandler),
    tracked,
  };
}

describe('track_post_link agent action', () => {
  it('imports the link for the authorized brand through the free idempotent importer', async () => {
    const f = await fixture();
    expect(await f.handler.trackPostLink(input, ctx)).toMatchObject({
      success: true,
      creditsUsed: 0,
      data: { postId: 'post-for-https://youtu.be/abc', created: false },
    });
    expect(f.tracked).toEqual([
      {
        brandId: testId('brand'),
        organizationId: testId('org'),
        url: 'https://youtu.be/abc',
        userId: testId('user'),
      },
    ]);
  });

  it('rejects a foreign context brand before import', async () => {
    const f = await fixture();
    await expect(
      f.handler.trackPostLink(input, { ...ctx, brandId: testId('other') }),
    ).rejects.toThrow('brand context');
    expect(f.tracked).toEqual([]);
  });

  it('rejects a brand not owned by this organization', async () => {
    const f = await fixture();
    f.brandOwners.set(testId('brand'), testId('other-org'));
    await expect(f.handler.trackPostLink(input, ctx)).rejects.toThrow(
      'unavailable',
    );
    expect(f.tracked).toEqual([]);
  });

  it.each(['organizationId', 'userId', 'credentialId', 'source'])(
    'rejects forged %s',
    async (field) => {
      const f = await fixture();
      await expect(
        f.handler.trackPostLink({ ...input, [field]: 'forged' }, ctx),
      ).rejects.toThrow();
      expect(f.tracked).toEqual([]);
    },
  );
});
