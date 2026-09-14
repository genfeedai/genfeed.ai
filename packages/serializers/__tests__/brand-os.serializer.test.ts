import { BrandOsExportSerializer } from '@serializers/server/organizations/brand-os-export.serializer';
import { BrandOsRevisionSerializer } from '@serializers/server/organizations/brand-os-revision.serializer';
import { describe, expect, it } from 'vitest';

describe('Brand OS transport boundaries', () => {
  it('exposes revision history without preview claim credentials', () => {
    const content = { fields: {}, status: 'accepted' };
    const output = BrandOsRevisionSerializer.serialize({
      id: 'revision',
      organizationId: 'org',
      brandId: 'brand',
      version: 2,
      exportSchemaVersion: '1',
      status: 'APPROVED',
      content,
      approvedById: 'owner',
      approvedAt: '2026-09-14T10:00:00.000Z',
      sourcePreviewTokenHash: 'PRIVATE_CLAIM_TOKEN',
      redisKey: 'PRIVATE_REDIS_KEY',
    });
    expect(output.data).toMatchObject({
      id: 'revision',
      attributes: {
        version: 2,
        exportSchemaVersion: '1',
        status: 'APPROVED',
        content,
        brandId: 'brand',
      },
    });
    expect(JSON.stringify(output)).not.toContain('PRIVATE_');
  });
  it('exports publication metadata without artifact content or private internals', () => {
    const output = BrandOsExportSerializer.serialize({
      id: 'brand',
      brandId: 'brand',
      state: 'published',
      revisionId: 'revision',
      publishedRevisionId: 'revision',
      schemaVersion: '1',
      digest: 'digest',
      canPublish: true,
      publicUrl: 'https://api.genfeed.ai/public/brand-os/publication/design.md',
      markdown: 'PRIVATE_ARTIFACT_BODY',
      content: { secret: 'PRIVATE_CONTENT' },
      publishedById: 'PRIVATE_ACTOR',
    });
    expect(output.data).toMatchObject({
      id: 'brand',
      attributes: {
        state: 'published',
        revisionId: 'revision',
        canPublish: true,
      },
    });
    expect(JSON.stringify(output)).not.toContain('PRIVATE_');
  });
});
