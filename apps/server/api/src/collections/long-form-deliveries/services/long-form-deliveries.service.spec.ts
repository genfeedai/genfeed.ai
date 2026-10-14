import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { ArticlesService } from '@api/collections/articles/services/articles.service';
import { LongFormDeliveriesService } from '@api/collections/long-form-deliveries/services/long-form-deliveries.service';
import type { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import type { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import type { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ArticleStatus, ReleaseStatus } from '@genfeedai/contracts';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

const ctx = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

const UPDATED_AT = new Date('2026-10-01T10:00:00.000Z');

function makeArticle(overrides: Record<string, unknown> = {}) {
  return {
    brandId: 'brand-1',
    content: '<h2>Intro</h2><p>Body</p>',
    id: 'article-1',
    label: 'Launch notes',
    status: 'DRAFT',
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function makeNewsletter(overrides: Record<string, unknown> = {}) {
  return {
    brandId: 'brand-1',
    content: '# Weekly\n\nHello **readers**.',
    id: 'newsletter-1',
    label: 'Weekly issue',
    status: 'approved',
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

describe('LongFormDeliveriesService', () => {
  let prisma: {
    article: { findFirst: ReturnType<typeof vi.fn> };
    credential: { findFirst: ReturnType<typeof vi.fn> };
    newsletter: {
      findFirst: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
  let postGroupsService: {
    create: ReturnType<typeof vi.fn>;
    publishNow: ReturnType<typeof vi.fn>;
  };
  let postGroupPersistenceService: {
    listSourceReleases: ReturnType<typeof vi.fn>;
  };
  let articlesService: { update: ReturnType<typeof vi.fn> };
  let brandAccess: { assert: ReturnType<typeof vi.fn> };
  let newslettersService: {
    findOneScoped: ReturnType<typeof vi.fn>;
    publishScoped: ReturnType<typeof vi.fn>;
  };
  let service: LongFormDeliveriesService;

  beforeEach(() => {
    prisma = {
      article: { findFirst: vi.fn().mockResolvedValue(makeArticle()) },
      credential: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'credential-1', platform: 'GHOST' }),
      },
      newsletter: {
        findFirst: vi.fn().mockResolvedValue({ id: 'newsletter-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    postGroupsService = {
      create: vi
        .fn()
        .mockResolvedValue({ id: 'release-1', status: ReleaseStatus.DRAFT }),
      publishNow: vi.fn().mockResolvedValue({
        id: 'release-1',
        status: ReleaseStatus.SCHEDULED,
      }),
    };
    postGroupPersistenceService = {
      listSourceReleases: vi.fn().mockResolvedValue([]),
    };
    articlesService = { update: vi.fn().mockResolvedValue({}) };
    brandAccess = { assert: vi.fn().mockResolvedValue(undefined) };
    newslettersService = {
      findOneScoped: vi.fn().mockResolvedValue(makeNewsletter()),
      publishScoped: vi.fn().mockResolvedValue({}),
    };
    service = new LongFormDeliveriesService(
      prisma as unknown as PrismaService,
      postGroupsService as unknown as PostGroupsService,
      postGroupPersistenceService as unknown as PostGroupPersistenceService,
      articlesService as unknown as ArticlesService,
      newslettersService as unknown as NewslettersService,
      brandAccess as unknown as BrandAccessService,
    );
  });

  describe('deliverArticle', () => {
    it('queues a one-target release linked to the article, then marks it published', async () => {
      const release = await service.deliverArticle(ctx, 'article-1', {
        credentialId: 'credential-1',
      });

      expect(prisma.article.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            brandId: 'brand-1',
            id: 'article-1',
            isDeleted: false,
            OR: [{ userId: 'user-1' }, { scope: 'ORGANIZATION' }],
            organizationId: 'org-1',
          },
        }),
      );
      expect(prisma.credential.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            brandId: 'brand-1',
            id: 'credential-1',
            isDeleted: false,
            organizationId: 'org-1',
          },
        }),
      );
      expect(postGroupsService.create).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        {
          baseContent: '<h2>Intro</h2><p>Body</p>',
          brandId: 'brand-1',
          idempotencyKey: `article-delivery:article-1:credential-1:${UPDATED_AT.getTime()}`,
          status: ReleaseStatus.DRAFT,
          targets: [{ credentialId: 'credential-1', platform: 'ghost' }],
          timezone: 'UTC',
          title: 'Launch notes',
        },
        undefined,
        { source: 'article', sourceArticleId: 'article-1' },
      );
      expect(postGroupsService.publishNow).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        'release-1',
      );
      expect(articlesService.update).toHaveBeenCalledWith(
        'article-1',
        { status: ArticleStatus.PUBLISHED },
        'user-1',
        'org-1',
        'brand-1',
      );
      expect(release).toEqual({
        id: 'release-1',
        status: ReleaseStatus.SCHEDULED,
      });
    });

    it.each(['WORDPRESS', 'MEDIUM', 'DEVTO'])(
      'accepts a connected %s account',
      async (platform) => {
        prisma.credential.findFirst.mockResolvedValue({
          id: 'credential-1',
          platform,
        });

        await service.deliverArticle(ctx, 'article-1', {
          credentialId: 'credential-1',
        });

        expect(postGroupsService.create).toHaveBeenCalledWith(
          'org-1',
          'user-1',
          expect.objectContaining({
            targets: [
              {
                credentialId: 'credential-1',
                platform: platform.toLowerCase(),
              },
            ],
          }),
          undefined,
          expect.anything(),
        );
      },
    );

    it('refuses a member who is not assigned to the article brand', async () => {
      brandAccess.assert.mockRejectedValue(
        new ForbiddenException('Brand access denied'),
      );

      await expect(
        service.deliverArticle(ctx, 'article-1', {
          credentialId: 'credential-1',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(brandAccess.assert).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
        }),
        'brand-1',
      );
      expect(postGroupsService.create).not.toHaveBeenCalled();
    });

    it('rejects an account that is not a long-form blog', async () => {
      prisma.credential.findFirst.mockResolvedValue({
        id: 'credential-1',
        platform: 'BEEHIIV',
      });

      await expect(
        service.deliverArticle(ctx, 'article-1', {
          credentialId: 'credential-1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(postGroupsService.create).not.toHaveBeenCalled();
      expect(articlesService.update).not.toHaveBeenCalled();
    });

    it('rejects an account outside the article brand', async () => {
      prisma.credential.findFirst.mockResolvedValue(null);

      await expect(
        service.deliverArticle(ctx, 'article-1', {
          credentialId: 'credential-2',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(postGroupsService.create).not.toHaveBeenCalled();
    });

    it('rejects an article without content', async () => {
      prisma.article.findFirst.mockResolvedValue(
        makeArticle({ content: '   ' }),
      );

      await expect(
        service.deliverArticle(ctx, 'article-1', {
          credentialId: 'credential-1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(postGroupsService.create).not.toHaveBeenCalled();
    });

    it('returns 404 for an article the caller cannot publish', async () => {
      prisma.article.findFirst.mockResolvedValue(null);

      await expect(
        service.deliverArticle(ctx, 'article-1', {
          credentialId: 'credential-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns an already-queued replay without publishing it again', async () => {
      prisma.article.findFirst.mockResolvedValue(
        makeArticle({ status: 'PUBLISHED' }),
      );
      postGroupsService.create.mockResolvedValue({
        id: 'release-1',
        status: ReleaseStatus.PUBLISHED,
      });

      const release = await service.deliverArticle(ctx, 'article-1', {
        credentialId: 'credential-1',
      });

      expect(release.status).toBe(ReleaseStatus.PUBLISHED);
      expect(postGroupsService.publishNow).not.toHaveBeenCalled();
      expect(articlesService.update).not.toHaveBeenCalled();
    });
  });

  describe('deliverNewsletter', () => {
    beforeEach(() => {
      prisma.credential.findFirst.mockResolvedValue({
        id: 'credential-1',
        platform: 'BEEHIIV',
      });
    });

    it('sends the rendered issue through Beehiiv and publishes it in the workspace', async () => {
      await service.deliverNewsletter(ctx, 'newsletter-1', {
        credentialId: 'credential-1',
        mode: 'send',
      });

      const [, , input, , provenance] = postGroupsService.create.mock.calls[0];
      expect(input).toEqual(
        expect.objectContaining({
          brandId: 'brand-1',
          status: ReleaseStatus.DRAFT,
          targets: [
            {
              credentialId: 'credential-1',
              platform: 'beehiiv',
              settings: { providerStatus: 'confirmed' },
            },
          ],
          title: 'Weekly issue',
        }),
      );
      expect(input.baseContent).toContain('<strong>readers</strong>');
      expect(provenance).toEqual({
        source: 'newsletter',
        sourceNewsletterId: 'newsletter-1',
      });
      expect(postGroupsService.publishNow).toHaveBeenCalled();
      expect(newslettersService.publishScoped).toHaveBeenCalledWith(
        'newsletter-1',
        ctx,
      );
    });

    it('creates a Beehiiv draft without publishing the workspace issue', async () => {
      await service.deliverNewsletter(ctx, 'newsletter-1', {
        credentialId: 'credential-1',
        mode: 'draft',
      });

      expect(postGroupsService.create).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        expect.objectContaining({
          targets: [
            expect.objectContaining({
              settings: { providerStatus: 'draft' },
            }),
          ],
        }),
        undefined,
        expect.anything(),
      );
      expect(postGroupsService.publishNow).toHaveBeenCalled();
      expect(newslettersService.publishScoped).not.toHaveBeenCalled();
    });

    it('schedules the send and records the send time', async () => {
      const scheduledDate = new Date(Date.now() + 86_400_000).toISOString();
      postGroupsService.create.mockResolvedValue({
        id: 'release-1',
        status: ReleaseStatus.SCHEDULED,
      });

      await service.deliverNewsletter(ctx, 'newsletter-1', {
        credentialId: 'credential-1',
        mode: 'schedule',
        scheduledDate,
      });

      expect(postGroupsService.create).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        expect.objectContaining({
          scheduledDate,
          status: ReleaseStatus.SCHEDULED,
        }),
        undefined,
        expect.anything(),
      );
      expect(postGroupsService.publishNow).not.toHaveBeenCalled();
      expect(newslettersService.publishScoped).not.toHaveBeenCalled();
      expect(prisma.newsletter.updateMany).toHaveBeenCalledWith({
        data: { scheduledFor: new Date(scheduledDate) },
        where: {
          id: 'newsletter-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('rejects a schedule in the past', async () => {
      await expect(
        service.deliverNewsletter(ctx, 'newsletter-1', {
          credentialId: 'credential-1',
          mode: 'schedule',
          scheduledDate: '2020-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(postGroupsService.create).not.toHaveBeenCalled();
    });

    it('rejects a blog account for a newsletter', async () => {
      prisma.credential.findFirst.mockResolvedValue({
        id: 'credential-1',
        platform: 'GHOST',
      });

      await expect(
        service.deliverNewsletter(ctx, 'newsletter-1', {
          credentialId: 'credential-1',
          mode: 'send',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(postGroupsService.create).not.toHaveBeenCalled();
    });
  });

  describe('list deliveries', () => {
    it('flattens the targets of every release linked to the article', async () => {
      postGroupPersistenceService.listSourceReleases.mockResolvedValue([
        { targets: [{ id: 'target-2' }] },
        { targets: [{ id: 'target-1' }] },
      ]);

      await expect(
        service.listArticleDeliveries(
          {
            brandId: 'brand-1',
            organizationId: 'org-1',
            ownerUserId: 'user-1',
          },
          'article-1',
        ),
      ).resolves.toEqual([{ id: 'target-2' }, { id: 'target-1' }]);
      expect(prisma.article.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          brandId: 'brand-1',
          id: 'article-1',
          isDeleted: false,
          OR: [{ userId: 'user-1' }, { scope: 'ORGANIZATION' }],
          organizationId: 'org-1',
        },
      });
      expect(
        postGroupPersistenceService.listSourceReleases,
      ).toHaveBeenCalledWith(prisma, 'org-1', { articleId: 'article-1' });
    });

    it('hides deliveries of a private article owned by a teammate', async () => {
      prisma.article.findFirst.mockResolvedValue(null);

      await expect(
        service.listArticleDeliveries(
          {
            brandId: 'brand-1',
            organizationId: 'org-1',
            ownerUserId: 'user-1',
          },
          'article-2',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(
        postGroupPersistenceService.listSourceReleases,
      ).not.toHaveBeenCalled();
    });

    it('lets a superadmin organization override read without the ownership filter', async () => {
      await service.listArticleDeliveries(
        { organizationId: 'org-2' },
        'article-1',
      );

      expect(prisma.article.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: { id: 'article-1', isDeleted: false, organizationId: 'org-2' },
      });
      expect(
        postGroupPersistenceService.listSourceReleases,
      ).toHaveBeenCalledWith(prisma, 'org-2', { articleId: 'article-1' });
    });

    it('returns 404 for a newsletter in another organization', async () => {
      prisma.newsletter.findFirst.mockResolvedValue(null);

      await expect(
        service.listNewsletterDeliveries('org-1', 'newsletter-2'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.newsletter.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          id: 'newsletter-2',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
      expect(
        postGroupPersistenceService.listSourceReleases,
      ).not.toHaveBeenCalled();
    });
  });
});
