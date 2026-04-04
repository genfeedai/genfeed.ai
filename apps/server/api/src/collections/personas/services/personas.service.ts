import { CreatePersonaDto } from '@api/collections/personas/dto/create-persona.dto';
import { UpdatePersonaDto } from '@api/collections/personas/dto/update-persona.dto';
import {
  Persona,
  type PersonaDocument,
} from '@api/collections/personas/schemas/persona.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class PersonasService extends BaseService<
  PersonaDocument,
  CreatePersonaDto,
  UpdatePersonaDto
> {
  constructor(
    @InjectModel(Persona.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<PersonaDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  create(
    dto: CreatePersonaDto & {
      user: Types.ObjectId;
      organization: Types.ObjectId;
      brand: Types.ObjectId;
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
    personaId: Types.ObjectId,
    memberIds: Types.ObjectId[],
    organization: Types.ObjectId,
  ): Promise<PersonaDocument | null> {
    const persona = await this.model
      .findOneAndUpdate(
        {
          _id: personaId,
          isDeleted: false,
          organization,
        },
        { $set: { assignedMembers: memberIds } },
        { new: true },
      )
      .exec();

    if (!persona) {
      throw new NotFoundException('Persona not found');
    }

    return persona;
  }
}
