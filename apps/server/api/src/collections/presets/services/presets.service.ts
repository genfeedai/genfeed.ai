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
import { platformTenantProof } from '@libs/prisma/platform-scope';
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
   * Override create to add key uniqueness validation. Keys are unique within a
   * scope: among platform defaults (`organizationId: null`) or within one
   * organization. An organization preset may reuse a platform default's key;
   * `findByKey` then resolves to the organization's own.
   */
  async create(
    createDto: CreatePresetDto,
    populate: PopulateOption[] = [],
  ): Promise<PresetDocument> {
    await this.assertKeyAvailable(createDto.key, createDto.organizationId);

    try {
      return await super.create(
        {
          ...pickDefinedFields(createDto, PRESET_CREATE_SCALAR_FIELDS),
          config: pickDefinedFields(createDto, PRESET_CONFIG_FIELDS),
        } as unknown as CreatePresetDto,
        populate,
      );
    } catch (error) {
      throw this.toKeyConflict(error, createDto.key);
    }
  }

  /**
   * Resolve a preset by key for a caller: the caller's own organization first,
   * then the platform defaults. Never an unscoped lookup, so a key owned by
   * another organization can never be returned.
   */
  async findByKey(
    key: string,
    organizationId?: string | null,
  ): Promise<PresetDocument> {
    if (organizationId) {
      const own = await this.prisma.preset.findFirst({
        where: scopedWhere(organizationId, {
          config: { equals: key, path: ['key'] },
        }),
      });

      if (own) {
        return own as unknown as PresetDocument;
      }
    }

    const platformDefault = await this.prisma.preset.findFirst({
      where: {
        AND: platformTenantProof(),
        config: { equals: key, path: ['key'] },
        isDeleted: false,
        organizationId: null,
      },
    });

    if (!platformDefault) {
      throw new NotFoundException('Preset', key);
    }

    return platformDefault as unknown as PresetDocument;
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
        AND: platformTenantProof(),
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
    const existingConfig = await this.validateUpdate(
      await this.findOne({ id }),
      id,
      updateDto,
    );

    try {
      return await super.patch(
        id,
        this.buildPatchData(updateDto, existingConfig),
        populate,
      );
    } catch (error) {
      throw this.toKeyConflict(error, updateDto.key);
    }
  }

  /**
   * Scoped variant of `patch` for controllers that address a row through a
   * tenant scope (`where` carries `id` plus the caller's organization arms).
   * Same key validation and config merge as `patch`, but the row is resolved
   * through that scope so the CLOUD tenant guard sees the caller's
   * organization.
   */
  override async patchOneWhere(
    where: Record<string, unknown>,
    updateDto: Partial<UpdatePresetDto> | Record<string, unknown>,
    populate: PopulateOption[] = [],
  ): Promise<PresetDocument | null> {
    const dto = updateDto as Partial<UpdatePresetDto>;
    const existingConfig = await this.validateUpdate(
      await this.findOne(where),
      String(where.id),
      dto,
    );

    try {
      return await super.patchOneWhere(
        where,
        this.buildPatchData(dto, existingConfig),
        populate,
      );
    } catch (error) {
      throw this.toKeyConflict(error, dto.key);
    }
  }

  /**
   * Validate the key an update would leave on the row against the scope the
   * row ends up in, and return the stored config to merge the patch into.
   */
  private async validateUpdate(
    existing: PresetDocument | null,
    id: string,
    updateDto: Partial<UpdatePresetDto>,
  ): Promise<Record<string, unknown> | undefined> {
    const hasConfigPatch = this.hasConfigPatch(updateDto);
    const changesScope = updateDto.organizationId !== undefined;

    if (!hasConfigPatch && !changesScope) {
      return undefined;
    }

    const storedConfig = this.readStoredConfig(existing, id);
    const key = updateDto.key ?? storedConfig.key;

    if (
      (updateDto.key !== undefined || changesScope) &&
      typeof key === 'string' &&
      key.length > 0
    ) {
      await this.assertKeyAvailable(
        key,
        changesScope ? updateDto.organizationId : existing?.organizationId,
        id,
      );
    }

    return hasConfigPatch ? storedConfig : undefined;
  }

  /**
   * Reject a key already used by another live preset in the same scope:
   * platform defaults among platform defaults, an organization's presets
   * within that organization.
   */
  private async assertKeyAvailable(
    key: string,
    organizationId: string | null | undefined,
    excludeId?: string,
  ): Promise<void> {
    const keyFilter = { config: { equals: key, path: ['key'] } };
    const notSelf = excludeId ? { id: { not: excludeId } } : {};

    const duplicate = organizationId
      ? await this.prisma.preset.findFirst({
          where: scopedWhere(organizationId, { ...keyFilter, ...notSelf }),
        })
      : await this.prisma.preset.findFirst({
          where: {
            ...notSelf,
            AND: platformTenantProof(),
            ...keyFilter,
            isDeleted: false,
            organizationId: null,
          },
        });

    if (duplicate) {
      throw new ConflictException(`Preset with key '${key}' already exists`);
    }
  }

  /** Turn the partial unique index's violation into the same conflict. */
  private toKeyConflict(error: unknown, key: string | undefined): unknown {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: unknown }).code === 'P2002'
    ) {
      return new ConflictException(`Preset with key '${key}' already exists`);
    }

    return error;
  }

  private hasConfigPatch(updateDto: Partial<UpdatePresetDto>): boolean {
    return (
      Object.keys(pickDefinedFields(updateDto, PRESET_CONFIG_FIELDS)).length > 0
    );
  }

  private readStoredConfig(
    existing: PresetDocument | null,
    id: string,
  ): Record<string, unknown> {
    if (!existing) {
      throw new NotFoundException('Preset', id);
    }

    return existing.config &&
      typeof existing.config === 'object' &&
      !Array.isArray(existing.config)
      ? (existing.config as Record<string, unknown>)
      : {};
  }

  private buildPatchData(
    updateDto: Partial<UpdatePresetDto>,
    existingConfig?: Record<string, unknown>,
  ): Partial<UpdatePresetDto> {
    const config = existingConfig
      ? {
          ...existingConfig,
          ...pickDefinedFields(updateDto, PRESET_CONFIG_FIELDS),
        }
      : undefined;

    return {
      ...pickDefinedFields(updateDto, PRESET_UPDATE_SCALAR_FIELDS),
      ...(config ? { config } : {}),
    } as unknown as Partial<UpdatePresetDto>;
  }
}
