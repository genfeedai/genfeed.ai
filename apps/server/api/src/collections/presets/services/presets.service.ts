import { CreatePresetDto } from '@api/collections/presets/dto/create-preset.dto';
import { UpdatePresetDto } from '@api/collections/presets/dto/update-preset.dto';
import { PresetDocument } from '@api/collections/presets/schemas/preset.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class PresetsService extends BaseService<
  PresetDocument,
  CreatePresetDto,
  UpdatePresetDto
> {
  constructor(
    @InjectModel('Preset', DB_CONNECTIONS.CLOUD)
    public readonly presetModel: unknown,
    public readonly logger: LoggerService,
  ) {
    super(presetModel, logger);
  }

  /**
   * Override create to add key uniqueness validation
   */
  async create(
    createDto: CreatePresetDto,
    populate: PopulateOption[] = [],
  ): Promise<PresetDocument> {
    // Check for existing key
    const existing = await this.presetModel.findOne({
      key: createDto.key,
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
    const preset = await this.presetModel.findOne({
      isActive: true,
      key,
    });

    if (!preset) {
      throw new NotFoundException(`Preset with key '${key}' not found`);
    }

    return preset;
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
    // Build potential preset queries in priority order
    const queries = [];

    // 1. Most specific: brand-specific preset
    if (organizationId && brandId) {
      queries.push({
        brand: brandId,
        isActive: true,
        key,
        organization: organizationId,
      });
    }

    // 2. Organization-wide preset (no brand specified)
    if (organizationId) {
      queries.push({
        brand: null,
        isActive: true,
        key,
        organization: organizationId,
      });
    }

    // 3. App-wide preset (no org or brand)
    queries.push({
      brand: null,
      isActive: true,
      key,
      organization: null,
    });

    // Try each query in order until we find a matching preset
    for (const query of queries) {
      const preset = await this.presetModel.findOne(query);
      if (preset) {
        return preset;
      }
    }

    return null;
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
      const existing = await this.presetModel.findOne({
        _id: { $ne: id },
        key: updateDto.key,
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
