import {
  EMAIL_MEDIA_TOKEN_TTL_MS,
  EmailMediaUrlService,
} from '@api/services/email-media/email-media-url.service';
import type { MediaUrlService } from '@api/services/media-urls/media-url.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ConfigService } from '@libs/config/config.service';
import { describe, expect, it } from 'vitest';

const NOW = Date.parse('2026-11-23T12:00:00Z');

interface Row {
  id: string;
  organizationId: string;
  isDeleted: boolean;
  category: string;
  s3Key: string | null;
}

function fixture(
  rows: Row[],
  options: { isSigned?: boolean; secret?: string | undefined } = {},
) {
  const config = {
    apiUrl: 'https://api.genfeed.ai',
    cdnSigningPrivateKey: 'secret' in options ? options.secret : 'k1',
    ingredientsEndpoint: 'https://cdn.genfeed.ai/ingredients',
    isAuthorizedMediaDeliveryEnabled: options.isSigned ?? true,
  } as unknown as ConfigService;
  const prisma = {
    ingredient: {
      findFirst: ({
        where,
      }: {
        where: {
          id: string;
          organizationId: string;
          isDeleted: boolean;
          category: { in: string[] };
        };
      }) =>
        Promise.resolve(
          rows.find(
            (row) =>
              row.id === where.id &&
              row.organizationId === where.organizationId &&
              row.isDeleted === where.isDeleted &&
              where.category.in.includes(row.category),
          ) ?? null,
        ),
    },
  } as unknown as PrismaService;
  const urls = {
    buildUrl: (key: string) => `https://cdn.genfeed.ai/${key}?Signature=fresh`,
  } as unknown as MediaUrlService;
  return new EmailMediaUrlService(config, prisma, urls);
}

const image: Row = {
  category: 'IMAGE',
  id: 'img-1',
  isDeleted: false,
  organizationId: 'org-1',
  s3Key: 'ingredients/images/img-1',
};
const video: Row = { ...image, category: 'VIDEO', id: 'vid-1', s3Key: null };

function tokenOf(url: string | null): string {
  return decodeURIComponent((url as string).split('/email-media/')[1]);
}

describe('EmailMediaUrlService', () => {
  it('turns a link from an email into a freshly signed still of an image', async () => {
    const service = fixture([image]);
    const url = service.previewUrl(image, 'org-1', NOW);

    expect(url).toMatch(/^https:\/\/api\.genfeed\.ai\/email-media\//);
    await expect(service.resolve(tokenOf(url), NOW)).resolves.toBe(
      'https://cdn.genfeed.ai/ingredients/images/img-1?Signature=fresh',
    );
  });

  it('opens the thumbnail of a video, not the video', async () => {
    const service = fixture([video]);

    await expect(
      service.resolve(tokenOf(service.previewUrl(video, 'org-1', NOW)), NOW),
    ).resolves.toBe(
      'https://cdn.genfeed.ai/ingredients/thumbnails/vid-1?Signature=fresh',
    );
  });

  it('keeps working for weeks and stops after the claim expires', async () => {
    const service = fixture([image]);
    const token = tokenOf(service.previewUrl(image, 'org-1', NOW));

    await expect(
      service.resolve(token, NOW + EMAIL_MEDIA_TOKEN_TTL_MS - 1000),
    ).resolves.toContain('img-1');
    await expect(
      service.resolve(token, NOW + EMAIL_MEDIA_TOKEN_TTL_MS + 1000),
    ).rejects.toThrow('Preview is unavailable');
  });

  it('refuses a claim that was edited, signed with another key, or cut short', async () => {
    const service = fixture([image, { ...image, id: 'img-2' }]);
    const token = tokenOf(service.previewUrl(image, 'org-1', NOW));
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ e: 9_999_999_999, i: 'img-2', o: 'org-1' }),
    ).toString('base64url');
    const otherKey = fixture([image], { secret: 'k2' });

    for (const bad of [
      `${forged}.${signature}`,
      `${payload}.`,
      payload,
      'not-a-token',
      '',
    ])
      await expect(service.resolve(bad, NOW)).rejects.toThrow(
        'Preview is unavailable',
      );
    await expect(otherKey.resolve(token, NOW)).rejects.toThrow(
      'Preview is unavailable',
    );
  });

  it('opens nothing from another organization, a deleted asset or audio', async () => {
    const rows = [
      { ...image, organizationId: 'org-2' },
      { ...image, id: 'gone', isDeleted: true },
      { ...image, category: 'MUSIC', id: 'song' },
    ];
    const service = fixture(rows);

    for (const row of rows) {
      const token = tokenOf(
        fixture([{ ...row, category: 'IMAGE' }]).previewUrl(
          { category: 'IMAGE', id: row.id },
          'org-1',
          NOW,
        ),
      );
      await expect(service.resolve(token, NOW)).rejects.toThrow(
        'Preview is unavailable',
      );
    }
    expect(service.previewUrl({ category: 'MUSIC', id: 'song' }, 'org-1')).toBe(
      null,
    );
  });

  it('shows the public CDN still where media is not signed', () => {
    const service = fixture([], { isSigned: false });

    expect(service.previewUrl(image, 'org-1')).toBe(
      'https://cdn.genfeed.ai/ingredients/images/img-1',
    );
    expect(service.previewUrl(video, 'org-1')).toBe(
      'https://cdn.genfeed.ai/ingredients/thumbnails/vid-1',
    );
  });

  it('draws a tile instead when the deployment cannot sign a claim', () => {
    expect(
      fixture([image], { secret: undefined }).previewUrl(image, 'org-1'),
    ).toBe(null);
  });
});
