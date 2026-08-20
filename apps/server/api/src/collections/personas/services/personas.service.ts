import { CreatePersonaDto } from '@api/collections/personas/dto/create-persona.dto';
import { UpdatePersonaDto } from '@api/collections/personas/dto/update-persona.dto';
import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { PopulateOption } from '@genfeedai/interfaces';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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

  create(
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
      ...(Object.keys(config).length > 0 ? { config } : {}),
    };
    return super.create(payload as unknown as CreatePersonaDto, populate);
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
