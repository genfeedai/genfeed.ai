import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IBrandOsRevision } from '@genfeedai/contracts/interfaces';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { ConflictException, Injectable } from '@nestjs/common';

export const SYSTEM_BRAND_ID = 'genfeed-system-brand';
export const SYSTEM_BRAND_SLUG = 'genfeed-system-brand';
const SYSTEM_BRAND_LABEL = 'Genfeed';
const SYSTEM_BRAND_DESCRIPTION =
  'Genfeed’s own voice for generation that has no customer brand: system, lifecycle and internal content.';
const PRISMA_UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/**
 * Runs work inside the system organization's tenant context. The system brand
 * lives outside every customer tenant, so a caller already inside another
 * organization's request context must enter this one before touching it.
 */
export function runAsSystemOrganization<T>(work: () => T): T {
  return runWithTenantContext(
    { organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID },
    work,
  );
}

export interface SystemBrandHandle {
  brandId: string;
  organizationId: string;
  /** The live revision: the approved one, else the DRAFT started from the Genfeed default kit. */
  revision: IBrandOsRevision;
}

/**
 * The dedicated Genfeed brand under the system organization, so internal
 * generation binds a brand id on its receipt like every other branded request.
 * It is created idempotently and stays a DRAFT, so internal output is
 * provisional until the owner edits and approves the kit once. Nothing here
 * approves it.
 */
@Injectable()
export class SystemBrandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revisions: BrandOsRevisionsService,
  ) {}

  ensure(): Promise<SystemBrandHandle> {
    return runAsSystemOrganization(async () => {
      await this.ensureBrand();
      const revision = await this.revisions.ensureBaselineDraft(
        SYSTEM_WORKFLOW_PRINCIPAL_ID,
        SYSTEM_BRAND_ID,
      );
      return {
        brandId: SYSTEM_BRAND_ID,
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        revision,
      };
    });
  }

  private async ensureBrand(): Promise<void> {
    if (await this.findBrand()) return;
    try {
      await this.prisma.brand.create({
        data: {
          description: SYSTEM_BRAND_DESCRIPTION,
          id: SYSTEM_BRAND_ID,
          label: SYSTEM_BRAND_LABEL,
          organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          slug: SYSTEM_BRAND_SLUG,
          userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        },
      });
    } catch (error: unknown) {
      const isRace =
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION;
      if (!isRace) throw error;
      if (!(await this.findBrand()))
        throw new ConflictException('system_brand_unavailable');
    }
  }

  private findBrand() {
    return this.prisma.brand.findFirst({
      select: { id: true },
      where: {
        id: SYSTEM_BRAND_ID,
        isDeleted: false,
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      },
    });
  }
}
