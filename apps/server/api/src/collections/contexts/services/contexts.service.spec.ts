vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import type { ModelsService } from '@api/collections/models/services/models.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

type ContextRow = {
  id: string;
  organizationId: string;
  isDeleted: boolean;
  mongoId?: string | null;
  contextBaseId?: string;
  data?: Record<string, unknown>;
};

/**
 * Coverage for the `findOrThrow` adoption (DRY/slop audit §2.J) in the
 * contexts service. `findOne`, `update`, `remove`, and `removeEntry` route
 * their org-scoped "fetch or 404" through the shared helper; these lock in the
 * tenant scoping, soft-delete filtering, and the canonical JSON:API 404 shape
 * (the resource-only form, without an identifier).
 */
describe('ContextsService — findOrThrow tenant scoping', () => {
  function storeDelegate(rows: ContextRow[]) {
    const matches = (
      where: Record<string, unknown>,
      row: ContextRow,
    ): boolean =>
      (where.id === undefined || where.id === row.id) &&
      (where.organizationId === undefined ||
        where.organizationId === row.organizationId) &&
      (where.contextBaseId === undefined ||
        where.contextBaseId === row.contextBaseId) &&
      (where.isDeleted === undefined || where.isDeleted === row.isDeleted);

    return {
      findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(rows.find((row) => matches(where, row)) ?? null),
      ),
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.find((row) => row.id === where.id) ?? null),
      ),
      update: vi.fn(
        ({ where, data }: { where: { id: string }; data: unknown }) =>
          Promise.resolve({
            ...rows.find((row) => row.id === where.id),
            ...(data as Record<string, unknown>),
          }),
      ),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
    };
  }

  function buildService(options: {
    contextBases?: ContextRow[];
    contextEntries?: ContextRow[];
  }) {
    const contextBase = storeDelegate(options.contextBases ?? []);
    const contextEntry = storeDelegate(options.contextEntries ?? []);

    const service = new ContextsService(
      { contextBase, contextEntry } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      {} as unknown as ModelsService,
      {} as unknown as ReplicateService,
    );

    return { contextBase, contextEntry, service };
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('findOne: authorized access returns the normalized context base', async () => {
    const { service, contextBase } = buildService({
      contextBases: [
        {
          data: { label: 'Voice' },
          id: 'ctx-1',
          isDeleted: false,
          mongoId: null,
          organizationId: 'org-1',
        },
      ],
    });

    const result = await service.findOne('ctx-1', 'org-1');

    expect(contextBase.findFirst).toHaveBeenCalledWith({
      where: { id: 'ctx-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(result).toMatchObject({ id: 'ctx-1', organization: 'org-1' });
  });

  it('findOne: wrong-organization access 404s', async () => {
    const { service } = buildService({
      contextBases: [
        {
          id: 'ctx-1',
          isDeleted: false,
          mongoId: null,
          organizationId: 'org-1',
        },
      ],
    });

    await expect(service.findOne('ctx-1', 'org-2')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('findOne: soft-deleted rows 404', async () => {
    const { service } = buildService({
      contextBases: [
        {
          id: 'ctx-1',
          isDeleted: true,
          mongoId: null,
          organizationId: 'org-1',
        },
      ],
    });

    await expect(service.findOne('ctx-1', 'org-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('findOne: preserves the canonical JSON:API 404 shape (no identifier form)', async () => {
    const { service } = buildService({ contextBases: [] });

    try {
      await service.findOne('missing', 'org-1');
      throw new Error('expected NotFoundException');
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
      const exception = error as NotFoundException;
      expect(exception.getStatus()).toBe(404);
      expect(exception.getResponse()).toEqual({
        detail: 'Context base not found',
        title: 'Resource Not Found',
      });
    }
  });

  it('remove: authorized access soft-deletes the base and its entries', async () => {
    const { service, contextBase, contextEntry } = buildService({
      contextBases: [
        {
          id: 'ctx-1',
          isDeleted: false,
          mongoId: null,
          organizationId: 'org-1',
        },
      ],
    });

    await service.remove('ctx-1', 'org-1');

    expect(contextBase.update).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: { id: 'ctx-1' },
    });
    expect(contextEntry.updateMany).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: { contextBaseId: 'ctx-1', isDeleted: false },
    });
  });

  it('remove: wrong-organization access 404s and never writes', async () => {
    const { service, contextBase, contextEntry } = buildService({
      contextBases: [
        {
          id: 'ctx-1',
          isDeleted: false,
          mongoId: null,
          organizationId: 'org-1',
        },
      ],
    });

    await expect(service.remove('ctx-1', 'org-2')).rejects.toThrow(
      NotFoundException,
    );
    expect(contextBase.update).not.toHaveBeenCalled();
    expect(contextEntry.updateMany).not.toHaveBeenCalled();
  });

  it('removeEntry: authorized access soft-deletes the scoped entry', async () => {
    const { service, contextEntry } = buildService({
      contextBases: [
        {
          data: { entryCount: 5 },
          id: 'ctx-1',
          isDeleted: false,
          mongoId: null,
          organizationId: 'org-1',
        },
      ],
      contextEntries: [
        {
          contextBaseId: 'ctx-1',
          id: 'entry-1',
          isDeleted: false,
          mongoId: null,
          organizationId: 'org-1',
        },
      ],
    });

    await service.removeEntry('ctx-1', 'entry-1', 'org-1');

    expect(contextEntry.findFirst).toHaveBeenCalledWith({
      where: {
        contextBaseId: 'ctx-1',
        id: 'entry-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(contextEntry.update).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: { id: 'entry-1' },
    });
  });

  it('removeEntry: wrong-organization access 404s with the Entry resource', async () => {
    const { service, contextEntry } = buildService({
      contextEntries: [
        {
          contextBaseId: 'ctx-1',
          id: 'entry-1',
          isDeleted: false,
          mongoId: null,
          organizationId: 'org-1',
        },
      ],
    });

    try {
      await service.removeEntry('ctx-1', 'entry-1', 'org-2');
      throw new Error('expected NotFoundException');
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toEqual({
        detail: 'Entry not found',
        title: 'Resource Not Found',
      });
    }
    expect(contextEntry.update).not.toHaveBeenCalled();
  });
});
