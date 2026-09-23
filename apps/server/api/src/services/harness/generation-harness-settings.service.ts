import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  GenerationHarnessSettings,
  UpdateGenerationHarnessSettings,
} from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class GenerationHarnessSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertScope(organizationId: string, brandId?: string): Promise<void> {
    if (
      !organizationId ||
      !(await this.prisma.organization.findFirst({
        where: { id: organizationId, isDeleted: false },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException('Organization');
    }
    if (
      brandId !== undefined &&
      (!brandId ||
        !(await this.prisma.brand.findFirst({
          where: { id: brandId, organizationId, isDeleted: false },
          select: { id: true },
        })))
    ) {
      throw new NotFoundException('Brand');
    }
  }

  async get(
    organizationId: string,
    brandId?: string,
  ): Promise<GenerationHarnessSettings> {
    await this.assertScope(organizationId, brandId);
    const rows = await this.prisma.generationHarnessSetting.findMany({
      where: {
        organizationId,
        isDeleted: false,
        scopeKey: { in: ['organization', ...(brandId ? [brandId] : [])] },
      },
    });
    const organizationEnabled =
      rows.find((row) => row.scopeKey === 'organization')?.isEnabled ?? null;
    const brandEnabled = brandId
      ? (rows.find((row) => row.scopeKey === brandId)?.isEnabled ?? null)
      : null;
    return {
      organizationEnabled,
      brandEnabled,
      ...(brandId ? { brandId } : {}),
      isEnabled: brandEnabled ?? organizationEnabled ?? true,
      source:
        brandEnabled !== null
          ? 'brand'
          : organizationEnabled !== null
            ? 'organization'
            : 'default',
    };
  }

  async set(
    organizationId: string,
    input: UpdateGenerationHarnessSettings,
  ): Promise<GenerationHarnessSettings> {
    if (
      !['organization', 'brand'].includes(input.scope) ||
      (input.isEnabled !== null && typeof input.isEnabled !== 'boolean')
    ) {
      throw new BadRequestException(
        'scope and a boolean or null isEnabled are required',
      );
    }
    if (input.scope === 'brand' && !input.brandId?.trim()) {
      throw new BadRequestException('brandId is required for brand settings');
    }
    await this.assertScope(organizationId, input.brandId);
    const brandId = input.scope === 'brand' ? input.brandId : undefined;
    const scopeKey = brandId ?? 'organization';
    if (input.isEnabled === null) {
      await this.prisma.generationHarnessSetting.updateMany({
        where: { organizationId, scopeKey, isDeleted: false },
        data: { isDeleted: true },
      });
    } else {
      const revived = await this.prisma.generationHarnessSetting.updateMany({
        where: { organizationId, scopeKey, isDeleted: true },
        data: { isEnabled: input.isEnabled, isDeleted: false, brandId },
      });
      if (revived.count === 0) {
        const active = await this.prisma.generationHarnessSetting.updateMany({
          where: { organizationId, scopeKey, isDeleted: false },
          data: { isEnabled: input.isEnabled, brandId },
        });
        if (active.count === 0) {
          await this.prisma.generationHarnessSetting.create({
            data: {
              organizationId,
              brandId,
              scopeKey,
              isEnabled: input.isEnabled,
            },
          });
        }
      }
    }
    return this.get(organizationId, input.brandId);
  }
}
