import { CreatePresetDto } from '@api/collections/presets/dto/create-preset.dto';
import { UpdatePresetDto } from '@api/collections/presets/dto/update-preset.dto';
import { type PresetDocument } from '@api/collections/presets/schemas/preset.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

@Injectable()
export class PresetsService extends BaseService<
  PresetDocument,
  CreatePresetDto,
  UpdatePresetDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'preset', logger);
  }

  /**
   * Override create to add key uniqueness validation
   */
  async create(
    createDto: CreatePresetDto,
    populate: PopulateOption[] = [],
  ): Promise<PresetDocument> {
    // Check for existing key
    const existing = await this.prisma.preset.findFirst({
      where: { key: createDto.key },
    });

    if (existing) {
      throw new ConflictException(
        `Preset with key '${createDto.key}' already exists`,
      );
    }

    // Use base service create method
    return super.create(createDto, populate);
  }

  /**
   * Find preset by key - specific to presets
   */
  async findByKey(key: string): Promise<PresetDocument> {
    const preset = await this.prisma.preset.findFirst({
      where: { isActive: true, key },
    });

    if (!preset) {
      throw new NotFoundException(`Preset with key '${key}' not found`);
    }

    return preset as unknown as PresetDocument;
  }

  /**
   * Find the most specific preset for a given context
   * Priority: brand-specific > org-wide > app-wide
   */
  async findPresetForContext(
    key: string,
    organizationId?: string,
    brandId?: string,
  ): Promise<PresetDocument | null> {
    // 1. Most specific: brand-specific preset
    if (organizationId && brandId) {
      const preset = await this.prisma.preset.findFirst({
        where: { brandId, isActive: true, key, organizationId },
      });
      if (preset) return preset as unknown as PresetDocument;
    }

    // 2. Organization-wide preset (no brand specified)
    if (organizationId) {
      const preset = await this.prisma.preset.findFirst({
        where: { brandId: null, isActive: true, key, organizationId },
      });
      if (preset) return preset as unknown as PresetDocument;
    }

    // 3. App-wide preset (no org or brand)
    const preset = await this.prisma.preset.findFirst({
      where: { brandId: null, isActive: true, key, organizationId: null },
    });
    return (preset as unknown as PresetDocument) ?? null;
  }

  /**
   * Override patch to add key uniqueness validation
   */
  async patch(
    id: string,
    updateDto: Partial<UpdatePresetDto>,
    populate: PopulateOption[] = [],
  ): Promise<PresetDocument> {
    // If updating key, check for duplicates
    if (updateDto.key) {
      const existing = await this.prisma.preset.findFirst({
        where: { id: { not: id }, key: updateDto.key },
      });

      if (existing) {
        throw new ConflictException(
          `Preset with key '${updateDto.key}' already exists`,
        );
      }
    }

    // Use base service patch method
    return super.patch(id, updateDto, populate);
  }
}
