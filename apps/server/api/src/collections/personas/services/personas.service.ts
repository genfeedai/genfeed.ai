import { CreatePersonaDto } from '@api/collections/personas/dto/create-persona.dto';
import { UpdatePersonaDto } from '@api/collections/personas/dto/update-persona.dto';
import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { PrismaUpdate } from '@api/shared/services/base/base-query-normalization.adapter';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import {
  isPersonaHandle,
  normalizePersonaHandle,
  PersonaStatus,
} from '@genfeedai/enums';
import type {
  AgentCharacterMentionItem,
  PopulateOption,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

function isPersonaHandleUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const record = error as {
    code?: unknown;
    meta?: { target?: unknown; constraint?: unknown };
  };
  if (record.code !== 'P2002') {
    return false;
  }
  const target = record.meta?.target;
  const constraint = record.meta?.constraint;
  const haystack = [
    ...(Array.isArray(target) ? target.map(String) : [String(target ?? '')]),
    String(constraint ?? ''),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes('handle') || haystack.includes('org_brand_handle');
}

function rethrowHandleConflict(error: unknown, handle?: string | null): never {
  if (isPersonaHandleUniqueViolation(error)) {
    throw new ValidationException(
      'A character with this handle already exists in this brand',
      'handle',
      handle,
    );
  }
  throw error;
}

@Injectable()
export class PersonasService extends BaseService<
  PersonaDocument,
  CreatePersonaDto,
  UpdatePersonaDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'persona', logger);
  }

  protected normalizeDocument(document: unknown): PersonaDocument {
    const record = document as Record<string, unknown>;
    const config =
      typeof record.config === 'object' && record.config !== null
        ? (record.config as Record<string, unknown>)
        : {};
    return { ...config, ...record } as PersonaDocument;
  }

  async create(
    dto: CreatePersonaDto & {
      userId: string;
      organizationId: string;
      brandId?: string | null;
      bio?: string;
      emoji?: string;
      eyeColor?: string;
      fleetSources?: Array<Record<string, unknown>>;
      loraStatus?: string;
      niche?: string;
      s3Folder?: string;
      skinTone?: string;
      triggerWord?: string;
    },
    populate: PopulateOption[] = [
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PersonaDocument> {
    const {
      bio,
      contentStrategy,
      emoji,
      eyeColor,
      fleetSources,
      loraStatus,
      niche,
      s3Folder,
      skinTone,
      triggerWord,
      ...rest
    } = dto;
    const handle = normalizePersonaHandle(rest.handle);
    if (handle !== null && !isPersonaHandle(handle)) {
      throw new ValidationException(
        'Handle must be 2–32 characters of lowercase letters, numbers, hyphens, or underscores',
        'handle',
        handle,
      );
    }
    const config = {
      ...(bio !== undefined ? { bio } : {}),
      ...(contentStrategy !== undefined ? { contentStrategy } : {}),
      ...(emoji !== undefined ? { emoji } : {}),
      ...(eyeColor !== undefined ? { eyeColor } : {}),
      ...(fleetSources !== undefined ? { fleetSources } : {}),
      ...(loraStatus !== undefined ? { loraStatus } : {}),
      ...(niche !== undefined ? { niche } : {}),
      ...(s3Folder !== undefined ? { s3Folder } : {}),
      ...(skinTone !== undefined ? { skinTone } : {}),
      ...(triggerWord !== undefined ? { triggerWord } : {}),
    };
    const payload = {
      ...rest,
      handle,
      ...(Object.keys(config).length > 0 ? { config } : {}),
    };
    try {
      return await super.create(
        payload as unknown as CreatePersonaDto,
        populate,
      );
    } catch (error: unknown) {
      rethrowHandleConflict(error, handle);
    }
  }

  async patch(
    id: string,
    updateDto: Partial<UpdatePersonaDto> | PrismaUpdate,
    populate: PopulateOption[] = [
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PersonaDocument> {
    const nextDto = { ...updateDto };
    let normalizedHandle: string | null | undefined;
    if (Object.hasOwn(nextDto, 'handle')) {
      const rawHandle = nextDto.handle;
      if (
        typeof rawHandle !== 'string' &&
        rawHandle !== null &&
        rawHandle !== undefined
      ) {
        throw new ValidationException(
          'Handle must be a string',
          'handle',
          rawHandle,
        );
      }
      normalizedHandle = normalizePersonaHandle(rawHandle);
      if (normalizedHandle !== null && !isPersonaHandle(normalizedHandle)) {
        throw new ValidationException(
          'Handle must be 2–32 characters of lowercase letters, numbers, hyphens, or underscores',
          'handle',
          normalizedHandle,
        );
      }
      nextDto.handle = normalizedHandle;
    }
    try {
      return await super.patch(id, nextDto, populate);
    } catch (error: unknown) {
      rethrowHandleConflict(error, normalizedHandle);
    }
  }

  findOne(
    params: Record<string, unknown>,
    populate: PopulateOption[] = [
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PersonaDocument | null> {
    return super.findOne(params, populate);
  }

  async listCharacterMentions(params: {
    organizationId: string;
    brandId?: string | null;
    q?: string;
  }): Promise<AgentCharacterMentionItem[]> {
    const prefix = params.q?.trim();
    const rows = await this.prisma.persona.findMany({
      orderBy: { label: 'asc' },
      select: {
        avatarIngredientId: true,
        handle: true,
        id: true,
        label: true,
      },
      take: 20,
      where: scopedWhere(params.organizationId, {
        handle: { not: null },
        status: PersonaStatus.ACTIVE,
        ...(params.brandId ? { brandId: params.brandId } : {}),
        ...(prefix
          ? {
              OR: [
                {
                  handle: {
                    mode: 'insensitive' as const,
                    startsWith: prefix.toLowerCase(),
                  },
                },
                {
                  label: {
                    mode: 'insensitive' as const,
                    startsWith: prefix,
                  },
                },
              ],
            }
          : {}),
      }),
    });

    return rows.flatMap((row) => {
      if (!row.handle) {
        return [];
      }
      return [
        {
          avatarIngredientId: row.avatarIngredientId,
          handle: row.handle,
          hasReferenceImage: Boolean(row.avatarIngredientId),
          id: row.id,
          label: row.label,
        },
      ];
    });
  }

  async createFromApprovedSheet(params: {
    assetId: string;
    brandId: string;
    handle: string;
    label: string;
    organizationId: string;
    userId: string;
  }): Promise<PersonaDocument> {
    const handle = normalizePersonaHandle(params.handle);
    if (handle === null || !isPersonaHandle(handle)) {
      throw new ValidationException(
        'Handle must be 2–32 characters of lowercase letters, numbers, hyphens, or underscores',
        'handle',
        params.handle,
      );
    }
    return this.create({
      avatarIngredientId: params.assetId,
      brandId: params.brandId,
      handle,
      label: params.label,
      organizationId: params.organizationId,
      status: PersonaStatus.ACTIVE,
      userId: params.userId,
    });
  }

  async assignMembers(
    personaId: string,
    memberIds: string[],
    organizationId: string,
  ): Promise<PersonaDocument | null> {
    const persona = await this.prisma.persona.update({
      data: {
        assignedMembers: { set: memberIds.map((id) => ({ id })) },
      },
      where: scopedWhere(organizationId, { id: personaId }),
    });

    if (!persona) {
      throw new NotFoundException('Persona');
    }

    return this.normalizeDocument(persona);
  }
}
