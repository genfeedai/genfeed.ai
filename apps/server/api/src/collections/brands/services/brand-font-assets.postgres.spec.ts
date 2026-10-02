import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  type BrandFontActor,
  BrandFontAssetsService,
} from '@api/collections/brands/services/brand-font-assets.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import { Prisma, PrismaClient } from '@genfeedai/prisma';
import type { BoundedStorageProvider } from '@genfeedai/storage';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
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
interface FontDatabaseFactories {
  createAdapter: (connectionString: string) => PrismaPg;
  createClient: (adapter: PrismaPg) => PrismaClient;
}
const INVALID_FONT_DATABASE =
  'Font proof requires a loopback PostgreSQL database brand_onboarding_5785';
function validateFontDatabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(INVALID_FONT_DATABASE);
  }
  const blockedKeys = new Set([
    'host',
    'hostaddr',
    'service',
    'database',
    'dbname',
  ]);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/brand_onboarding_5785' ||
    [...url.searchParams.keys()].some((key) =>
      blockedKeys.has(key.toLowerCase()),
    )
  )
    throw new Error(INVALID_FONT_DATABASE);
  return value;
}
function createIsolatedFontDatabase(
  value: string,
  factories: FontDatabaseFactories,
): PrismaClient {
  const admitted = validateFontDatabaseUrl(value);
  const adapter = factories.createAdapter(admitted);
  return factories.createClient(adapter);
}
const fontDatabaseFactories: FontDatabaseFactories = {
  createAdapter: (connectionString) => new PrismaPg({ connectionString }),
  createClient: (adapter) => new PrismaClient({ adapter }),
};
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
interface DatabaseIdentity {
  name: string;
}
interface FontFixtureOwnerRole {
  id: string;
  isDeleted: boolean;
}
interface FontFixtureMemberSetup {
  roleId: string;
  createdRoleId: string | null;
}
function isOwnerRoleCollision(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  )
    return false;
  const target = error.meta?.target;
  return (
    target === 'roles_key_key' ||
    target === 'key' ||
    (Array.isArray(target) && target.length === 1 && target[0] === 'key')
  );
}
async function createFontFixtureMember(
  db: PrismaClient,
  actor: BrandFontActor,
  memberId: string,
): Promise<FontFixtureMemberSetup> {
  const attempt = () =>
    db.$transaction(
      async (tx) => {
        const existing = await tx.$queryRaw<FontFixtureOwnerRole[]>(
          Prisma.sql`SELECT id, "isDeleted" FROM roles WHERE key=${MemberRole.OWNER} FOR KEY SHARE`,
        );
        const current = existing[0];
        if (current?.isDeleted)
          throw new Error('Font fixture requires an active OWNER role');
        const createdRoleId = current ? null : `font-role-${randomUUID()}`;
        const role =
          current ??
          (await tx.role.create({
            data: {
              id: createdRoleId ?? undefined,
              key: MemberRole.OWNER,
              label: 'Font fixture owner',
              isDeleted: false,
            },
          }));
        await tx.member.create({
          data: {
            id: memberId,
            userId: actor.actorId,
            organizationId: actor.organizationId,
            roleId: role.id,
            currentBrandId: actor.brandId,
          },
        });
        return { roleId: role.id, createdRoleId };
      },
      { maxWait: 5000, timeout: 5000 },
    );
  try {
    return await attempt();
  } catch (error) {
    if (!isOwnerRoleCollision(error)) throw error;
    return attempt();
  }
}
async function cleanupFontFixtureRole(
  db: PrismaClient,
  createdRoleId: string | null,
): Promise<void> {
  if (!createdRoleId) return;
  try {
    await db.role.deleteMany({
      where: {
        id: createdRoleId,
        key: MemberRole.OWNER,
        members: { none: {} },
        invitations: { none: {} },
      },
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2003'
    )
      throw error;
  }
}
const connectionString = process.env.BRAND_ONBOARDING_TEST_DATABASE_URL;
if (
  process.argv.some((argument) =>
    argument.includes('brand-font-assets.postgres.spec.ts'),
  ) &&
  !connectionString
)
  throw new Error(
    'BRAND_ONBOARDING_TEST_DATABASE_URL is required for the requested PostgreSQL proof',
  );
describe.skipIf(!connectionString)(
  'Font asset real isolated PostgreSQL races',
  () => {
    const prisma = connectionString
      ? createIsolatedFontDatabase(connectionString, fontDatabaseFactories)
      : null;
    function database(): PrismaClient {
      if (!prisma)
        throw new Error('BRAND_ONBOARDING_TEST_DATABASE_URL is required');
      return prisma;
    }
    let actor: BrandFontActor;
    let memberId: string;
    let createdRoleId: string | null = null;
    let memberFixtureIds: string[] = [];
    let requestId: string;
    let service: BrandFontAssetsService;
    let observeLock: (() => void) | null = null;
    beforeEach(async () => {
      createdRoleId = null;
      memberFixtureIds = [];
      const db = database();
      const names = await db.$queryRaw<DatabaseIdentity[]>(
        Prisma.sql`SELECT current_database() AS name`,
      );
      expect(names[0]?.name).toBe('brand_onboarding_5785');
      vi.clearAllMocks();
      storage.upload.mockResolvedValue('ignored');
      storage.delete.mockResolvedValue();
      storage.readBytes.mockImplementation(async () => file().buffer);
      const suffix = randomUUID();
      actor = {
        actorId: `font-user-${suffix}`,
        organizationId: `font-org-${suffix}`,
        brandId: `font-brand-${suffix}`,
      };
      memberId = `font-member-${suffix}`;
      requestId = randomUUID();
      await db.user.create({
        data: { id: actor.actorId, handle: actor.actorId },
      });
      await db.organization.create({
        data: {
          id: actor.organizationId,
          label: actor.organizationId,
          slug: actor.organizationId,
          userId: actor.actorId,
        },
      });
      await db.brand.create({
        data: {
          id: actor.brandId,
          organizationId: actor.organizationId,
          slug: actor.brandId,
          label: 'Font fixture',
          userId: actor.actorId,
        },
      });
      const concurrentMemberId = `font-member-${randomUUID()}`;
      memberFixtureIds.push(memberId, concurrentMemberId);
      const setups = await Promise.all(
        [memberId, concurrentMemberId].map((id) =>
          createFontFixtureMember(db, actor, id).then((setup) => {
            if (setup.createdRoleId) createdRoleId = setup.createdRoleId;
            return setup;
          }),
        ),
      );
      expect(setups[0].roleId).toBe(setups[1].roleId);
      expect(
        setups.filter((setup) => setup.createdRoleId !== null).length,
      ).toBeLessThanOrEqual(1);
      await db.member.deleteMany({
        where: { id: concurrentMemberId, organizationId: actor.organizationId },
      });
      const observed = db.$extends({
        query: {
          $queryRaw: async ({ args, query }) => {
            observeLock?.();
            return query(args);
          },
        },
      });
      const module = await Test.createTestingModule({
        providers: [
          BrandFontAssetsService,
          { provide: PrismaService, useValue: observed },
        ],
      }).compile();
      service = module.get(BrandFontAssetsService);
    });
    afterEach(async () => {
      if (!actor) return;
      const db = database();
      await db.asset.deleteMany({
        where: {
          parentOrgId: actor.organizationId,
          parentBrandId: actor.brandId,
        },
      });
      await db.member.deleteMany({
        where: {
          id: { in: memberFixtureIds },
          organizationId: actor.organizationId,
        },
      });
      await db.brand.deleteMany({
        where: { id: actor.brandId, organizationId: actor.organizationId },
      });
      await db.organization.deleteMany({ where: { id: actor.organizationId } });
      await db.user.deleteMany({ where: { id: actor.actorId } });
      await cleanupFontFixtureRole(db, createdRoleId);
      vi.restoreAllMocks();
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });
    function input() {
      return { requestId, file: file() };
    }
    it('reuses an existing locked role unchanged and concurrent members share its sole row', async () => {
      const db = database();
      const before = await db.role.findUniqueOrThrow({
        where: { key: MemberRole.OWNER },
      });
      const ids = [
        `font-member-${randomUUID()}`,
        `font-member-${randomUUID()}`,
      ];
      memberFixtureIds.push(...ids);
      const setups = await Promise.all(
        ids.map((id) => createFontFixtureMember(db, actor, id)),
      );
      expect(setups).toEqual([
        { roleId: before.id, createdRoleId: null },
        { roleId: before.id, createdRoleId: null },
      ]);
      expect(
        await db.role.findUniqueOrThrow({ where: { id: before.id } }),
      ).toEqual(before);
      expect(
        await db.member.count({
          where: {
            id: { in: ids },
            organizationId: actor.organizationId,
            roleId: before.id,
          },
        }),
      ).toBe(2);
      await cleanupFontFixtureRole(db, null);
      expect(
        await db.role.findUnique({ where: { id: before.id } }),
      ).not.toBeNull();
    });
    it('tracks only committed absent-role creation and retains a still-referenced owned role', async () => {
      const db = database();
      const member = await db.member.findUniqueOrThrow({
        where: { id: memberId },
      });
      const role = await db.role.findUniqueOrThrow({
        where: { id: member.roleId },
      });
      expect(role.key).toBe(MemberRole.OWNER);
      expect(role.isDeleted).toBe(false);
      if (createdRoleId) {
        expect(role.id).toBe(createdRoleId);
        expect(role.label).toBe('Font fixture owner');
        await cleanupFontFixtureRole(db, createdRoleId);
        expect(
          await db.role.findUnique({ where: { id: createdRoleId } }),
        ).not.toBeNull();
      } else {
        const id = `font-member-${randomUUID()}`;
        memberFixtureIds.push(id);
        const setup = await createFontFixtureMember(db, actor, id);
        expect(setup.createdRoleId).toBeNull();
      }
    });
    it('serializes identical publish races to one row and cleans only the unique loser key', async () => {
      const gate = deferred<void>();
      let uploads = 0;
      storage.upload.mockImplementation(async () => {
        if (++uploads === 2) gate.resolve();
        await gate.promise;
        return 'ignored';
      });
      const [one, two] = await Promise.all([
        service.upload(actor, input()),
        service.upload(actor, input()),
      ]);
      const rows = await database().asset.findMany({
        where: {
          parentOrgId: actor.organizationId,
          parentBrandId: actor.brandId,
          category: 'FONT',
          isDeleted: false,
        },
      });
      expect(rows).toHaveLength(1);
      expect(one.asset.id).toBe(two.asset.id);
      expect([one.created, two.created].sort()).toEqual([false, true]);
      const keys = storage.upload.mock.calls.map((call) => call[1]);
      expect(new Set(keys).size).toBe(2);
      expect(storage.delete).toHaveBeenCalledExactlyOnceWith(
        keys.find((key) => key !== rows[0].cloudObjectKey),
      );
    });
    it('rechecks revoked membership after settled storage before any publish', async () => {
      const entered = deferred<void>();
      const release = deferred<void>();
      storage.upload.mockImplementationOnce(async () => {
        entered.resolve();
        await release.promise;
        return 'ignored';
      });
      const pending = service.upload(actor, input());
      await entered.promise;
      try {
        await database().member.update({
          where: { id: memberId },
          data: { isActive: false },
        });
      } finally {
        release.resolve();
      }
      await expect(pending).rejects.toThrow('font_asset_access_denied');
      expect(
        await database().asset.count({
          where: {
            parentOrgId: actor.organizationId,
            parentBrandId: actor.brandId,
          },
        }),
      ).toBe(0);
      expect(storage.delete).toHaveBeenCalledOnce();
    });
    it('rechecks deleted brand scope after upload and cleans uncommitted bytes', async () => {
      const entered = deferred<void>();
      const release = deferred<void>();
      storage.readBytes.mockImplementationOnce(async () => {
        entered.resolve();
        await release.promise;
        return file().buffer;
      });
      const pending = service.upload(actor, input());
      await entered.promise;
      try {
        await database().brand.update({
          where: { id: actor.brandId, organizationId: actor.organizationId },
          data: { isDeleted: true },
        });
      } finally {
        release.resolve();
      }
      await expect(pending).rejects.toThrow('font_asset_access_denied');
      expect(
        await database().asset.count({
          where: {
            parentOrgId: actor.organizationId,
            parentBrandId: actor.brandId,
          },
        }),
      ).toBe(0);
    });
    it('makes delete and late identical publication serialize under a real Brand row lock', async () => {
      const entered = deferred<void>();
      const release = deferred<void>();
      storage.upload.mockImplementationOnce(async () => {
        entered.resolve();
        await release.promise;
        return 'ignored';
      });
      const late = service.upload(actor, input());
      await entered.promise;
      const winner = await service.upload(actor, input());
      const locked = deferred<void>();
      const unlock = deferred<void>();
      const db = database();
      const blocker = db.$transaction(
        async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM brands WHERE id=${actor.brandId} AND "organizationId"=${actor.organizationId} AND "isDeleted"=false FOR UPDATE`,
          );
          locked.resolve();
          await unlock.promise;
        },
        { maxWait: 5000, timeout: 5000 },
      );
      await locked.promise;
      const deletionAttempted = deferred<void>();
      observeLock = () => deletionAttempted.resolve();
      const deleting = service.remove(actor, winner.asset.id);
      try {
        await deletionAttempted.promise;
        observeLock = null;
        release.resolve();
      } finally {
        unlock.resolve();
        release.resolve();
        observeLock = null;
      }
      await blocker;
      await deleting;
      await expect(late).rejects.toThrow('font_asset_conflict');
      const rows = await db.asset.findMany({
        where: {
          parentOrgId: actor.organizationId,
          parentBrandId: actor.brandId,
        },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].isDeleted).toBe(true);
      expect(storage.delete).toHaveBeenCalledOnce();
      expect(storage.delete.mock.calls[0][0]).not.toBe(
        winner.asset.cloudObjectKey,
      );
    });
    it('keeps tombstone deletion idempotent and same-request upload conflicting', async () => {
      const saved = await service.upload(actor, input());
      await service.remove(actor, saved.asset.id);
      await service.remove(actor, saved.asset.id);
      await expect(service.upload(actor, input())).rejects.toThrow(
        'font_asset_conflict',
      );
      expect(storage.upload).toHaveBeenCalledOnce();
      expect(storage.delete).not.toHaveBeenCalled();
    });
  },
);
