import { CreatePersonaDto } from '@api/collections/personas/dto/create-persona.dto';
import { UpdatePersonaDto } from '@api/collections/personas/dto/update-persona.dto';
import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

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
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
  }

  create(
    dto: CreatePersonaDto & {
      user: string;
      organization: string;
      brand: string;
    },
    populate: PopulateOption[] = [
      PopulatePatterns.userMinimal,
      PopulatePatterns.brandMinimal,
    ],
  ): Promise<PersonaDocument> {
    return super.create(dto, populate);
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
      } as never,
      where: { id: personaId, organizationId, isDeleted: false } as never,
    });

    if (!persona) {
      throw new NotFoundException('Persona not found');
    }

    return persona as never;
  }
}
