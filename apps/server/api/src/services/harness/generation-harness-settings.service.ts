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
    const organization = await this.prisma.organizationSetting.findUnique({
      where: { organizationId },
      select: { isPromptEnhancementEnabled: true },
    });
    const brand = brandId
      ? await this.prisma.brand.findFirst({
          where: { id: brandId, organizationId, isDeleted: false },
          select: { isPromptEnhancementEnabled: true },
        })
      : null;
    const organizationEnabled =
      organization?.isPromptEnhancementEnabled ?? null;
    const brandEnabled = brand?.isPromptEnhancementEnabled ?? null;
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
    const data = { isPromptEnhancementEnabled: input.isEnabled };
    if (input.scope === 'brand') {
      const updated = await this.prisma.brand.updateMany({
        where: { id: input.brandId, organizationId, isDeleted: false },
        data,
      });
      if (updated.count === 0) throw new NotFoundException('Brand');
    } else {
      await this.prisma.organizationSetting.upsert({
        where: { organizationId },
        create: { organizationId, ...data },
        update: data,
      });
    }
    return this.get(organizationId, input.brandId);
  }
}
