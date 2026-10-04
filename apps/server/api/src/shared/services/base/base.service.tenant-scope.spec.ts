import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  crossOrgUnsafe,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';

const ORG = 'org_own';
const FOREIGN_ORG = 'org_foreign';

type DelegateMock = Record<string, ReturnType<typeof vi.fn>>;

class TestService extends BaseService<Record<string, unknown>> {}

function createDelegate(): DelegateMock {
  return {
    count: vi.fn().mockResolvedValue(0),
    findFirst: vi.fn().mockResolvedValue({ id: 'row_1' }),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ id: 'row_1' }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
}

function createService(modelName: string): {
  delegate: DelegateMock;
  service: TestService;
} {
  const delegate = createDelegate();
  const prisma = { [modelName]: delegate } as unknown as PrismaService;
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as Partial<LoggerService> as LoggerService;

  return { delegate, service: new TestService(prisma, modelName, logger) };
}

describe('BaseService tenant scope', () => {
  describe('pure tenant model (brand)', () => {
    let delegate: DelegateMock;
    let service: TestService;

    beforeEach(() => {
      ({ delegate, service } = createService('brand'));
    });

    it('scopes an id-only patch to the request tenant', async () => {
      await runWithTenantContext({ organizationId: ORG }, () =>
        service.patch('row_1', { label: 'x' }),
      );

      expect(delegate.update).toHaveBeenCalledWith({
        data: { label: 'x' },
        where: { id: 'row_1', organizationId: ORG },
      });
    });

    it('scopes an id-only remove to the request tenant', async () => {
      await runWithTenantContext({ organizationId: ORG }, () =>
        service.remove('row_1'),
      );

      expect(delegate.update).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: { id: 'row_1', organizationId: ORG },
      });
    });

    it('scopes updateEntityFlag writes to the request tenant', async () => {
      await runWithTenantContext({ organizationId: ORG }, () =>
        service.updateEntityFlag('row_1', ORG, 'isRead' as never, true),
      );

      expect(delegate.update).toHaveBeenCalledWith({
        data: { isRead: true },
        where: { id: 'row_1', organizationId: ORG },
      });
    });

    it('scopes findOne, find and findAll reads to the request tenant', async () => {
      await runWithTenantContext({ organizationId: ORG }, async () => {
        await service.findOne({ id: 'row_1' });
        await service.find({ slug: 'a' });
        await service.findAll({ where: { slug: 'a' } }, { pagination: false });
      });

      const expectedWhere = {
        id: 'row_1',
        isDeleted: false,
        organizationId: ORG,
      };
      expect(delegate.findFirst).toHaveBeenCalledWith({ where: expectedWhere });
      expect(delegate.findMany).toHaveBeenNthCalledWith(1, {
        where: { isDeleted: false, organizationId: ORG, slug: 'a' },
      });
      expect(delegate.findMany).toHaveBeenNthCalledWith(2, {
        orderBy: [{ createdAt: 'desc' }],
        where: { isDeleted: false, organizationId: ORG, slug: 'a' },
      });
    });

    it('scopes the findAll count with the same where as the page', async () => {
      await runWithTenantContext({ organizationId: ORG }, () =>
        service.findAll({ where: { slug: 'a' } }, { limit: 5, page: 1 }),
      );

      expect(delegate.count).toHaveBeenCalledWith({
        where: { isDeleted: false, organizationId: ORG, slug: 'a' },
      });
    });

    it('scopes patchAll as a write', async () => {
      await runWithTenantContext({ organizationId: ORG }, () =>
        service.patchAll({ slug: 'a' }, { label: 'x' }),
      );

      expect(delegate.updateMany).toHaveBeenCalledWith({
        data: { label: 'x' },
        where: { isDeleted: false, organizationId: ORG, slug: 'a' },
      });
    });

    it('never reaches another organization through an id', async () => {
      // The scope names the request tenant, so a foreign row's id cannot match.
      await runWithTenantContext({ organizationId: ORG }, async () => {
        await service.findOne({ id: 'foreign_row' });
        await service.patch('foreign_row', { label: 'x' });
      });

      for (const call of [
        delegate.findFirst.mock.calls[0]?.[0],
        delegate.update.mock.calls[0]?.[0],
      ]) {
        expect(call.where.organizationId).toBe(ORG);
        expect(call.where.organizationId).not.toBe(FOREIGN_ORG);
      }
    });

    it('does not read null-organization rows of a pure tenant model', async () => {
      await runWithTenantContext({ organizationId: ORG }, () =>
        service.findOne({ id: 'row_1' }),
      );

      const where = delegate.findFirst.mock.calls[0]?.[0].where;
      expect(where.OR).toBeUndefined();
      expect(where.organizationId).toBe(ORG);
    });

    it('keeps a caller-supplied organization untouched', async () => {
      await runWithTenantContext({ organizationId: ORG }, async () => {
        await service.findOne({ id: 'row_1', organizationId: ORG });
        await service.findOne({
          OR: [{ organizationId: ORG }, { userId: 'u1' }],
          id: 'row_2',
        });
      });

      expect(delegate.findFirst).toHaveBeenNthCalledWith(1, {
        where: { id: 'row_1', isDeleted: false, organizationId: ORG },
      });
      expect(delegate.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          OR: [{ organizationId: ORG }, { userId: 'u1' }],
          id: 'row_2',
          isDeleted: false,
        },
      });
    });

    it('keeps an organizationId:null filter and adds the tenant beside it', async () => {
      await runWithTenantContext({ organizationId: ORG }, () =>
        service.find({ organizationId: null }),
      );

      expect(delegate.findMany).toHaveBeenCalledWith({
        where: {
          AND: [{ organizationId: ORG }],
          isDeleted: false,
          organizationId: null,
        },
      });
    });

    it('leaves queries unchanged without a tenant context (workers)', async () => {
      await service.patch('row_1', { label: 'x' });
      await service.remove('row_1');
      await service.findOne({ id: 'row_1' });
      await service.patchAll({ slug: 'a' }, { label: 'x' });

      expect(delegate.update).toHaveBeenNthCalledWith(1, {
        data: { label: 'x' },
        where: { id: 'row_1' },
      });
      expect(delegate.update).toHaveBeenNthCalledWith(2, {
        data: { isDeleted: true },
        where: { id: 'row_1' },
      });
      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: 'row_1', isDeleted: false },
      });
      expect(delegate.updateMany).toHaveBeenCalledWith({
        data: { label: 'x' },
        where: { isDeleted: false, slug: 'a' },
      });
    });

    it('leaves queries unchanged inside crossOrgUnsafe', async () => {
      await runWithTenantContext({ organizationId: ORG }, () =>
        crossOrgUnsafe(() => service.patch('row_1', { label: 'x' })),
      );

      expect(delegate.update).toHaveBeenCalledWith({
        data: { label: 'x' },
        where: { id: 'row_1' },
      });
    });
  });

  describe('platform-default model (tag)', () => {
    let delegate: DelegateMock;
    let service: TestService;

    beforeEach(() => {
      ({ delegate, service } = createService('tag'));
    });

    it('reads platform rows alongside the tenant rows', async () => {
      await runWithTenantContext({ organizationId: ORG }, () =>
        service.findOne({ id: 'row_1' }),
      );

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: {
          AND: [{ OR: [{ organizationId: null }, { organizationId: ORG }] }],
          id: 'row_1',
          isDeleted: false,
        },
      });
    });

    it('keeps existing AND clauses when adding the platform arm', async () => {
      await runWithTenantContext({ organizationId: ORG }, () =>
        service.find({ AND: [{ slug: 'a' }] }),
      );

      expect(delegate.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { slug: 'a' },
            { OR: [{ organizationId: null }, { organizationId: ORG }] },
          ],
          isDeleted: false,
        },
      });
    });

    it('lets a null-only platform lookup prove the tenant through the OR arm', async () => {
      await runWithTenantContext({ organizationId: ORG }, () =>
        service.find({ organizationId: null }),
      );

      expect(delegate.findMany).toHaveBeenCalledWith({
        where: {
          AND: [{ OR: [{ organizationId: null }, { organizationId: ORG }] }],
          isDeleted: false,
          organizationId: null,
        },
      });
    });

    it('never lets a tenant write a platform row', async () => {
      await runWithTenantContext({ organizationId: ORG }, async () => {
        await service.patch('row_1', { label: 'x' });
        await service.remove('row_1');
        await service.patchAll({ slug: 'a' }, { label: 'x' });
      });

      expect(delegate.update).toHaveBeenNthCalledWith(1, {
        data: { label: 'x' },
        where: { id: 'row_1', organizationId: ORG },
      });
      expect(delegate.update).toHaveBeenNthCalledWith(2, {
        data: { isDeleted: true },
        where: { id: 'row_1', organizationId: ORG },
      });
      expect(delegate.updateMany).toHaveBeenCalledWith({
        data: { label: 'x' },
        where: { isDeleted: false, organizationId: ORG, slug: 'a' },
      });
    });

    it('leaves a superadmin platform write unscoped inside crossOrgUnsafe', async () => {
      await runWithTenantContext({ organizationId: ORG }, () =>
        crossOrgUnsafe(() => service.patch('row_1', { label: 'x' })),
      );

      expect(delegate.update).toHaveBeenCalledWith({
        data: { label: 'x' },
        where: { id: 'row_1' },
      });
    });
  });

  describe('non-tenant model (user)', () => {
    it('does not add an organization scope', async () => {
      const { delegate, service } = createService('user');

      await runWithTenantContext({ organizationId: ORG }, async () => {
        await service.patch('row_1', { label: 'x' });
        await service.findOne({ id: 'row_1' });
      });

      expect(delegate.update).toHaveBeenCalledWith({
        data: { label: 'x' },
        where: { id: 'row_1' },
      });
      expect(delegate.findFirst.mock.calls[0]?.[0].where.organizationId).toBe(
        undefined,
      );
    });
  });
});
