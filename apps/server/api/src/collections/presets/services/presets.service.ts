import { CreatePresetDto } from '@api/collections/presets/dto/create-preset.dto';
import { UpdatePresetDto } from '@api/collections/presets/dto/update-preset.dto';
import { type PresetDocument } from '@api/collections/presets/schemas/preset.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import type { PopulateOption } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, Injectable } from '@nestjs/common';

const PRESET_CREATE_SCALAR_FIELDS = [
  'brandId',
  'category',
  'isActive',
  'organizationId',
] as const;

const PRESET_UPDATE_SCALAR_FIELDS = [
  ...PRESET_CREATE_SCALAR_FIELDS,
  'isDeleted',
  'isFavorite',
] as const;

const PRESET_CONFIG_FIELDS = [
  'blacklists',
  'camera',
  'description',
  'ingredientId',
  'key',
  'label',
  'model',
  'mood',
  'platform',
  'prompt',
  'scene',
  'style',
] as const;

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
    // tenant-scope-ignore: preset keys are a platform-wide catalog invariant and this superadmin-only create path must reject duplicates across organizations
    const existing = await this.prisma.preset.findFirst({
      where: {
        config: { equals: createDto.key, path: ['key'] },
        isDeleted: false,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Preset with key '${createDto.key}' already exists`,
      );
    }

    return super.create(
      {
        ...pickDefinedFields(createDto, PRESET_CREATE_SCALAR_FIELDS),
        config: pickDefinedFields(createDto, PRESET_CONFIG_FIELDS),
      } as unknown as CreatePresetDto,
      populate,
    );
  }

  /**
   * Find preset by key - specific to presets
   */
  async findByKey(key: string): Promise<PresetDocument> {
    // tenant-scope-ignore: preset keys are globally unique catalog identifiers, so this internal key lookup intentionally resolves across organizations
    const preset = await this.prisma.preset.findFirst({
      where: {
        config: { equals: key, path: ['key'] },
        isDeleted: false,
      },
    });

    if (!preset) {
      throw new NotFoundException('Preset', key);
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
        where: scopedWhere(organizationId, {
          brandId,
          config: { equals: key, path: ['key'] },
        }),
      });
      if (preset) return preset as unknown as PresetDocument;
    }

    // 2. Organization-wide preset (no brand specified)
    if (organizationId) {
      const preset = await this.prisma.preset.findFirst({
        where: scopedWhere(organizationId, {
          brandId: null,
          config: { equals: key, path: ['key'] },
        }),
      });
      if (preset) return preset as unknown as PresetDocument;
    }

    // 3. App-wide preset (no org or brand)
    const preset = await this.prisma.preset.findFirst({
      where: {
        brandId: null,
        config: { equals: key, path: ['key'] },
        isDeleted: false,
        organizationId: null,
      },
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
      // tenant-scope-ignore: preset keys are a platform-wide catalog invariant and this superadmin-only update path must reject duplicates across organizations
      const existing = await this.prisma.preset.findFirst({
        where: {
          config: { equals: updateDto.key, path: ['key'] },
          id: { not: id },
          isDeleted: false,
        },
      });

      if (existing) {
        throw new ConflictException(
          `Preset with key '${updateDto.key}' already exists`,
        );
      }
    }

    const configPatch = pickDefinedFields(updateDto, PRESET_CONFIG_FIELDS);
    const hasConfigPatch = Object.keys(configPatch).length > 0;
    let config: Record<string, unknown> | undefined;

    if (hasConfigPatch) {
      const existing = await this.findOne({ id });
      if (!existing) {
        throw new NotFoundException('Preset', id);
      }

      const storedConfig =
        existing.config &&
        typeof existing.config === 'object' &&
        !Array.isArray(existing.config)
          ? (existing.config as Record<string, unknown>)
          : {};
      config = { ...storedConfig, ...configPatch };
    }

    return super.patch(
      id,
      {
        ...pickDefinedFields(updateDto, PRESET_UPDATE_SCALAR_FIELDS),
        ...(config ? { config } : {}),
      } as unknown as Partial<UpdatePresetDto>,
      populate,
    );
  }
}
