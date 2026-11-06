import 'reflect-metadata';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandOsRevisionsController } from '@api/collections/brands/controllers/brand-os-revisions.controller';
import type { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { MemberRole } from '@genfeedai/contracts';
import { buildBrandKitDraftFromBrand } from '@genfeedai/helpers';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';

const request = {
  originalUrl: '/v1/brands/brand-1/brand-os/revisions',
} as Request;
const user = { id: 'canonical-user-1', organizationId: 'org-1' } as User;
const content = buildBrandKitDraftFromBrand({ id: 'brand-1', label: 'Acme' });
const revision = {
  approvedAt: null,
  approvedById: null,
  brandId: 'brand-1',
  content,
  createdAt: '2026-09-14T10:00:00.000Z',
  exportSchemaVersion: '1',
  id: 'rev-1',
  organizationId: 'org-1',
  status: 'DRAFT',
  updatedAt: '2026-09-14T10:00:00.000Z',
  version: 1,
};

type Revision = typeof revision & {
  generationRulesReviewCandidateHash?: string;
  generationRulesReviewHash?: string | null;
};

/** Revisions stored per organization and brand, as the service scopes them. */
function harness(stored: Revision[] = [{ ...revision }]) {
  const rows = stored;
  const find = (organizationId: string, brandId: string, id: string) => {
    const row = rows.find(
      (item) =>
        item.organizationId === organizationId &&
        item.brandId === brandId &&
        item.id === id,
    );
    if (!row) throw new NotFoundException('Brand OS revision', id);
    return row;
  };
  const assertFresh = (row: Revision, updatedAt: string) => {
    if (row.updatedAt !== updatedAt)
      throw new ConflictException('Revision changed');
  };
  const service = {
    approve: async (
      organizationId: string,
      brandId: string,
      id: string,
      approvedById: string,
      updatedAt: string,
      reviewedHash?: string,
    ) => {
      const row = find(organizationId, brandId, id);
      assertFresh(row, updatedAt);
      return Object.assign(row, {
        approvedAt: '2026-09-14T11:00:00.000Z',
        approvedById,
        generationRulesReviewHash: reviewedHash ?? null,
        status: 'APPROVED',
      });
    },
    get: async (organizationId: string, brandId: string, id: string) =>
      find(organizationId, brandId, id),
    list: async (organizationId: string, brandId: string) =>
      rows.filter(
        (item) =>
          item.organizationId === organizationId && item.brandId === brandId,
      ),
    update: async (
      organizationId: string,
      brandId: string,
      id: string,
      nextContent: typeof content,
      updatedAt: string,
    ) => {
      const row = find(organizationId, brandId, id);
      assertFresh(row, updatedAt);
      return Object.assign(row, {
        content: nextContent,
        updatedAt: '2026-09-14T10:30:00.000Z',
      });
    },
  };
  return {
    controller: new BrandOsRevisionsController(
      service as unknown as BrandOsRevisionsService,
    ),
    rows,
  };
}

describe('BrandOsRevisionsController', () => {
  it('restricts mutations to owner/admin and guards every route with membership authorization', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, BrandOsRevisionsController),
    ).toContain(RolesGuard);
    for (const method of ['create', 'update', 'approve'] as const) {
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          BrandOsRevisionsController.prototype[method],
        ),
      ).toEqual([MemberRole.OWNER, MemberRole.ADMIN]);
    }
  });

  it('lists and reads only the caller organization revisions, serialized', async () => {
    const { controller } = harness([
      { ...revision },
      { ...revision, id: 'rev-foreign', organizationId: 'org-2' },
    ]);

    const list = await controller.list(request, user, 'brand-1');
    const detail = await controller.get(request, user, 'brand-1', 'rev-1');

    expect(list).toMatchObject({
      data: [{ attributes: { status: 'DRAFT', version: 1 }, id: 'rev-1' }],
    });
    expect(JSON.stringify(list)).not.toContain('rev-foreign');
    expect(detail).toMatchObject({
      data: {
        attributes: { brandId: 'brand-1', status: 'DRAFT' },
        id: 'rev-1',
      },
    });
    await expect(
      controller.get(request, user, 'brand-1', 'rev-foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('serializes a candidate hash from the scoped revision', async () => {
    const candidateHash = `sha256:${'b'.repeat(64)}`;
    const { controller } = harness([
      { ...revision, generationRulesReviewCandidateHash: candidateHash },
    ]);

    const output = await controller.get(request, user, 'brand-1', 'rev-1');

    expect(output).toMatchObject({
      data: {
        attributes: { generationRulesReviewCandidateHash: candidateHash },
      },
    });
  });

  it('applies the concurrency token and records the canonical approver', async () => {
    const { controller, rows } = harness();
    const edited = { ...content, label: 'Acme 2' } as typeof content;

    await controller.update(request, user, 'brand-1', 'rev-1', {
      content: edited,
      updatedAt: revision.updatedAt,
    });
    await expect(
      controller.approve(request, user, 'brand-1', 'rev-1', {
        updatedAt: revision.updatedAt,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    const approved = await controller.approve(
      request,
      user,
      'brand-1',
      'rev-1',
      {
        updatedAt: '2026-09-14T10:30:00.000Z',
      },
    );

    expect(rows[0]).toMatchObject({
      approvedById: 'canonical-user-1',
      content: edited,
      generationRulesReviewHash: null,
      status: 'APPROVED',
    });
    expect(approved).toMatchObject({
      data: {
        attributes: { approvedById: 'canonical-user-1', status: 'APPROVED' },
      },
    });
  });

  it('approves with the exact digest, authenticated org and canonical actor, ignoring body authority', async () => {
    const { controller, rows } = harness([
      { ...revision },
      { ...revision, organizationId: 'attacker-org' },
    ]);
    const reviewedGenerationRulesHash = `sha256:${'a'.repeat(64)}`;
    const dto = {
      updatedAt: revision.updatedAt,
      reviewedGenerationRulesHash,
      organizationId: 'attacker-org',
      userId: 'attacker-user',
      content: { injected: true },
      approved: true,
    };

    await controller.approve(
      request,
      { ...user, userId: 'canonical-database-user', id: 'auth-provider-id' },
      'brand-1',
      'rev-1',
      dto,
    );

    expect(rows).toEqual([
      expect.objectContaining({
        approvedById: 'canonical-database-user',
        content,
        generationRulesReviewHash: reviewedGenerationRulesHash,
        organizationId: 'org-1',
        status: 'APPROVED',
      }),
      expect.objectContaining({
        approvedById: null,
        organizationId: 'attacker-org',
        status: 'DRAFT',
      }),
    ]);
  });

  it.each([
    ['actor', { organizationId: 'org-1' }],
    ['tenant', { id: 'user-1' }],
  ])('rejects a missing %s before approval', async (_missing, context) => {
    const { controller, rows } = harness();

    await expect(
      controller.approve(
        request,
        context as unknown as User,
        'brand-1',
        'rev-1',
        {
          updatedAt: revision.updatedAt,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(rows[0].status).toBe('DRAFT');
  });

  it('rejects missing tenant context before listing', async () => {
    const { controller } = harness();
    await expect(
      controller.list(request, { id: 'user-1' } as User, 'brand-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
