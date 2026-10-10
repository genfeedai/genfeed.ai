import { Readable } from 'node:stream';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import {
  type BrandFontActor,
  BrandFontAssetsService,
} from '@api/collections/brands/services/brand-font-assets.service';
import {
  encodeBrandFontCursor,
  parseBrandFontCursor,
} from '@api/collections/brands/utils/brand-font-upload.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetCategory, AssetParent } from '@genfeedai/contracts';
import type { Asset, Prisma } from '@genfeedai/prisma';
import type { BoundedStorageProvider } from '@genfeedai/storage';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  upload: vi.fn<BoundedStorageProvider['upload']>(),
  readBytes: vi.fn<BoundedStorageProvider['readBytes']>(),
  delete: vi.fn<BoundedStorageProvider['delete']>(),
  uploadFromFile: vi.fn<BoundedStorageProvider['uploadFromFile']>(),
  download: vi.fn<BoundedStorageProvider['download']>(),
  getUrl: vi.fn<BoundedStorageProvider['getUrl']>(),
  list: vi.fn<BoundedStorageProvider['list']>(),
  listObjects: vi.fn<BoundedStorageProvider['listObjects']>(),
  exists: vi.fn<BoundedStorageProvider['exists']>(),
}));
vi.mock('@genfeedai/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/storage')>()),
  createStorageProvider: () => storage,
}));
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {
    throw new Error('gate not initialized');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const actor: BrandFontActor = {
  organizationId: 'font-org',
  brandId: 'font-brand',
  actorId: 'font-user',
};
const requestId = '1254ff7f-367d-4cda-af62-1c666a73fc8f';
function file(): Express.Multer.File {
  const buffer = Buffer.alloc(48);
  buffer.write('wOF2');
  return {
    buffer,
    size: buffer.length,
    originalname: 'Acme.woff2',
    mimetype: 'font/woff2',
    fieldname: 'file',
    encoding: '7bit',
    destination: '',
    filename: '',
    path: '',
    stream: Readable.from([]),
  };
}
function asset(data: Prisma.AssetCreateArgs['data']): Asset {
  return {
    id: data.id ?? 'font',
    userId: actor.actorId,
    parentType: AssetParent.BRAND,
    parentOrgId: actor.organizationId,
    parentBrandId: actor.brandId,
    parentIngredientId: null,
    parentArticleId: null,
    category: AssetCategory.FONT,
    referenceCategory: null,
    externalId: null,
    localAssetId: null,
    cloudObjectKey:
      typeof data.cloudObjectKey === 'string' ? data.cloudObjectKey : null,
    sha256: typeof data.sha256 === 'string' ? data.sha256 : null,
    sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : null,
    mimeType: 'font/woff2',
    kind: null,
    origin: null,
    residency: null,
    uploadPolicy: null,
    originalFileName:
      typeof data.originalFileName === 'string' ? data.originalFileName : null,
    displayName: typeof data.displayName === 'string' ? data.displayName : null,
    isDeleted: false,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  };
}
async function harness() {
  let row: Asset | null = null;
  let role = 'owner';
  let assigned: string[] = [];
  let active = true;
  let queue = Promise.resolve();
  const organization = {
    findFirst: vi.fn(async () =>
      active ? { id: actor.organizationId } : null,
    ),
  };
  const brand = {
    findFirst: vi.fn(async () => (active ? { id: actor.brandId } : null)),
  };
  const member = {
    findFirst: vi.fn(async () =>
      active
        ? { role: { key: role }, brands: assigned.map((id) => ({ id })) }
        : null,
    ),
  };
  const assets = {
    findFirst: vi.fn(async () => row),
    findMany: vi.fn(async () => (row ? [row] : [])),
    create: vi.fn(async (args: Prisma.AssetCreateArgs) => {
      row = asset(args.data);
      return row;
    }),
    update: vi.fn(async () => {
      if (!row) throw new Error('missing fixture');
      row = { ...row, isDeleted: true };
      return row;
    }),
  };
  const lock = vi.fn().mockResolvedValue([]);
  const transaction = vi.fn();
  const module = await Test.createTestingModule({
    providers: [
      BrandFontAssetsService,
      BrandAccessService,
      {
        provide: PrismaService,
        useValue: {
          organization,
          brand,
          member,
          asset: assets,
          $queryRaw: lock,
          $transaction: transaction,
        },
      },
    ],
  }).compile();
  const client = module.get<PrismaService>(PrismaService);
  transaction.mockImplementation(
    (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      const next = queue.then(() => callback(client));
      queue = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  );
  return {
    service: module.get(BrandFontAssetsService),
    assets,
    lock,
    organization,
    member,
    get row() {
      return row;
    },
    set row(value: Asset | null) {
      row = value;
    },
    setRole(value: string, brands: string[] = []) {
      role = value;
      assigned = brands;
    },
    revoke() {
      active = false;
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  storage.upload.mockResolvedValue('ignored-public-url');
  storage.delete.mockResolvedValue();
  storage.readBytes.mockImplementation(async () => file().buffer);
});
describe('Dedicated immutable brand font service', () => {
  it('roundtrips the full Unicode filename and enforces displayName code units before storage', async () => {
    const h = await harness();
    const originalFileName = `${'😀'.repeat(250)}.woff2`;
    const displayName = '😀'.repeat(128);
    const result = await h.service.upload(actor, {
      requestId,
      file: { ...file(), originalname: originalFileName },
      displayName,
    });
    expect(result.asset.originalFileName).toBe(originalFileName);
    expect(result.asset.displayName).toBe(displayName);
    await expect(
      h.service.upload(actor, {
        requestId,
        file: file(),
        displayName: '😀'.repeat(129),
      }),
    ).rejects.toThrow('font_asset_invalid');
    expect(storage.upload).toHaveBeenCalledOnce();
    h.row = { ...result.asset, displayName: '😀'.repeat(129) };
    await expect(h.service.list(actor, { limit: 20 })).resolves.toMatchObject({
      docs: [],
    });
  });
  it('authorizes before hashing/storage and rechecks live role after storage', async () => {
    const h = await harness();
    h.setRole('member');
    await expect(
      h.service.upload(actor, { requestId, file: file() }),
    ).rejects.toThrow('font_asset_access_denied');
    expect(storage.upload).not.toHaveBeenCalled();
    h.setRole('owner');
    storage.readBytes.mockImplementationOnce(async () => {
      h.setRole('member');
      return file().buffer;
    });
    await expect(
      h.service.upload(actor, { requestId, file: file() }),
    ).rejects.toThrow('font_asset_access_denied');
    expect(h.assets.create).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledOnce();
  });
  it('uses actual bounded readback and immutable replay preserving original filename', async () => {
    const h = await harness();
    const first = await h.service.upload(actor, { requestId, file: file() });
    expect(first.created).toBe(true);
    expect(h.row).toMatchObject({
      userId: actor.actorId,
      category: 'FONT',
      parentBrandId: actor.brandId,
      parentOrgId: actor.organizationId,
      originalFileName: 'Acme.woff2',
      sizeBytes: 48,
    });
    expect(storage.readBytes).toHaveBeenCalledWith(first.asset.cloudObjectKey, {
      maxBytes: 4194304,
      timeoutMs: 15000,
      signal: undefined,
    });
    const replay = await h.service.upload(actor, {
      requestId,
      file: { ...file(), originalname: 'Other.woff2' },
    });
    expect(replay).toEqual({ asset: first.asset, created: false });
    expect(storage.upload).toHaveBeenCalledOnce();
    expect(h.lock).toHaveBeenCalledTimes(2);
    await expect(
      h.service.upload(actor, {
        requestId,
        file: file(),
        displayName: 'changed',
      }),
    ).rejects.toThrow('font_asset_conflict');
  });
  it('uses unique keys under an identical concurrent request and cleans only loser', async () => {
    const h = await harness();
    const gate = deferred<void>();
    let uploads = 0;
    storage.upload.mockImplementation(async () => {
      if (++uploads === 2) gate.resolve();
      await gate.promise;
      return 'ignored';
    });
    const [one, two] = await Promise.all([
      h.service.upload(actor, { requestId, file: file() }),
      h.service.upload(actor, { requestId, file: file() }),
    ]);
    expect(h.assets.create).toHaveBeenCalledOnce();
    expect([one.created, two.created].sort()).toEqual([false, true]);
    const keys = storage.upload.mock.calls.map((call) => call[1]);
    expect(new Set(keys).size).toBe(2);
    expect(storage.delete).toHaveBeenCalledExactlyOnceWith(
      keys.find((key) => key !== h.row?.cloudObjectKey),
    );
  });
  it.each(['short', 'hash', 'upload', 'read'] as const)(
    'settles %s failure before cleanup without persistence',
    async (mode) => {
      const h = await harness();
      if (mode === 'upload')
        storage.upload.mockRejectedValueOnce(new Error('private-provider'));
      else if (mode === 'read')
        storage.readBytes.mockRejectedValueOnce(new Error('private-key'));
      else
        storage.readBytes.mockResolvedValueOnce(
          mode === 'short' ? Buffer.alloc(1) : Buffer.alloc(48),
        );
      await expect(
        h.service.upload(actor, { requestId, file: file() }),
      ).rejects.toThrow('font_asset_unavailable');
      expect(h.assets.create).not.toHaveBeenCalled();
      expect(storage.delete).toHaveBeenCalledOnce();
    },
  );
  it('awaits cleanup failure and preserves the primary access error', async () => {
    const h = await harness();
    storage.readBytes.mockImplementationOnce(async () => {
      h.revoke();
      return file().buffer;
    });
    storage.delete.mockRejectedValueOnce(new Error('private-cleanup'));
    await expect(
      h.service.upload(actor, { requestId, file: file() }),
    ).rejects.toThrow('font_asset_access_denied');
  });
  it('honors abort before upload, after settlement and preserves committed replay', async () => {
    const h = await harness();
    const abort = new AbortController();
    abort.abort();
    await expect(
      h.service.upload(actor, { requestId, file: file() }, abort.signal),
    ).rejects.toThrow('font_asset_unavailable');
    expect(storage.upload).not.toHaveBeenCalled();
    const second = new AbortController();
    storage.upload.mockImplementationOnce(async () => {
      second.abort();
      return 'ignored';
    });
    await expect(
      h.service.upload(actor, { requestId, file: file() }, second.signal),
    ).rejects.toThrow('font_asset_unavailable');
    expect(h.assets.create).not.toHaveBeenCalled();
    const saved = await h.service.upload(actor, { requestId, file: file() });
    const later = new AbortController();
    later.abort();
    expect(
      (await h.service.upload(actor, { requestId, file: file() }, later.signal))
        .asset.id,
    ).toBe(saved.asset.id);
  });
  it('soft deletes idempotently, preserves storage, conflicts on tombstone replay and conceals foreign rows', async () => {
    const h = await harness();
    const saved = await h.service.upload(actor, { requestId, file: file() });
    await h.service.remove(actor, saved.asset.id);
    await h.service.remove(actor, saved.asset.id);
    expect(h.assets.update).toHaveBeenCalledOnce();
    expect(storage.delete).not.toHaveBeenCalled();
    await expect(
      h.service.upload(actor, { requestId, file: file() }),
    ).rejects.toThrow('font_asset_conflict');
    h.row = { ...saved.asset, parentOrgId: 'foreign' };
    await expect(h.service.remove(actor, saved.asset.id)).rejects.toThrow(
      'font_asset_unavailable',
    );
  });
  it('skips invalid stored rows in list instead of failing and scopes asset lookups by organization', async () => {
    const h = await harness();
    const saved = await h.service.upload(actor, { requestId, file: file() });
    h.row = { ...saved.asset, sha256: 'not-a-hash' };
    await expect(h.service.list(actor, { limit: 20 })).resolves.toMatchObject({
      docs: [],
    });
    await h.service.remove(actor, saved.asset.id).catch(() => undefined);
    const findFirstCalls: unknown[][] = h.assets.findFirst.mock.calls;
    for (const [args] of findFirstCalls)
      expect(args).toMatchObject({
        where: { parentOrgId: actor.organizationId },
      });
  });
  it('backfills a page past invalid rows so hasMore never accompanies a short page', async () => {
    const h = await harness();
    const saved = await h.service.upload(actor, { requestId, file: file() });
    const good = (id: string, at: string) => ({
      ...saved.asset,
      id,
      createdAt: new Date(at),
    });
    const bad = { ...saved.asset, id: 'bad', sha256: 'nope' };
    h.assets.findMany
      .mockResolvedValueOnce([
        bad,
        good('g1', '2026-09-30'),
        good('g9', '2026-09-29'),
      ])
      .mockResolvedValueOnce([
        good('g2', '2026-09-29'),
        good('g3', '2026-09-28'),
      ]);
    const result = await h.service.list(actor, { limit: 2 });
    expect(result.docs.map((d) => d.id)).toEqual(['g1', 'g2']);
    expect(result.docs).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).not.toBeNull();
  });
  it('lists only scoped active rows and enforces membership assignment semantics', async () => {
    const h = await harness();
    h.setRole('member', ['other']);
    await expect(h.service.list(actor, { limit: 20 })).rejects.toThrow(
      'font_asset_access_denied',
    );
    h.setRole('member');
    await h.service.list(actor, { limit: 1 });
    expect(h.assets.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          parentType: 'BRAND',
          parentOrgId: actor.organizationId,
          parentBrandId: actor.brandId,
          category: 'FONT',
          isDeleted: false,
        },
        take: 2,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    h.setRole('admin', ['other']);
    await expect(h.service.list(actor, { limit: 20 })).resolves.toMatchObject({
      docs: [],
    });
  });
  it('paginates with exact scoped timestamp/id predicates and cursor from last returned row', async () => {
    const h = await harness();
    const saved = await h.service.upload(actor, { requestId, file: file() });
    h.assets.findMany.mockResolvedValueOnce([
      saved.asset,
      { ...saved.asset, id: 'second' },
    ]);
    const cursor = encodeBrandFontCursor({
      createdAt: '2026-10-02T00:00:00.000Z',
      id: 'previous',
    });
    const page = await h.service.list(actor, { limit: 1, cursor });
    expect(page.docs).toEqual([saved.asset]);
    expect(page.hasMore).toBe(true);
    expect(parseBrandFontCursor(page.nextCursor ?? '')).toEqual({
      createdAt: saved.asset.createdAt.toISOString(),
      id: saved.asset.id,
    });
    expect(h.assets.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { createdAt: { lt: new Date('2026-10-02T00:00:00.000Z') } },
            {
              createdAt: new Date('2026-10-02T00:00:00.000Z'),
              id: { lt: 'previous' },
            },
          ],
        }),
        take: 2,
      }),
    );
  });
  it('checks cancellation at the locked precreate boundary and cannot undo a completed create', async () => {
    const h = await harness();
    const before = new AbortController();
    h.lock.mockImplementationOnce(async () => {
      before.abort();
      return [];
    });
    await expect(
      h.service.upload(actor, { requestId, file: file() }, before.signal),
    ).rejects.toThrow('font_asset_unavailable');
    expect(h.assets.create).not.toHaveBeenCalled();
    const after = new AbortController();
    const create = h.assets.create.getMockImplementation();
    if (!create) throw new Error('fixture create unavailable');
    h.assets.create.mockImplementationOnce(async (args) => {
      const row = await create(args);
      after.abort();
      return row;
    });
    const result = await h.service.upload(
      actor,
      { requestId, file: file() },
      after.signal,
    );
    expect(result.created).toBe(true);
    expect(h.row?.id).toBe(result.asset.id);
    expect(storage.delete).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed stored metadata while allowing relocated safe keys', async () => {
    const h = await harness();
    const saved = await h.service.upload(actor, { requestId, file: file() });
    h.row = {
      ...saved.asset,
      cloudObjectKey: 'brand-fonts/old-org/old-brand/font/file.woff2',
    };
    await expect(
      h.service.upload(actor, { requestId, file: file() }),
    ).resolves.toMatchObject({ created: false });
    h.row = { ...saved.asset, cloudObjectKey: '../private' };
    await expect(
      h.service.upload(actor, { requestId, file: file() }),
    ).rejects.toThrow('font_asset_unavailable');
  });
});
