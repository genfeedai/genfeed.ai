import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreatePersonaDto } from '@api/collections/personas/dto/create-persona.dto';
import { PersonasQueryDto } from '@api/collections/personas/dto/personas-query.dto';
import { UpdatePersonaDto } from '@api/collections/personas/dto/update-persona.dto';
import { type PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { PersonaSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

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

  /**
   * Overrides the generic PATCH route to fold in member assignment: when
   * `memberIds` is present in the body, apply the assignment (replaces the
   * persona's assigned members) using the same service logic the former
   * `POST /personas/:id/assign` route used, then delegate the rest of the
   * update (ownership check, remaining fields) to the base PATCH flow.
   */
  @Patch(':id')
  async patch(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdatePersonaDto,
  ) {
    if (updateDto.memberIds) {
      const { organization } = getPublicMetadata(user);
      const personaId = EntityIdUtil.toValidId(id)!;
      const orgId = EntityIdUtil.toValidId(organization)!;
      const memberObjectIds = updateDto.memberIds.map(
        (memberId) => EntityIdUtil.toValidId(memberId)!,
      );

      // Applied directly here (not via the generic field patch) because
      // assignedMembers is a relation set, not a plain scalar update.
      await this.personasService.assignMembers(
        personaId,
        memberObjectIds,
        orgId,
      );
    }

    const { memberIds: _memberIds, ...rest } = updateDto;
    const hasRemainingFields = Object.keys(rest).length > 0;

    // If the request only carried memberIds, the assignment above is the
    // whole update — skip the base PATCH flow (it would otherwise be a
    // no-op patch, still worth returning the fresh entity for).
    return super.patch(
      request,
      user,
      id,
      (hasRemainingFields ? rest : {}) as UpdatePersonaDto,
    );
  }
}
