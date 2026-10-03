import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CharacterAvailabilityDto } from '@api/collections/personas/dto/character-availability.dto';
import { ComposeCharacterSheetDto } from '@api/collections/personas/dto/compose-character-sheet.dto';
import { CreatePersonaDto } from '@api/collections/personas/dto/create-persona.dto';
import { CreatePersonaFromSheetDto } from '@api/collections/personas/dto/create-persona-from-sheet.dto';
import { GrantCharacterDto } from '@api/collections/personas/dto/grant-character.dto';
import { MoveCharacterOwnershipDto } from '@api/collections/personas/dto/move-character-ownership.dto';
import { PersonasQueryDto } from '@api/collections/personas/dto/personas-query.dto';
import { UpdatePersonaDto } from '@api/collections/personas/dto/update-persona.dto';
import { type PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { CharacterOwnershipService } from '@api/collections/personas/services/character-ownership.service';
import { PersonaGrantsService } from '@api/collections/personas/services/persona-grants.service';
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
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
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
  const copy = { ...dto } as Record<string, unknown>;
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
    private readonly ownershipService: CharacterOwnershipService,
    private readonly grantsService: PersonaGrantsService,
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

    const input: PrismaFindAllInput & { grantedToBrandId?: string } = {
      orderBy: handleQuerySort(query.sort),
      where: match,
    };
    // Characters granted to the organization join the unfiltered brand list.
    const hasFilters = Boolean(
      query.status ||
        query.avatarProvider ||
        query.assignedMember ||
        query.isMentionable ||
        query.q?.trim(),
    );
    if (typeof brandId === 'string' && !hasFilters) {
      input.grantedToBrandId = brandId;
    }
    return input;
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
    @Req() request: Request,
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
      apiKeyContext: user,
      availability: body.availability,
      brandId: user.brandId,
      isSuperAdmin: getIsSuperAdmin(user, request),
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
      apiKeyContext: user,
      brandIds: body.brandIds,
      isSuperAdmin: getIsSuperAdmin(user, request),
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

  @Get('grantable-organizations')
  async listGrantableOrganizations(@CurrentUser() user: User) {
    return {
      organizations: await this.grantsService.listGrantableOrganizations({
        apiKeyContext: user,
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
      }),
    };
  }

  @Get(':id/grants')
  async listGrants(@CurrentUser() user: User, @Param('id') id: string) {
    return {
      grants: await this.grantsService.listForPersona({
        brandId: user.brandId,
        organizationId: user.organizationId,
        personaId: EntityIdUtil.validate(id, 'personaId'),
      }),
    };
  }

  @Post(':id/grants')
  async grant(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: GrantCharacterDto,
  ) {
    return {
      data: await this.grantsService.grant({
        actorUserId: user.userId ?? user.id,
        apiKeyContext: user,
        brandId: user.brandId,
        brandIds: body.brandIds,
        mode: body.mode,
        organizationId: user.organizationId,
        personaId: EntityIdUtil.validate(id, 'personaId'),
        recipientOrganizationId: body.organizationId,
      }),
    };
  }

  @Delete(':id/grants/:grantId')
  async revokeGrant(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('grantId') grantId: string,
  ) {
    await this.grantsService.revoke({
      actorUserId: user.userId ?? user.id,
      apiKeyContext: user,
      brandId: user.brandId,
      grantId: EntityIdUtil.validate(grantId, 'grantId'),
      organizationId: user.organizationId,
      personaId: EntityIdUtil.validate(id, 'personaId'),
    });
    return { data: { id: grantId, isRevoked: true } };
  }

  @Patch(':id/owner')
  async moveOwnership(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: MoveCharacterOwnershipDto,
  ): Promise<JsonApiSingleResponse> {
    const personaId = EntityIdUtil.validate(id, 'personaId');
    const persona = await this.ownershipService.moveOwnership({
      actorUserId: user.userId ?? user.id,
      apiKeyContext: user,
      brandId: user.brandId,
      isSuperAdmin: getIsSuperAdmin(user, request),
      organizationId: user.organizationId,
      personaId,
      targetBrandId: body.brandId,
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

  /** Lookups by id never cross organizations (super admins excepted). */
  public buildFindOneQuery(
    user: User,
    id: string,
    request?: Request,
  ): Record<string, unknown> {
    return {
      ...super.buildFindOneQuery(user, id, request),
      ...(getIsSuperAdmin(user, request)
        ? {}
        : { organizationId: user.organizationId }),
    };
  }

  public canUserReadEntity(user: User, entity: PersonaDocument): boolean {
    return (
      entity.organizationId === user.organizationId &&
      (entity.brandId == null ||
        isPersonaAvailableToBrand(entity, user.brandId))
    );
  }

  public canUserModifyEntity(user: User, entity: PersonaDocument): boolean {
    if (entity.organizationId !== user.organizationId) {
      return false;
    }
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
    request?: Request,
  ): Promise<void> {
    if (!hasSharedAvailability(existing)) {
      return;
    }
    await this.personasService.assertCanManageSharing({
      apiKeyContext: user,
      isSuperAdmin: getIsSuperAdmin(user, request),
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    });
    const nextBrandId = (updateDto as Record<string, unknown>).brandId;
    if (nextBrandId !== undefined && nextBrandId !== existing.brandId) {
      throw new ValidationException(
        'Move a shared character to another owning brand with the ownership action',
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
    const dto = await super.enrichUpdateDto(
      stripAvailabilityFields(updateDto),
      user,
    );
    // Server-side organization (the base strips any client value): scopes the
    // service's handle-collision check to the caller's organization.
    const scoped: Record<string, unknown> = {
      ...dto,
      organizationId: user.organizationId,
    };
    return scoped as UpdatePersonaDto;
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
    await this.assertSharedPersonaEditable(request, user, id);
    return super.remove(request, user, id);
  }

  private async assertSharedPersonaEditable(
    request: Request,
    user: User,
    id: string,
  ): Promise<void> {
    if (!isEntityId(id)) {
      return;
    }
    // Unscoped by design: a character in another organization must read as
    // not-found, never fall through to the base (global) delete.
    const persona = await this.personasService.findOne({ id });
    if (!persona) {
      return;
    }
    if (
      persona.organizationId !== user.organizationId &&
      !getIsSuperAdmin(user, request)
    ) {
      throw new NotFoundException('Persona', id);
    }
    if (!hasSharedAvailability(persona)) {
      return;
    }
    if (!isPersonaAvailableToBrand(persona, user.brandId)) {
      throw new NotFoundException('Persona', id);
    }
    await this.personasService.assertCanManageSharing({
      apiKeyContext: user,
      isSuperAdmin: getIsSuperAdmin(user, request),
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
      await this.assertSharedPersonaEditable(request, user, id);
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
