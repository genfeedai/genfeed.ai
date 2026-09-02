vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return {
    ...canonicalPrismaMock(),
    toPrismaJson: (value: unknown) => value,
  };
});

import type { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { RssSourcesService } from '@api/collections/rss-sources/services/rss-sources.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ReleaseStatus,
  RssApprovalMode,
  RssFeedItemStatus,
  RssImportPolicy,
} from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const context = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

const channel = {
  credentialId: 'cred_x',
  platform: 'twitter',
  signatureId: 'sig-1',
};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    approvalMode: RssApprovalMode.APPROVAL,
    brandId: 'brand-1',
    createdAt: new Date('2026-08-19T00:00:00.000Z'),
    failedCount: 0,
    feedUrl: 'https://example.com/feed.xml',
    id: 'rss-1',
    importedCount: 0,
    importPolicy: RssImportPolicy.DRAFT,
    isDeleted: false,
    isEnabled: true,
    label: 'Industry feed',
    lastError: null,
    lastPolledAt: null,
    organizationId: 'org-1',
    skippedCount: 0,
    targetChannels: [channel],
    timezone: 'UTC',
    updatedAt: new Date('2026-08-19T00:00:00.000Z'),
    userId: 'user-1',
    ...overrides,
  };
}

const feedXml = `
<rss version="2.0">
  <channel>
    <item>
      <title>Launch notes</title>
      <link>https://example.com/launch</link>
      <guid>guid-1</guid>
      <description>Ship the loop.</description>
    </item>
  </channel>
</rss>
`;

describe('RssSourcesService', () => {
  const rssSource = {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  };
  const rssFeedItem = {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  };
  const postingSignature = {
    findMany: vi.fn(),
  };
  const prisma = {
    postingSignature,
    rssFeedItem,
    rssSource,
  };
  const postGroupsService = {
    create: vi.fn(),
    publishNow: vi.fn(),
  };

  let service: RssSourcesService;

  async function executeWorkflow() {
    const request = { ...context, sourceId: 'rss-1' };
    try {
      const discovered = await service.fetchWorkflowItems(request);
      const results = [];
      for (const item of discovered.items) {
        const claim = await service.claimWorkflowItem(item);
        if (!claim.shouldImport) {
          results.push({
            result: await service.finalizeWorkflowItem(item, claim),
          });
          continue;
        }
        const release = await service.createWorkflowRelease(claim);
        if (release.shouldPublish) {
          await service.publishWorkflowRelease(release);
        }
        results.push({
          result: await service.finalizeWorkflowItem(item, release),
        });
      }
      return service.finalizeWorkflowSource(request, { results });
    } catch (error: unknown) {
      return service.finalizeWorkflowSource(request, undefined, error);
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    rssSource.create.mockImplementation(async ({ data }) =>
      makeRow({ ...data, id: 'rss-1' }),
    );
    rssSource.findFirst.mockResolvedValue(makeRow());
    rssSource.findMany.mockResolvedValue([makeRow()]);
    rssSource.count.mockResolvedValue(1);
    rssSource.update.mockImplementation(async ({ data }) => makeRow(data));
    rssFeedItem.findFirst.mockResolvedValue(null);
    rssFeedItem.create.mockResolvedValue({
      id: 'item-1',
      status: RssFeedItemStatus.PENDING,
    });
    rssFeedItem.update.mockResolvedValue({});
    postingSignature.findMany.mockResolvedValue([
      {
        body: 'Built with Genfeed.',
        id: 'sig-1',
        isEnabled: true,
        platforms: ['twitter'],
      },
    ]);
    postGroupsService.create.mockResolvedValue({ id: 'release-1' });
    postGroupsService.publishNow.mockResolvedValue({ id: 'release-1' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => feedXml,
      }),
    );
    service = new RssSourcesService(
      prisma as unknown as PrismaService,
      postGroupsService as unknown as PostGroupsService,
    );
  });

  it('creates a tenant-scoped RSS source', async () => {
    const created = await service.createScoped(
      {
        feedUrl: 'https://example.com/feed.xml',
        label: 'Industry feed',
        targetChannels: [channel],
      },
      context,
    );

    expect(rssSource.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brandId: 'brand-1',
          label: 'Industry feed',
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      }),
    );
    expect(created.organizationId).toBe('org-1');
    expect(created.targetChannels).toEqual([channel]);
  });

  it('lists and reads through organization + isDeleted scope', async () => {
    await service.findAllScoped(context, { page: 1, limit: 10 } as never);
    await service.findOneScoped('rss-1', context);

    expect(rssSource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: scopedWhere('org-1', {}),
      }),
    );
    expect(rssSource.findFirst).toHaveBeenCalledWith({
      where: scopedWhere('org-1', { id: 'rss-1' }),
    });
  });

  it("does not return another organization's RSS source", async () => {
    rssSource.findFirst.mockResolvedValue(null);

    await expect(
      service.findOneScoped('rss-1', {
        ...context,
        organizationId: 'org-foreign',
      }),
    ).rejects.toThrow("RSS source with identifier 'rss-1' not found");
  });

  it('soft-deletes instead of hard-deleting', async () => {
    await service.removeScoped('rss-1', context);

    expect(rssSource.update).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: scopedWhere('org-1', { id: 'rss-1' }),
    });
  });

  it('imports a new feed item as a draft when approval is required', async () => {
    await executeWorkflow();

    expect(postGroupsService.create).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        baseContent: 'Ship the loop.\n\nhttps://example.com/launch',
        rssFeedItemId: 'item-1',
        rssSourceId: 'rss-1',
        status: ReleaseStatus.DRAFT,
        title: 'Launch notes',
      }),
      'rss-1:guid-1',
      { source: 'rss' },
    );
    expect(postGroupsService.publishNow).not.toHaveBeenCalled();
    expect(rssFeedItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          postGroupId: 'release-1',
          status: RssFeedItemStatus.IMPORTED,
        }),
        where: scopedWhere('org-1', { id: 'item-1' }),
      }),
    );
  });

  it('skips items that are already imported', async () => {
    rssFeedItem.findFirst.mockResolvedValue({
      id: 'item-1',
      status: RssFeedItemStatus.IMPORTED,
    });

    await executeWorkflow();

    expect(postGroupsService.create).not.toHaveBeenCalled();
    expect(rssSource.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          skippedCount: { increment: 1 },
        }),
      }),
    );
  });

  it('schedules auto imports five minutes out', async () => {
    rssSource.findFirst.mockResolvedValue(
      makeRow({
        approvalMode: RssApprovalMode.AUTO,
        importPolicy: RssImportPolicy.SCHEDULED,
      }),
    );

    await executeWorkflow();

    expect(postGroupsService.create).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      expect.objectContaining({
        status: ReleaseStatus.SCHEDULED,
        scheduledDate: expect.stringMatching(/Z$/),
      }),
      'rss-1:guid-1',
      { source: 'rss' },
    );
  });

  it('publishes immediately when policy is PUBLISH_NOW and AUTO', async () => {
    rssSource.findFirst.mockResolvedValue(
      makeRow({
        approvalMode: RssApprovalMode.AUTO,
        importPolicy: RssImportPolicy.PUBLISH_NOW,
      }),
    );

    await executeWorkflow();

    expect(postGroupsService.publishNow).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'release-1',
    );
  });

  it('records fetch failures without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => '',
      }),
    );

    const result = await executeWorkflow();

    expect(result.lastError).toContain('502');
    expect(postGroupsService.create).not.toHaveBeenCalled();
  });
});
