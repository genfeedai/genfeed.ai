import { describe, expect, it, vi } from 'vitest';
import {
  assertArticleSchemaReady,
  buildBrandSelector,
  buildOrganizationSelector,
  countDeletedCacheKeys,
  getMissingArticleColumns,
  isLocalDatabaseUrl,
  parseArticlesSeedArgs,
  REQUIRED_ARTICLE_COLUMNS,
  resolveSeedPublishedAt,
} from './articles.seed';

describe('articles seed schema preflight', () => {
  it('guards every physical column written by the launch seed', () => {
    expect(REQUIRED_ARTICLE_COLUMNS).toEqual([
      'coverImageUrl',
      'label',
      'summary',
    ]);
    expect(getMissingArticleColumns(['label', 'summary'])).toEqual([
      'coverImageUrl',
    ]);
  });

  it('fails closed before migration on a remote database', async () => {
    const migrateDeploy = vi.fn(() => true);

    await expect(
      assertArticleSchemaReady({
        findPresentColumns: async () => ['label', 'summary'],
        localDatabase: false,
        migrateDeploy,
      }),
    ).rejects.toThrow('coverImageUrl');
    expect(migrateDeploy).not.toHaveBeenCalled();
  });

  it('migrates a loopback database and verifies the schema again', async () => {
    const snapshots = [
      ['coverImageUrl'],
      ['coverImageUrl', 'label', 'summary'],
    ];
    const migrateDeploy = vi.fn(() => true);

    await expect(
      assertArticleSchemaReady({
        findPresentColumns: async () => snapshots.shift() ?? [],
        localDatabase: true,
        migrateDeploy,
      }),
    ).resolves.toBeUndefined();
    expect(migrateDeploy).toHaveBeenCalledOnce();
  });

  it('rejects a local schema that remains incomplete after migration', async () => {
    await expect(
      assertArticleSchemaReady({
        findPresentColumns: async () => ['coverImageUrl'],
        localDatabase: true,
        migrateDeploy: () => true,
      }),
    ).rejects.toThrow('still missing label, summary');
  });

  it('recognizes IPv4, hostname, and bracketed IPv6 loopback URLs only', () => {
    expect(isLocalDatabaseUrl('postgresql://localhost:5432/genfeed')).toBe(
      true,
    );
    expect(isLocalDatabaseUrl('postgresql://127.0.0.1:5432/genfeed')).toBe(
      true,
    );
    expect(isLocalDatabaseUrl('postgresql://[::1]:5432/genfeed')).toBe(true);
    expect(isLocalDatabaseUrl('postgresql://db.example.com:5432/genfeed')).toBe(
      false,
    );
    expect(isLocalDatabaseUrl('not a URL')).toBe(false);
  });

  it('constrains an explicit organization to the selected email owner', () => {
    expect(buildOrganizationSelector('org-1', 'genfeed.ai', 'user-1')).toEqual({
      id: 'org-1',
      isDeleted: false,
      label: 'genfeed.ai',
      userId: 'user-1',
    });
    expect(buildOrganizationSelector('org-1', null, null)).toEqual({
      id: 'org-1',
      isDeleted: false,
    });
  });

  it('parses an explicit organization label and runtime validation mode', () => {
    expect(
      parseArticlesSeedArgs([
        '--env=production',
        '--ownerEmail=vincent@genfeed.ai',
        '--organizationLabel=genfeed.ai',
        '--validate-runtime',
      ]),
    ).toMatchObject({
      dryRun: true,
      env: 'production',
      organizationLabel: 'genfeed.ai',
      ownerEmail: 'vincent@genfeed.ai',
      validateRuntime: true,
    });
  });

  it('parses explicit brand ownership for reviewable seeded articles', () => {
    expect(
      parseArticlesSeedArgs([
        '--brandId=brand-1',
        '--brandSlug=genfeed',
        '--ownerEmail=vincent@genfeed.ai',
      ]),
    ).toMatchObject({
      brandId: 'brand-1',
      brandSlug: 'genfeed',
      ownerEmail: 'vincent@genfeed.ai',
    });

    expect(buildBrandSelector('brand-1', 'genfeed', 'org-1')).toEqual({
      id: 'brand-1',
      isActive: true,
      isDeleted: false,
      organizationId: 'org-1',
      slug: 'genfeed',
    });
  });

  it('moves only the known launch batch timestamp to an editorial date', () => {
    const intended = new Date('2026-07-21T09:00:00.000Z');
    const originalBatch = new Date('2026-08-13T01:38:45.528Z');
    const manuallyEdited = new Date('2026-08-01T10:30:00.000Z');

    expect(
      resolveSeedPublishedAt({
        existingPublishedAt: originalBatch,
        intendedPublishedAt: intended,
        migrateFrom: originalBatch,
      }),
    ).toEqual(intended);
    expect(
      resolveSeedPublishedAt({
        existingPublishedAt: manuallyEdited,
        intendedPublishedAt: intended,
        migrateFrom: originalBatch,
      }),
    ).toEqual(manuallyEdited);
    expect(
      resolveSeedPublishedAt({
        existingPublishedAt: null,
        intendedPublishedAt: intended,
        migrateFrom: originalBatch,
      }),
    ).toEqual(intended);
  });

  it('counts only cache keys that Redis actually deleted', () => {
    expect(
      countDeletedCacheKeys(
        [
          [null, 1],
          [new Error('failed'), 0],
          [null, 0],
          [null, 1],
        ],
        3,
      ),
    ).toBe(1);
    expect(countDeletedCacheKeys(null, 3)).toBe(0);
  });
});
