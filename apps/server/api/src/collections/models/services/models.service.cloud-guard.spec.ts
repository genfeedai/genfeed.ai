vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ModelsService } from '@api/collections/models/services/models.service';
import {
  buildGuardedDelegate,
  type GuardedRow,
  idsOf,
} from '@api/collections/models/testing/cloud-guarded-delegate';
import { findModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
} from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { TenantIsolationError } from '@libs/prisma/tenant-guard';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';

function makeRow(overrides: Partial<GuardedRow> & { id: string }): GuardedRow {
  return {
    category: ModelCategory.IMAGE,
    config: {},
    cost: 5,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    endpoint: overrides.id,
    isActive: true,
    isDefault: false,
    isDeleted: false,
    isDiscovered: false,
    key: overrides.id,
    label: overrides.id,
    lifecycle: ModelLifecycle.AVAILABLE,
    organizationId: null,
    provider: ModelProvider.REPLICATE,
    providerContracts: [],
    supportsFeatures: [],
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function setup() {
  const rows = [
    makeRow({ id: 'platform' }),
    makeRow({ id: 'platform-deleted', isDeleted: true }),
    makeRow({ id: 'mine', organizationId: ORG }),
    makeRow({ id: 'theirs', organizationId: OTHER_ORG }),
  ];
  const delegate = buildGuardedDelegate('Model', rows);
  const prisma = { model: delegate } as unknown as PrismaService;
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const inTenant = <T>(callback: () => Promise<T>) =>
    runWithTenantContext({ organizationId: ORG }, callback);

  return { inTenant, prisma, rows, service: new ModelsService(prisma, logger) };
}

describe('ModelsService under the CLOUD tenant guard', () => {
  it('finds a platform model by key without naming an organization', async () => {
    const { inTenant, service } = setup();

    const model = await inTenant(() => service.findOne({ key: 'platform' }));

    expect(model?.id).toBe('platform');
  });

  it('finds the tenant own model by key', async () => {
    const { inTenant, service } = setup();

    const model = await inTenant(() => service.findOne({ key: 'mine' }));

    expect(model?.id).toBe('mine');
  });

  it('never finds another organization model by key', async () => {
    const { inTenant, service } = setup();

    await expect(
      inTenant(() => service.findOne({ key: 'theirs' })),
    ).resolves.toBeNull();
  });

  it('finds a platform model when the caller names the platform', async () => {
    const { inTenant, service } = setup();

    const model = await inTenant(() =>
      service.findOne({ key: 'platform', organizationId: null }),
    );

    expect(model?.id).toBe('platform');
  });

  it('lists platform plus own rows and no foreign rows', async () => {
    const { inTenant, service } = setup();

    const page = await inTenant(() =>
      service.findAll({}, { pagination: false }),
    );

    expect(idsOf(page.docs)).toEqual(['mine', 'platform']);
  });

  it('lists platform plus own rows through the raw find', async () => {
    const { inTenant, service } = setup();

    const docs = await inTenant(() => service.find({ isDeleted: false }));

    expect(idsOf(docs)).toEqual(['mine', 'platform']);
  });

  it('keeps a platform-only active read to platform rows', async () => {
    const { inTenant, service } = setup();

    const docs = await inTenant(() =>
      service.findAllActive({ organizationId: null }),
    );

    expect(idsOf(docs)).toEqual(['platform']);
  });

  it('reads active models for the tenant as platform plus own', async () => {
    const { inTenant, service } = setup();

    const docs = await inTenant(() => service.findAllActive());

    expect(idsOf(docs)).toEqual(['mine', 'platform']);
  });

  it('finds available models without an organization as platform plus own', async () => {
    const { inTenant, service } = setup();

    const docs = await inTenant(() => service.findAvailableModels());

    expect(idsOf(docs)).toEqual(['mine', 'platform']);
  });

  it('counts platform plus own rows', async () => {
    const { inTenant, service } = setup();

    await expect(
      inTenant(() => service.count({ isDeleted: false })),
    ).resolves.toBe(2);
  });

  it('resolves a billable pricing profile for a platform key', async () => {
    const { inTenant, prisma } = setup();

    const profile = await inTenant(() =>
      findModelBillablePricingProfile(prisma, 'platform'),
    );

    expect(profile?.key).toBe('platform');
  });

  it('hides a foreign billable pricing profile', async () => {
    const { inTenant, prisma } = setup();

    await expect(
      inTenant(() => findModelBillablePricingProfile(prisma, 'theirs')),
    ).resolves.toBeNull();
  });

  it('patches a platform model and the tenant own model but not a foreign one', async () => {
    const { inTenant, rows, service } = setup();

    await inTenant(() => service.patch('platform', { label: 'Renamed' }));
    await inTenant(() => service.patch('mine', { label: 'Mine 2' }));

    expect(rows.find((row) => row.id === 'platform')?.label).toBe('Renamed');
    expect(rows.find((row) => row.id === 'mine')?.label).toBe('Mine 2');
    await expect(
      inTenant(() => service.patch('theirs', { label: 'Hijacked' })),
    ).rejects.toThrow();
    expect(rows.find((row) => row.id === 'theirs')?.label).toBe('theirs');
  });

  it('runs the superadmin registry rejection against a platform row', async () => {
    const { inTenant, rows, service } = setup();

    await inTenant(() =>
      service.rejectRegistryModel('platform', { reason: 'unsafe' }),
    );

    expect(rows.find((row) => row.id === 'platform')).toMatchObject({
      isActive: false,
      reviewStatus: 'rejected',
    });
  });

  it('proves the guard still rejects an unproven platform-only read', async () => {
    const { inTenant, prisma } = setup();

    await expect(
      inTenant(() =>
        Promise.resolve(
          prisma.model.findMany({
            where: { isDeleted: false, organizationId: null },
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });

  describe('unpriceable (red) model ids for the /models list', () => {
    function setupRed() {
      const pricing = {
        costPerUnit: null,
        hasAudioToggle: false,
        hasResolutionOptions: false,
        isFree: false,
        minCost: null,
        pricingType: 'flat',
        providerCostUsd: null,
        providerInputSchema: null,
        reviewedProviderContractVersion: null,
      };
      const rows = [
        makeRow({ id: 'priced', ...pricing }),
        makeRow({ cost: 0, id: 'red-platform', ...pricing }),
        makeRow({
          cost: 0,
          id: 'red-mine',
          organizationId: ORG,
          ...pricing,
        }),
        makeRow({
          cost: 0,
          id: 'red-theirs',
          organizationId: OTHER_ORG,
          ...pricing,
        }),
        makeRow({ cost: 0, id: 'red-deleted', isDeleted: true, ...pricing }),
      ];
      const prisma = {
        model: buildGuardedDelegate('Model', rows),
      } as unknown as PrismaService;
      const logger = {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService;
      return new ModelsService(prisma, logger);
    }

    it('classifies platform and own rows for a tenant caller, never another organization', async () => {
      const service = setupRed();

      const ids = await runWithTenantContext({ organizationId: ORG }, () =>
        service.findUnpriceableModelIds(ORG),
      );

      expect([...ids].sort()).toEqual(['red-mine', 'red-platform']);
    });

    it('passes the real tenant guard without an organization argument inside a tenant request', async () => {
      const service = setupRed();

      const ids = await runWithTenantContext({ organizationId: ORG }, () =>
        service.findUnpriceableModelIds(),
      );

      expect([...ids].sort()).toEqual(['red-mine', 'red-platform']);
    });
  });
});
