import { CreatePersonaDto } from '@api/collections/personas/dto/create-persona.dto';
import { PersonasQueryDto } from '@api/collections/personas/dto/personas-query.dto';
import { UpdatePersonaDto } from '@api/collections/personas/dto/update-persona.dto';
import { type PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
import { PersonaSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

@AutoSwagger()
@Controller('personas')
@UseGuards(RolesGuard)
export class PersonasController extends BaseCRUDController<
  PersonaDocument,
  CreatePersonaDto,
  UpdatePersonaDto,
  PersonasQueryDto
> {
  constructor(
    public readonly personasService: PersonasService,
    public readonly loggerService: LoggerService,
  ) {
    super(loggerService, personasService, PersonaSerializer, 'Persona', [
      'user',
      'brand',
    ]);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  async assignMembers(
    @Param('id') id: string,
    @Body() body: { memberIds: string[] },
    @CurrentUser() user: User,
  ) {
    try {
      const { organization } = getPublicMetadata(user);
      const personaId = ObjectIdUtil.toObjectId(id)!;
      const orgId = ObjectIdUtil.toObjectId(organization)!;
      const memberObjectIds = body.memberIds.map(
        (memberId) => ObjectIdUtil.toObjectId(memberId)!,
      );

      const persona = await this.personasService.assignMembers(
        personaId,
        memberObjectIds,
        orgId,
      );

      // @ts-expect-error TS2554
      return serializeSingle(persona, PersonaSerializer);
    } catch (error) {
      return ErrorResponse.handle(error, this.loggerService, 'assignMembers');
    }
  }
}
