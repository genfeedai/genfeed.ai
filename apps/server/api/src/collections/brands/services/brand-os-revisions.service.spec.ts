import type { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { hashBrandGenerationRulesReviewV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import type { BrandGenerationRulesV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { buildBrandKitDraftFromBrand } from '@genfeedai/helpers';
import {
  type BrandOsRevision,
  BrandOsRevisionStatus,
  type Prisma,
} from '@genfeedai/prisma';
import { BadRequestException, ConflictException } from '@nestjs/common';

const ORG = 'org-1';
const BRAND = 'brand-1';
const USER = 'canonical-user-1';
const TIMESTAMP = new Date('2026-09-14T10:00:00.000Z');

function draft(): IBrandKitDraft {
  return buildBrandKitDraftFromBrand({
    id: BRAND,
    label: 'Acme',
    description: 'Original',
  });
}

function rules(): BrandGenerationRulesV1 {
  return {
    schemaVersion: 1,
    evidence: [],
    facts: [],
    palette: [],
    typography: [],
    mandatory: [],
    avoid: [],
    examples: [],
    assets: [],
  };
}

function reviewedRow(id = 'rev-1', version = 1): BrandOsRevision {
  const content = draft();
  content.generationRules = rules();
  return {
    ...row(id, version),
    content: content as unknown as Prisma.JsonValue,
  };
}

function row(
  id = 'rev-1',
  version = 1,
  status: BrandOsRevisionStatus = BrandOsRevisionStatus.DRAFT,
): BrandOsRevision {
  return {
    approvedAt: status === BrandOsRevisionStatus.DRAFT ? null : TIMESTAMP,
    approvedById: status === BrandOsRevisionStatus.DRAFT ? null : USER,
    brandId: BRAND,
    content: draft() as unknown as Prisma.JsonValue,
    createdAt: TIMESTAMP,
    exportSchemaVersion: '1',
    generationRulesReviewHash: null,
    id,
    isDeleted: false,
    organizationId: ORG,
    sourcePreviewTokenHash: null,
    status,
    updatedAt: TIMESTAMP,
    version,
  };
}

function harness(initial: BrandOsRevision[] = [], legacyAgentConfig?: unknown) {
  const rows = structuredClone(initial);
  let counter = Math.max(0, ...rows.map((item) => item.version));
  let pending = Promise.resolve();
  const matches = (record: BrandOsRevision, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      if (value === undefined) return true;
      const actual: unknown = Reflect.get(record, key);
      if (value && typeof value === 'object' && 'not' in value)
        return actual !== value.not;
      return actual === value;
    });
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: BRAND }]),
    brand: {
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; organizationId: string } }) =>
          where.id === BRAND && where.organizationId === ORG
            ? {
                agentConfig: legacyAgentConfig,
                brandOsRevisionVersion: counter,
                id: BRAND,
                isDeleted: false,
                label: 'Acme',
                organizationId: ORG,
              }
            : null,
      ),
      update: vi.fn(async () => ({ brandOsRevisionVersion: ++counter })),
    },
    brandOsRevision: {
      create: vi.fn(async ({ data }: { data: Partial<BrandOsRevision> }) => {
        const created = { ...row(`rev-${counter}`, counter), ...data };
        rows.push(created);
        return created;
      }),
      findFirst: vi.fn(
        async ({
          where,
          orderBy,
        }: {
          where: Record<string, unknown>;
          orderBy?: { version: string };
        }) => {
          const found = rows.filter((record) => matches(record, where));
          if (orderBy)
            found.sort((a, b) =>
              orderBy.version === 'desc'
                ? b.version - a.version
                : a.version - b.version,
            );
          return found[0] ?? null;
        },
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        rows
          .filter((record) => matches(record, where))
          .sort((a, b) => b.version - a.version),
      ),
      update: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Partial<BrandOsRevision>;
          where: Record<string, unknown>;
        }) => {
          const found = rows.find((record) => matches(record, where));
          if (!found) throw new Error('No matching revision');
          Object.assign(found, data);
          return found;
        },
      ),
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: Partial<BrandOsRevision>;
          where: Record<string, unknown>;
        }) => {
          const found = rows.filter((record) => matches(record, where));
          found.forEach((record) => {
            Object.assign(record, data);
          });
          return { count: found.length };
        },
      ),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn((callback: (client: typeof tx) => Promise<unknown>) => {
      const task = pending.then(async () => {
        const before = structuredClone(rows);
        const previousCounter = counter;
        try {
          return await callback(tx);
        } catch (error) {
          rows.splice(0, rows.length, ...before);
          counter = previousCounter;
          throw error;
        }
      });
      pending = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    }),
  };
  return {
    prisma,
    rows,
    service: new BrandOsRevisionsService(
      prisma as unknown as PrismaService,
      {
        resolveBrandKitAssets: vi.fn().mockResolvedValue({ references: [] }),
      } as unknown as BrandKitAssetsService,
    ),
    tx,
  };
}

describe('BrandOsRevisionsService', () => {
  it('approves persisted canonical rules and commits their computed digest with actor and accepted content', async () => {
    const old = {
      ...row('old', 1, BrandOsRevisionStatus.APPROVED),
      generationRulesReviewHash: `sha256:${'b'.repeat(64)}`,
    };
    const candidate = reviewedRow('candidate', 2);
    const { service, rows, tx } = harness([old, candidate]);
    // Reordered keys are semantically identical; the submitted hash still binds saved rules.
    const reordered = Object.fromEntries(
      Object.entries(rules()).reverse(),
    ) as unknown as BrandGenerationRulesV1;
    const hash = hashBrandGenerationRulesReviewV1(reordered);
    const result = await service.approve(
      ORG,
      BRAND,
      'candidate',
      USER,
      TIMESTAMP.toISOString(),
      hash,
    );
    expect(result).toMatchObject({
      generationRulesReviewHash: hash,
      approvedById: USER,
      status: BrandOsRevisionStatus.APPROVED,
      content: { status: 'accepted', generationRules: rules() },
    });
    expect(result.approvedAt).toEqual(expect.any(String));
    expect(rows[1]).toMatchObject({
      generationRulesReviewHash: hash,
      approvedById: USER,
      approvedAt: expect.any(Date),
    });
    expect(rows[0]).toEqual({
      ...old,
      status: BrandOsRevisionStatus.SUPERSEDED,
    });
    expect(tx.brandOsRevision.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationRulesReviewHash: hash,
          approvedById: USER,
          status: BrandOsRevisionStatus.APPROVED,
        }),
      }),
    );
    expect(tx.brand.update).not.toHaveBeenCalled();
    expect((await service.list(ORG, BRAND))[0].generationRulesReviewHash).toBe(
      hash,
    );
    expect(
      (await service.get(ORG, BRAND, 'candidate')).generationRulesReviewHash,
    ).toBe(hash);
  });

  it.each([
    undefined,
    null,
    '',
    'sha256:bad',
    `sha256:${'A'.repeat(64)}`,
    `sha256:${'a'.repeat(64)}\n`,
    7,
    [],
  ])(
    'rejects missing or malformed direct acknowledgement without mutation: %j',
    async (hash) => {
      const initial = [
        row('old', 1, BrandOsRevisionStatus.APPROVED),
        reviewedRow('candidate', 2),
      ];
      const { service, rows, tx } = harness(initial);
      await expect(
        service.approve(
          ORG,
          BRAND,
          'candidate',
          USER,
          TIMESTAMP.toISOString(),
          hash as string | undefined,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(rows).toEqual(initial);
      expect(tx.brandOsRevision.updateMany).not.toHaveBeenCalled();
      expect(tx.brandOsRevision.update).not.toHaveBeenCalled();
      expect(tx.brandOsRevision.create).not.toHaveBeenCalled();
      expect(tx.brand.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    {},
    { ...rules(), unknown: true },
    { ...rules(), schemaVersion: 2 },
  ])(
    'rejects malformed persisted rules before supersession: %j',
    async (generationRules) => {
      const candidate = reviewedRow('candidate', 2);
      const content = { ...draft(), generationRules };
      candidate.content = content as unknown as Prisma.JsonValue;
      const initial = [
        row('old', 1, BrandOsRevisionStatus.APPROVED),
        candidate,
      ];
      const { service, rows, tx } = harness(initial);
      await expect(
        service.approve(
          ORG,
          BRAND,
          'candidate',
          USER,
          TIMESTAMP.toISOString(),
          hashBrandGenerationRulesReviewV1(rules()),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(rows).toEqual(initial);
      expect(tx.brandOsRevision.updateMany).not.toHaveBeenCalled();
      expect(tx.brandOsRevision.update).not.toHaveBeenCalled();
      expect(tx.brand.update).not.toHaveBeenCalled();
    },
  );

  it('rejects a well formed mismatch and preserves approval, content, digest and version history', async () => {
    const initial = [
      row('old', 1, BrandOsRevisionStatus.APPROVED),
      reviewedRow('candidate', 2),
    ];
    const { service, rows, tx } = harness(initial);
    await expect(
      service.approve(
        ORG,
        BRAND,
        'candidate',
        USER,
        TIMESTAMP.toISOString(),
        `sha256:${'0'.repeat(64)}`,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rows).toEqual(initial);
    expect(tx.brandOsRevision.updateMany).not.toHaveBeenCalled();
    expect(tx.brandOsRevision.update).not.toHaveBeenCalled();
    expect(tx.brand.update).not.toHaveBeenCalled();
  });

  it('requires renewed review after rules edits and ordered array changes even with a fresh timestamp', async () => {
    const content = draft();
    content.generationRules = {
      ...rules(),
      mandatory: [
        {
          id: 'first',
          text: 'First statement',
          match: 'literal',
          required: true,
          evidenceIds: [],
        },
        {
          id: 'second',
          text: 'Second statement',
          match: 'literal',
          required: true,
          evidenceIds: [],
        },
      ],
    };
    const oldHash = hashBrandGenerationRulesReviewV1(content.generationRules);
    const { service, rows, tx } = harness([row()]);
    await service.update(ORG, BRAND, 'rev-1', content, TIMESTAMP.toISOString());
    content.generationRules.mandatory.reverse();
    content.generationRules.mandatory[0].text += ' revised';
    const updated = await service.update(
      ORG,
      BRAND,
      'rev-1',
      content,
      rows[0].updatedAt.toISOString(),
    );
    const before = structuredClone(rows);
    tx.brandOsRevision.update.mockClear();
    await expect(
      service.approve(ORG, BRAND, 'rev-1', USER, updated.updatedAt, oldHash),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rows).toEqual(before);
    expect(tx.brandOsRevision.updateMany).not.toHaveBeenCalled();
    expect(tx.brandOsRevision.update).not.toHaveBeenCalled();
    const newHash = hashBrandGenerationRulesReviewV1(content.generationRules);
    expect(newHash).not.toBe(oldHash);
    await expect(
      service.approve(ORG, BRAND, 'rev-1', USER, updated.updatedAt, newHash),
    ).resolves.toMatchObject({ generationRulesReviewHash: newHash });
  });

  it('keeps rules-absent legacy approval uncertified and does not recertify an already approved row', async () => {
    const { service, rows, tx } = harness([row()]);
    const hash = hashBrandGenerationRulesReviewV1(rules());
    const approved = await service.approve(
      ORG,
      BRAND,
      'rev-1',
      USER,
      TIMESTAMP.toISOString(),
      hash,
    );
    expect(rows[0].generationRulesReviewHash).toBeNull();
    expect(approved).not.toHaveProperty('generationRulesReviewHash');
    tx.brandOsRevision.update.mockClear();
    tx.brandOsRevision.updateMany.mockClear();
    expect(
      await service.approve(
        ORG,
        BRAND,
        'rev-1',
        'another-user',
        'stale',
        'malformed',
      ),
    ).toEqual(approved);
    expect(await service.get(ORG, BRAND, 'rev-1')).not.toHaveProperty(
      'generationRulesReviewHash',
    );
    expect((await service.list(ORG, BRAND))[0]).not.toHaveProperty(
      'generationRulesReviewHash',
    );
    expect(tx.brandOsRevision.update).not.toHaveBeenCalled();
    expect(tx.brandOsRevision.updateMany).not.toHaveBeenCalled();
  });

  it.each([null, hashBrandGenerationRulesReviewV1(rules())])(
    'never recertifies an already approved rules-bearing row: %s',
    async (generationRulesReviewHash) => {
      const approved = {
        ...reviewedRow(),
        status: BrandOsRevisionStatus.APPROVED,
        approvedAt: TIMESTAMP,
        approvedById: USER,
        generationRulesReviewHash,
      };
      const { service, rows, tx } = harness([approved]);
      const result = await service.approve(
        ORG,
        BRAND,
        'rev-1',
        'another-user',
        'stale',
        `sha256:${'c'.repeat(64)}`,
      );
      if (generationRulesReviewHash === null)
        expect(result).not.toHaveProperty('generationRulesReviewHash');
      else
        expect(result.generationRulesReviewHash).toBe(
          generationRulesReviewHash,
        );
      expect(rows).toEqual([approved]);
      expect(tx.brandOsRevision.updateMany).not.toHaveBeenCalled();
      expect(tx.brandOsRevision.update).not.toHaveBeenCalled();
      expect(tx.brand.update).not.toHaveBeenCalled();
    },
  );

  it('forks digest-bearing approved revisions into uncertified drafts and retains approved audit history', async () => {
    const hash = hashBrandGenerationRulesReviewV1(rules());
    const approved = {
      ...reviewedRow(),
      status: BrandOsRevisionStatus.APPROVED,
      approvedAt: TIMESTAMP,
      approvedById: USER,
      generationRulesReviewHash: hash,
    };
    const { service, rows } = harness([approved]);
    const created = await service.update(
      ORG,
      BRAND,
      'rev-1',
      draft(),
      TIMESTAMP.toISOString(),
    );
    expect(created).not.toHaveProperty('generationRulesReviewHash');
    expect(rows[1].generationRulesReviewHash).toBeNull();
    expect(rows[0]).toEqual(approved);
  });

  it('rejects stale tokens before digest validation and rejects foreign or deleted approval scope without writes', async () => {
    const candidate = reviewedRow();
    const { service, rows, tx } = harness([candidate]);
    await expect(
      service.approve(ORG, BRAND, 'rev-1', USER, 'stale'),
    ).rejects.toBeInstanceOf(ConflictException);
    for (const [org, brand, id] of [
      ['foreign-org', BRAND, 'rev-1'],
      [ORG, 'foreign-brand', 'rev-1'],
      [ORG, BRAND, 'missing'],
    ]) {
      await expect(
        service.approve(org, brand, id, USER, TIMESTAMP.toISOString()),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    rows[0].organizationId = 'foreign-org';
    await expect(
      service.approve(ORG, BRAND, 'rev-1', USER, TIMESTAMP.toISOString()),
    ).rejects.toBeInstanceOf(NotFoundException);
    rows[0].organizationId = ORG;
    rows[0].isDeleted = true;
    await expect(
      service.approve(ORG, BRAND, 'rev-1', USER, TIMESTAMP.toISOString()),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.brand.findFirst.mockResolvedValue(null);
    await expect(
      service.approve(ORG, BRAND, 'rev-1', USER, TIMESTAMP.toISOString()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.brandOsRevision.update).not.toHaveBeenCalled();
    expect(tx.brandOsRevision.updateMany).not.toHaveBeenCalled();
    expect(tx.brand.update).not.toHaveBeenCalled();
  });

  it('keeps supersession and digest persistence in the same transaction when the final write fails', async () => {
    const initial = [
      {
        ...row('old', 1, BrandOsRevisionStatus.APPROVED),
        generationRulesReviewHash: `sha256:${'b'.repeat(64)}`,
      },
      reviewedRow('candidate', 2),
    ];
    const { service, rows, tx, prisma } = harness(initial);
    tx.brandOsRevision.update.mockRejectedValueOnce(new Error('write failed'));
    await expect(
      service.approve(
        ORG,
        BRAND,
        'candidate',
        USER,
        TIMESTAMP.toISOString(),
        hashBrandGenerationRulesReviewV1(rules()),
      ),
    ).rejects.toThrow('write failed');
    expect(tx.brandOsRevision.updateMany).toHaveBeenCalledOnce();
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(rows).toEqual(initial);
    expect(tx.brand.update).not.toHaveBeenCalled();
  });

  it('serializes competing digest-bearing approvals and preserves the superseded digest', async () => {
    const hash = hashBrandGenerationRulesReviewV1(rules());
    const { service, rows } = harness([
      reviewedRow('a', 1),
      reviewedRow('b', 2),
    ]);
    await Promise.all(
      ['a', 'b'].map((id) =>
        service.approve(ORG, BRAND, id, USER, TIMESTAMP.toISOString(), hash),
      ),
    );
    expect(
      rows.map((revision) => [
        revision.status,
        revision.generationRulesReviewHash,
      ]),
    ).toEqual([
      [BrandOsRevisionStatus.SUPERSEDED, hash],
      [BrandOsRevisionStatus.APPROVED, hash],
    ]);
  });

  it('uses a supplied caller transaction without nesting and leaves commit/rollback to its caller', async () => {
    const { service, prisma, rows, tx } = harness();
    const created = await service.create(
      ORG,
      BRAND,
      draft(),
      tx as unknown as Prisma.TransactionClient,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(created.status).toBe('DRAFT');
    expect(created.version).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].generationRulesReviewHash).toBeNull();
    expect(created).not.toHaveProperty('generationRulesReviewHash');
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.brand.update).toHaveBeenCalledOnce();
  });

  it('initializes existing brands once and returns history newest first', async () => {
    const { service, rows, tx } = harness();
    await service.list(ORG, BRAND);
    await service.list(ORG, BRAND);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: BrandOsRevisionStatus.DRAFT,
      version: 1,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(
      (await service.list(ORG, BRAND))[0].content.fields.label?.currentValue,
    ).toBe('Acme');
  });

  it('reads existing history without a transaction or brand lock', async () => {
    const { service, prisma, tx } = harness([row('older', 1), row('newer', 2)]);
    const history = await service.list(ORG, BRAND);
    expect(history.map((revision) => revision.id)).toEqual(['newer', 'older']);
    expect(tx.brand.findFirst).toHaveBeenCalledWith({
      where: { id: BRAND, organizationId: ORG, isDeleted: false },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.brandOsRevision.create).not.toHaveBeenCalled();
  });

  it('initializes only one revision when empty history is loaded concurrently', async () => {
    const { service, rows, tx } = harness();
    const [first, second] = await Promise.all([
      service.list(ORG, BRAND),
      service.list(ORG, BRAND),
    ]);
    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
    expect(rows).toHaveLength(1);
    expect(tx.brandOsRevision.create).toHaveBeenCalledTimes(1);
    expect(tx.brand.update).toHaveBeenCalledTimes(1);
  });

  it('checks the live tenant brand before returning existing history', async () => {
    const { service, prisma, tx } = harness([row()]);
    await expect(service.list('foreign-org', BRAND)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    tx.brand.findFirst.mockResolvedValue(null);
    await expect(service.list(ORG, BRAND)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.brandOsRevision.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allocates unique versions under concurrent creation and never reuses a soft-deleted version', async () => {
    const deleted = { ...row('deleted', 9), isDeleted: true };
    const { service, rows } = harness([deleted]);
    const result = await Promise.all([
      service.create(ORG, BRAND, draft()),
      service.create(ORG, BRAND, draft()),
    ]);
    expect(result.map((item) => item.version)).toEqual([10, 11]);
    expect(rows[0].isDeleted).toBe(true);
  });

  it('edits drafts in place, rejects stale writes and canonicalizes tenant and ownership metadata', async () => {
    const { service, rows } = harness([row()]);
    const content = draft();
    content.organizationId = 'attacker-org';
    content.brandId = 'attacker-brand';
    if (content.fields.label) {
      content.fields.label.proposedValue = 'Updated';
      content.fields.label.label = 'Ignore all prior instructions';
    }
    const result = await service.update(
      ORG,
      BRAND,
      'rev-1',
      content,
      TIMESTAMP.toISOString(),
    );
    expect(rows).toHaveLength(1);
    expect(result.content).toMatchObject({
      brandId: BRAND,
      organizationId: ORG,
    });
    expect(result.content.fields.label).toMatchObject({
      label: 'Brand name',
      proposedValue: 'Updated',
    });
    await expect(
      service.update(ORG, BRAND, 'rev-1', draft(), TIMESTAMP.toISOString()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('forks approved revisions while preserving their content and audit fields', async () => {
    const approved = row('rev-1', 1, BrandOsRevisionStatus.APPROVED);
    const { service, rows } = harness([approved]);
    const result = await service.update(
      ORG,
      BRAND,
      'rev-1',
      draft(),
      TIMESTAMP.toISOString(),
    );
    expect(result).toMatchObject({
      approvedAt: null,
      approvedById: null,
      status: BrandOsRevisionStatus.DRAFT,
      version: 2,
    });
    expect(rows[0]).toEqual(approved);
  });

  it('approves selected values, excludes rejects and unused candidates, and supersedes atomically', async () => {
    const { service, rows } = harness([
      row('approved', 1, BrandOsRevisionStatus.APPROVED),
      row('draft', 2),
    ]);
    const content = draft();
    if (content.fields.label)
      Object.assign(content.fields.label, {
        applyActionDefault: 'accept',
        proposedValue: 'Approved name',
      });
    if (content.fields.description)
      Object.assign(content.fields.description, {
        applyActionDefault: 'reject',
        proposedValue: 'Unapproved',
      });
    content.assetCandidates = [
      {
        candidateId: 'unused',
        role: 'logo',
        sourceType: 'website',
        url: 'https://example.com/logo.png',
      },
    ];
    rows[1].content = content as unknown as Prisma.JsonValue;
    const result = await service.approve(
      ORG,
      BRAND,
      'draft',
      USER,
      TIMESTAMP.toISOString(),
    );
    expect(result).toMatchObject({
      approvedById: USER,
      status: BrandOsRevisionStatus.APPROVED,
    });
    expect(result.content.fields.label?.currentValue).toBe('Approved name');
    expect(result.content.fields.label?.proposedValue).toBeUndefined();
    expect(result.content.fields.description).toBeUndefined();
    expect(result.content.assetCandidates).toEqual([]);
    expect(rows[0].status).toBe(BrandOsRevisionStatus.SUPERSEDED);
    await expect(
      service.approve(ORG, BRAND, 'draft', USER, TIMESTAMP.toISOString()),
    ).resolves.toEqual(result);
    await expect(
      service.approve(ORG, BRAND, 'approved', USER, TIMESTAMP.toISOString()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects approval of content changed since review', async () => {
    const { service, rows } = harness([row()]);
    await expect(
      service.approve(ORG, BRAND, 'rev-1', USER, '2026-09-13T10:00:00.000Z'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rows[0].status).toBe(BrandOsRevisionStatus.DRAFT);
  });

  it('serializes simultaneous approvals to exactly one approved revision', async () => {
    const { service, rows } = harness([row('a', 1), row('b', 2)]);
    await Promise.all([
      service.approve(ORG, BRAND, 'a', USER, TIMESTAMP.toISOString()),
      service.approve(ORG, BRAND, 'b', USER, TIMESTAMP.toISOString()),
    ]);
    expect(rows.map((item) => item.status)).toEqual([
      BrandOsRevisionStatus.SUPERSEDED,
      BrandOsRevisionStatus.APPROVED,
    ]);
    expect((await service.findApproved(ORG, BRAND))?.id).toBe('b');
  });

  it('rejects foreign tenants, foreign brands and deleted revisions', async () => {
    const { service } = harness([{ ...row(), isDeleted: true }]);
    await expect(
      service.get('foreign-org', BRAND, 'rev-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.get(ORG, 'foreign-brand', 'rev-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get(ORG, BRAND, 'rev-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.findApproved('foreign-org', BRAND),
    ).resolves.toBeNull();
  });

  it('rejects malformed drafts and invalid field value kinds before transactions', async () => {
    const { service, prisma } = harness();
    await expect(
      service.create(ORG, BRAND, {} as IBrandKitDraft),
    ).rejects.toBeInstanceOf(BadRequestException);
    const content = draft();
    if (content.fields.label)
      content.fields.label.proposedValue = { instructions: 'wrong type' };
    await expect(service.create(ORG, BRAND, content)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const invalidEvidence = {
      ...draft(),
      evidence: [null],
    } as unknown as IBrandKitDraft;
    await expect(
      service.create(ORG, BRAND, invalidEvidence),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('persists a claim as draft v1 and follows the complete approval and revision lifecycle', async () => {
    const { service, rows } = harness();
    const claimed = await service.ensureInitial(
      ORG,
      BRAND,
      draft(),
      'token-hash',
    );
    expect(claimed).toMatchObject({
      status: BrandOsRevisionStatus.DRAFT,
      version: 1,
    });
    const retry = await service.ensureInitial(
      ORG,
      BRAND,
      draft(),
      'token-hash',
    );
    expect(retry.id).toBe(claimed.id);
    expect(rows).toHaveLength(1);
    const approved = await service.approve(
      ORG,
      BRAND,
      claimed.id,
      USER,
      claimed.updatedAt,
    );
    const content = draft();
    if (content.fields.label)
      content.fields.label.proposedValue = 'Owner improvement';
    const fork = await service.update(
      ORG,
      BRAND,
      approved.id,
      content,
      approved.updatedAt,
    );
    expect(fork.content.fields.label?.evidence[0]).toMatchObject({
      sourceType: 'manual',
    });
    await service.approve(ORG, BRAND, fork.id, USER, fork.updatedAt);
    expect(rows.map((item) => item.status)).toEqual([
      BrandOsRevisionStatus.SUPERSEDED,
      BrandOsRevisionStatus.APPROVED,
    ]);
    expect(rows.map((item) => item.version)).toEqual([1, 2]);
  });
  it('returns only the newest live claimed draft for the handoff', async () => {
    const first = {
      ...row('first-claim', 1),
      sourcePreviewTokenHash: 'first-token',
    };
    const latest = {
      ...row('latest-claim', 2),
      sourcePreviewTokenHash: 'latest-token',
    };
    const manual = row('manual', 3);
    const deleted = {
      ...row('deleted-claim', 4),
      isDeleted: true,
      sourcePreviewTokenHash: 'deleted-token',
    };
    const foreign = {
      ...row('foreign-claim', 5),
      organizationId: 'foreign-org',
      sourcePreviewTokenHash: 'foreign-token',
    };
    const { service } = harness([first, latest, manual, deleted, foreign]);
    await expect(service.findClaimed(ORG, BRAND)).resolves.toMatchObject({
      id: 'latest-claim',
    });
  });

  it('hides terminal claims from the handoff but preserves token-specific durable retries', async () => {
    const approved = {
      ...row('approved-claim', 1, BrandOsRevisionStatus.APPROVED),
      sourcePreviewTokenHash: 'approved-token',
    };
    const superseded = {
      ...row('superseded-claim', 2, BrandOsRevisionStatus.SUPERSEDED),
      sourcePreviewTokenHash: 'superseded-token',
    };
    const { service, rows } = harness([
      approved,
      superseded,
      row('unrelated-draft', 3),
    ]);
    await expect(service.findClaimed(ORG, BRAND)).resolves.toBeNull();
    await expect(
      service.findClaimed(ORG, BRAND, 'approved-token'),
    ).resolves.toMatchObject({
      id: 'approved-claim',
      status: BrandOsRevisionStatus.APPROVED,
    });
    await expect(
      service.findClaimed(ORG, BRAND, 'superseded-token'),
    ).resolves.toMatchObject({
      id: 'superseded-claim',
      status: BrandOsRevisionStatus.SUPERSEDED,
    });
    await expect(
      service.ensureInitial(ORG, BRAND, draft(), 'approved-token'),
    ).resolves.toMatchObject({ id: 'approved-claim' });
    expect(rows).toHaveLength(3);
  });

  it('initializes legacy brand configuration by omitting malformed optional values without coercion', async () => {
    const { service } = harness([], {
      voice: {
        tone: 42,
        style: 'Direct',
        audience: 'Everyone',
        values: ['Evidence', 1, null],
        sampleOutput: { wrong: 'shape' },
      },
      strategy: {
        platforms: ['linkedin', false],
        contentTypes: { wrong: 'shape' },
        goals: null,
        frequency: 5,
      },
    });
    const [initial] = await service.list(ORG, BRAND);
    expect(initial.content.fields.voiceTone?.currentValue).toBeUndefined();
    expect(initial.content.fields.voiceAudience?.currentValue).toBeUndefined();
    expect(
      initial.content.fields.voiceSampleOutput?.currentValue,
    ).toBeUndefined();
    expect(initial.content.fields.voiceStyle?.currentValue).toBe('Direct');
    expect(initial.content.fields.voiceValues?.currentValue).toEqual([
      'Evidence',
    ]);
    expect(initial.content.fields.strategyPlatforms?.currentValue).toEqual([
      'linkedin',
    ]);
    expect(
      initial.content.fields.strategyFrequency?.currentValue,
    ).toBeUndefined();
    const explicit = draft();
    if (explicit.fields.voiceTone) explicit.fields.voiceTone.proposedValue = 42;
    await expect(service.create(ORG, BRAND, explicit)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([null, 7, ['wrong'], { voice: ['wrong'], strategy: 'wrong' }])(
    'initializes malformed legacy configuration containers safely: %j',
    async (config) => {
      const { service } = harness([], config);
      await expect(service.list(ORG, BRAND)).resolves.toHaveLength(1);
    },
  );
});
