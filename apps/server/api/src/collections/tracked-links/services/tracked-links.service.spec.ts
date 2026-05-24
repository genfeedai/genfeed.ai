import { TrackedLinksService } from '@api/collections/tracked-links/services/tracked-links.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('TrackedLinksService', () => {
  const makeService = () => {
    const prisma = {
      brand: {
        findFirst: vi.fn(),
      },
      ingredient: {
        findFirst: vi.fn(),
      },
      trackedLink: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };

    return {
      prisma,
      service: new TrackedLinksService(prisma as unknown as PrismaService),
    };
  };

  it('rejects unsafe redirect URL schemes when creating tracked links', async () => {
    const { prisma, service } = makeService();
    prisma.trackedLink.findFirst.mockResolvedValue(null);

    await expect(
      service.generateTrackingLink(
        {
          platform: 'twitter',
          url: 'javascript:alert(document.cookie)',
        },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trackedLink.create).not.toHaveBeenCalled();
  });

  it('normalizes and stores only HTTP(S) redirect URLs', async () => {
    const { prisma, service } = makeService();
    prisma.trackedLink.findFirst.mockResolvedValue(null);
    prisma.trackedLink.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'link-1', ...data }),
    );

    const link = await service.generateTrackingLink(
      {
        campaignName: 'Launch',
        platform: 'twitter',
        url: 'https://example.com/page',
      },
      'org-1',
    );

    expect(link.originalUrl).toContain('https://example.com/page');
    expect(link.originalUrl).toContain('utm_source=twitter');
  });

  it('rejects unsafe redirect URL updates', async () => {
    const { prisma, service } = makeService();
    prisma.trackedLink.findFirst.mockResolvedValue({
      id: 'link-1',
      organizationId: 'org-1',
    });

    await expect(
      service.update('link-1', 'org-1', {
        originalUrl: 'data:text/html,<script>alert(1)</script>',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trackedLink.update).not.toHaveBeenCalled();
  });

  it('rejects brand IDs outside the authenticated organization', async () => {
    const { prisma, service } = makeService();
    prisma.brand.findFirst.mockResolvedValue(null);

    await expect(
      service.generateTrackingLink(
        {
          brandId: 'foreign-brand',
          platform: 'twitter',
          url: 'https://example.com/page',
        },
        'org-1',
      ),
    ).rejects.toThrow('Brand not found');

    expect(prisma.trackedLink.create).not.toHaveBeenCalled();
  });

  it('rejects content IDs outside the authenticated organization and brand', async () => {
    const { prisma, service } = makeService();
    prisma.brand.findFirst.mockResolvedValue({
      id: 'brand-1',
      organizationId: 'org-1',
    });
    prisma.ingredient.findFirst.mockResolvedValue(null);

    await expect(
      service.generateTrackingLink(
        {
          brandId: 'brand-1',
          contentId: 'foreign-content',
          platform: 'twitter',
          url: 'https://example.com/page',
        },
        'org-1',
      ),
    ).rejects.toThrow('Content not found');

    expect(prisma.trackedLink.create).not.toHaveBeenCalled();
  });
});
