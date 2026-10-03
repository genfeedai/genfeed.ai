import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CharacterAvailabilityDto } from '@api/collections/personas/dto/character-availability.dto';
import { ComposeCharacterSheetDto } from '@api/collections/personas/dto/compose-character-sheet.dto';
import { CreatePersonaDto } from '@api/collections/personas/dto/create-persona.dto';
import { CreatePersonaFromSheetDto } from '@api/collections/personas/dto/create-persona-from-sheet.dto';
import { PersonasQueryDto } from '@api/collections/personas/dto/personas-query.dto';
import { UpdatePersonaDto } from '@api/collections/personas/dto/update-persona.dto';
import { type PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import {
  brandAvailabilityWhere,
  hasSharedAvailability,
  isPersonaAvailableToBrand,
} from '@api/collections/personas/utils/persona-availability.util';
import { composeCharacterSheetPrompt } from '@api/endpoints/ai-actions/prompts/character-sheet-preset';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { PrismaFindAllInput } from '@api/shared/services/base/base.service';
import { PersonaStatus } from '@genfeedai/contracts';
import type {
  AgentCharacterMentionsResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { PersonaSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

const AVAILABILITY_FIELDS = [
  'availabilityMode',
  'availableBrandIds',
  'availabilityAudits',
  'isShared',
  'availableBrandCount',
  'owningBrandId',
  'owningBrandName',
] as const;

/**
 * Availability is changed only through `PATCH /personas/:id/availability`
 * (admin-gated and audited), never through the generic create/update routes.
 */
function stripAvailabilityFields<T extends object>(dto: T): T {
  const copy: Record<string, unknown> = { ...dto };
  for (const field of AVAILABILITY_FIELDS) {
    delete copy[field];
  }
  return copy as T;
}

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

    // Characters owned by the brand plus those shared to it, in one query.
    const brandId = match.brandId;
    delete match.brandId;
    if (typeof brandId === 'string') {
      match.AND = [brandAvailabilityWhere(brandId)];
    }

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
      availability: body.availability,
      brandId: user.brandId,
      isSuperAdmin: user.isSuperAdmin,
      handle: body.handle,
      label: body.label,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    });

    return { data: persona };
  }

  @Patch(':id/availability')
  async updateAvailability(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: CharacterAvailabilityDto,
  ): Promise<JsonApiSingleResponse> {
    const personaId = EntityIdUtil.validate(id, 'personaId');
    const persona = await this.personasService.updateAvailability({
      actorUserId: user.userId ?? user.id,
      brandId: user.brandId,
      brandIds: body.brandIds,
      isSuperAdmin: user.isSuperAdmin,
      mode: body.mode,
      organizationId: user.organizationId,
      personaId,
    });
    return serializeSingle(
      request,
      PersonaSerializer,
      await this.decorateForResponse(persona, user),
    );
  }

  public async decorateForResponse(
    data: PersonaDocument,
    user: User,
  ): Promise<PersonaDocument> {
    const [decorated] = await this.personasService.withAvailabilitySummary(
      [data],
      user.organizationId,
    );
    return decorated ?? data;
  }

  public canUserReadEntity(user: User, entity: PersonaDocument): boolean {
    return (
      entity.organizationId === user.organizationId &&
      (entity.brandId == null ||
        isPersonaAvailableToBrand(entity, user.brandId))
    );
  }

  public canUserModifyEntity(user: User, entity: PersonaDocument): boolean {
    if (hasSharedAvailability(entity)) {
      return isPersonaAvailableToBrand(entity, user.brandId);
    }
    return super.canUserModifyEntity(user, entity);
  }

  /** Identity edits of a shared character are limited to owners and admins. */
  protected async assertPatchAllowed(
    user: User,
    existing: PersonaDocument,
    updateDto: Partial<UpdatePersonaDto>,
  ): Promise<void> {
    if (!hasSharedAvailability(existing)) {
      return;
    }
    await this.personasService.assertCanManageSharing({
      isSuperAdmin: user.isSuperAdmin,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    });
    if (
      updateDto.brandId !== undefined &&
      updateDto.brandId !== existing.brandId
    ) {
      throw new ValidationException(
        'A shared character cannot move to another owning brand',
        'brandId',
      );
    }
  }

  public enrichCreateDto(
    createDto: Partial<CreatePersonaDto>,
    user: User,
  ): CreatePersonaDto {
    return super.enrichCreateDto(stripAvailabilityFields(createDto), user);
  }

  public async enrichUpdateDto(
    updateDto: Partial<UpdatePersonaDto>,
    user: User,
  ): Promise<UpdatePersonaDto> {
    return super.enrichUpdateDto(stripAvailabilityFields(updateDto), user);
  }

  /**
   * Overrides the generic DELETE route so removing a shared character is an
   * identity edit: owners/admins only, and not-found outside its availability.
   */
  @Delete(':id')
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    await this.assertSharedPersonaEditable(user, id);
    return super.remove(request, user, id);
  }

  private async assertSharedPersonaEditable(
    user: User,
    id: string,
  ): Promise<void> {
    if (!isEntityId(id)) {
      return;
    }
    const persona = await this.personasService.findOne({
      id,
      organizationId: user.organizationId,
    });
    if (!persona || !hasSharedAvailability(persona)) {
      return;
    }
    if (!isPersonaAvailableToBrand(persona, user.brandId)) {
      throw new NotFoundException('Persona', id);
    }
    await this.personasService.assertCanManageSharing({
      isSuperAdmin: user.isSuperAdmin,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    });
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
      await this.assertSharedPersonaEditable(user, id);
      const organization = user.organizationId;
      const personaId = EntityIdUtil.validate(id, 'personaId');
      const orgId = EntityIdUtil.validate(organization, 'organizationId');
      // Member IDs are user IDs: opaque strings, including legacy Better
      // Auth base62 IDs, so they are not held to the entity-id format.
      if (updateDto.memberIds.length === 0) {
        throw new ValidationException('memberIds array cannot be empty');
      }
      const memberIds = updateDto.memberIds.map((memberId, index) =>
        InputValidationUtil.validateString(memberId, `memberIds[${index}]`, {
          sanitize: false,
        }),
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
