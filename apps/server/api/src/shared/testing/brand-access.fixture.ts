import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import type { BrandedGenerationInputV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { vi } from 'vitest';

/** Existing collaborator tests use fixture database delegates, never an authorization stub. */
export function brandAccessFixture(prisma?: PrismaService): BrandAccessService {
  return new BrandAccessService(
    prisma ??
      ({
        member: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ role: { key: MemberRole.ADMIN }, brands: [] }),
        },
        brand: {
          findFirst: vi.fn().mockResolvedValue({ id: 'fixture-brand' }),
        },
      } as unknown as PrismaService),
  );
}
export function snapshotInitiatingActor(input: BrandedGenerationInputV1) {
  return { organizationId: input.organizationId, userId: input.actorId };
}
