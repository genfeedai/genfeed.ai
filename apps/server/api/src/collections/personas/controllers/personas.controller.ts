import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ComposeCharacterSheetDto } from '@api/collections/personas/dto/compose-character-sheet.dto';
import { CreatePersonaDto } from '@api/collections/personas/dto/create-persona.dto';
import { CreatePersonaFromSheetDto } from '@api/collections/personas/dto/create-persona-from-sheet.dto';
import { PersonasQueryDto } from '@api/collections/personas/dto/personas-query.dto';
import { UpdatePersonaDto } from '@api/collections/personas/dto/update-persona.dto';
import { type PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { composeCharacterSheetPrompt } from '@api/endpoints/ai-actions/prompts/character-sheet-preset';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { PrismaFindAllInput } from '@api/shared/services/base/base.service';
import { PersonaStatus } from '@genfeedai/contracts';
import type { AgentCharacterMentionsResponse } from '@genfeedai/contracts/interfaces';
import { PersonaSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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

  public buildFindAllQuery(
    user: User,
    query: PersonasQueryDto,
  ): PrismaFindAllInput {
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
    };
    CollectionFilterUtil.applyAuthorizedTenantMatch(match, query, user);

    if (query.status) {
      match.status = query.status;
    }
    if (query.avatarProvider) {
      match.avatarProvider = query.avatarProvider;
    }
    if (query.assignedMember) {
      match.assignedMembers = { some: { id: query.assignedMember } };
    }

    if (query.isMentionable) {
      match.handle = { not: null };
      match.status =
        query.status && query.status !== PersonaStatus.ARCHIVED
          ? query.status
          : PersonaStatus.ACTIVE;
    }

    const prefix = query.q?.trim();
    if (prefix) {
      match.OR = [
        { handle: { startsWith: prefix.toLowerCase(), mode: 'insensitive' } },
        { label: { startsWith: prefix, mode: 'insensitive' } },
      ];
    }

    return {
      orderBy: handleQuerySort(query.sort),
      where: match,
    };
  }

  @Get('mentions')
  async getMentions(
    @CurrentUser() user: User,
    @Query('q') q?: string,
  ): Promise<AgentCharacterMentionsResponse> {
    if (!user.organizationId) {
      throw new BadRequestException({
        detail: 'Organization not found in metadata',
        title: 'Bad Request',
      });
    }

    const mentions = await this.personasService.listCharacterMentions({
      brandId: user.brandId,
      organizationId: user.organizationId,
      q,
    });

    return { mentions };
  }

  @Post('sheet-prompt')
  async composeSheetPrompt(
    @CurrentUser() user: User,
    @Body() body: ComposeCharacterSheetDto,
  ): Promise<{ prompt: string }> {
    if (!user.organizationId || !user.brandId) {
      throw new BadRequestException({
        detail:
          'Organization and brand are required to compose a character sheet',
        title: 'Bad Request',
      });
    }

    return {
      prompt: composeCharacterSheetPrompt({
        description: body.description,
        isNonHumanoid: body.isNonHumanoid,
      }),
    };
  }

  @Post('from-sheet')
  async createFromSheet(
    @CurrentUser() user: User,
    @Body() body: CreatePersonaFromSheetDto,
  ) {
    if (!user.organizationId || !user.brandId) {
      throw new BadRequestException({
        detail: 'Organization and brand are required to create a character',
        title: 'Bad Request',
      });
    }

    const persona = await this.personasService.createFromApprovedSheet({
      assetId: body.assetId,
      brandId: user.brandId,
      handle: body.handle,
      label: body.label,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    });

    return { data: persona };
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
      const organization = user.organizationId;
      const personaId = EntityIdUtil.validate(id, 'personaId');
      const orgId = EntityIdUtil.validate(organization, 'organizationId');
      const memberIds = EntityIdUtil.validateMany(
        updateDto.memberIds,
        'memberIds',
      );

      // Applied directly here (not via the generic field patch) because
      // assignedMembers is a relation set, not a plain scalar update.
      await this.personasService.assignMembers(personaId, memberIds, orgId);
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
