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
        updateMany: vi.fn(),
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

  it('rejects bracketed IPv6 loopback redirect URLs', async () => {
    const { prisma, service } = makeService();
    prisma.trackedLink.findFirst.mockResolvedValue(null);

    await expect(
      service.generateTrackingLink(
        {
          platform: 'twitter',
          url: 'https://[::1]/callback',
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

  // SSRF / open-redirect: isBlockedRedirectHost must catch IPv6 forms that map
  // to or expand into loopback / link-local / unique-local ranges.
  it.each([
    'https://[::ffff:127.0.0.1]/callback', // IPv4-mapped IPv6 loopback (dotted)
    'https://[::ffff:7f00:1]/callback', // IPv4-mapped IPv6 loopback (hex)
    'https://[0:0:0:0:0:0:0:1]/callback', // fully expanded loopback
    'https://[fe80::1]/callback', // link-local
    'https://[fc00::1]/callback', // unique-local
  ])('rejects internal-network IPv6 redirect target %s', async (url) => {
    const { prisma, service } = makeService();
    prisma.trackedLink.findFirst.mockResolvedValue(null);

    await expect(
      service.generateTrackingLink({ platform: 'twitter', url }, 'org-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trackedLink.create).not.toHaveBeenCalled();
  });

  it('allows public IPv6 redirect targets', async () => {
    const { prisma, service } = makeService();
    prisma.trackedLink.findFirst.mockResolvedValue(null);
    prisma.trackedLink.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'link-1', ...data }),
    );

    const link = await service.generateTrackingLink(
      { platform: 'twitter', url: 'https://[2606:4700:4700::1111]/page' },
      'org-1',
    );

    expect(link.originalUrl).toContain('https://[2606:4700:4700::1111]/page');
    expect(prisma.trackedLink.create).toHaveBeenCalled();
  });

  // Cross-tenant write hardening: update()/delete() must scope the mutation by
  // organizationId, not just a preceding read.
  it('scopes update writes to the authenticated organization', async () => {
    const { prisma, service } = makeService();
    prisma.trackedLink.updateMany.mockResolvedValue({ count: 1 });
    prisma.trackedLink.findFirst.mockResolvedValue({
      id: 'link-1',
      isActive: false,
      organizationId: 'org-1',
    });

    await service.update('link-1', 'org-1', { isActive: false });

    expect(prisma.trackedLink.updateMany).toHaveBeenCalledWith({
      data: { isActive: false },
      where: { id: 'link-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(prisma.trackedLink.update).not.toHaveBeenCalled();
  });

  it('throws when an update matches no link in the organization', async () => {
    const { prisma, service } = makeService();
    prisma.trackedLink.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update('link-1', 'org-1', { isActive: false }),
    ).rejects.toThrow('Tracked link not found');
  });

  it('scopes delete writes to the authenticated organization', async () => {
    const { prisma, service } = makeService();
    prisma.trackedLink.updateMany.mockResolvedValue({ count: 1 });

    await service.delete('link-1', 'org-1');

    expect(prisma.trackedLink.updateMany).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: { id: 'link-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(prisma.trackedLink.update).not.toHaveBeenCalled();
  });

  it('throws when a delete matches no link in the organization', async () => {
    const { prisma, service } = makeService();
    prisma.trackedLink.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.delete('link-1', 'org-1')).rejects.toThrow(
      'Tracked link not found',
    );
  });

  // SSRF: getCountryFromIP must only interpolate validated IP literals into the
  // outbound ipapi.co URL.
  it('does not call the geolocation API for non-IP X-Forwarded-For values', async () => {
    const { service } = makeService();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('US'));
    const probe = service as unknown as {
      getCountryFromIP(ip?: string): Promise<string | undefined>;
    };

    await expect(
      probe.getCountryFromIP('1.1.1.1/../v1/admin?x='),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('queries the geolocation API for valid public IPs only', async () => {
    const { service } = makeService();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('US'));
    const probe = service as unknown as {
      getCountryFromIP(ip?: string): Promise<string | undefined>;
    };

    await expect(probe.getCountryFromIP('8.8.8.8')).resolves.toBe('US');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://ipapi.co/8.8.8.8/country/',
      expect.anything(),
    );

    fetchSpy.mockRestore();
  });
});
