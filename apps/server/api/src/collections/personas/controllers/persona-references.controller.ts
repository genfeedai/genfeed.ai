import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  CharacterReferencesDto,
  CharacterReferenceUsageDto,
} from '@api/collections/personas/dto/character-references.dto';
import { PersonaReferencesService } from '@api/collections/personas/services/persona-references.service';
import type { PersonaReferenceScope } from '@api/collections/personas/services/persona-references.types';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import type {
  CharacterReferenceItem,
  CharacterReferenceUsage,
} from '@genfeedai/contracts/interfaces';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Ordered reference images of a character. Declared before the personas
 * controller so `reference-usage` is never read as a persona id.
 */
@AutoSwagger()
@Controller('personas')
@UseGuards(RolesGuard)
export class PersonaReferencesController {
  constructor(private readonly referencesService: PersonaReferencesService) {}

  @Post('reference-usage')
  @HttpCode(HttpStatus.OK)
  async findReferenceUsage(
    @CurrentUser() user: User,
    @Body() body: CharacterReferenceUsageDto,
  ): Promise<{ data: CharacterReferenceUsage[] }> {
    return {
      data: await this.referencesService.findReferenceUsage(
        user.organizationId,
        body.ingredientIds,
      ),
    };
  }

  @Get(':id/references')
  @TenantReadPolicy('selected')
  async list(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<{ data: CharacterReferenceItem[] }> {
    const scope = resolveTenantReadScope(user);
    return {
      data: await this.referencesService.list({
        brandId: scope.brandId,
        organizationId: scope.organizationId,
        personaId: EntityIdUtil.validate(id, 'personaId'),
      }),
    };
  }

  @Post(':id/references')
  async add(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: CharacterReferencesDto,
  ): Promise<{ data: CharacterReferenceItem[] }> {
    return {
      data: await this.referencesService.add({
        ...this.scope(request, user, id),
        ingredientIds: body.ingredientIds,
      }),
    };
  }

  @Put(':id/references')
  async reorder(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: CharacterReferencesDto,
  ): Promise<{ data: CharacterReferenceItem[] }> {
    return {
      data: await this.referencesService.reorder({
        ...this.scope(request, user, id),
        ingredientIds: body.ingredientIds,
      }),
    };
  }

  @Delete(':id/references/:ingredientId')
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('ingredientId') ingredientId: string,
  ): Promise<{ data: CharacterReferenceItem[] }> {
    return {
      data: await this.referencesService.remove({
        ...this.scope(request, user, id),
        ingredientId: EntityIdUtil.validate(ingredientId, 'ingredientId'),
      }),
    };
  }

  private scope(
    request: Request,
    user: User,
    id: string,
  ): PersonaReferenceScope {
    return {
      actor: {
        apiKeyContext: user,
        isSuperAdmin: getIsSuperAdmin(user, request),
        userId: user.userId ?? user.id,
      },
      brandId: user.brandId,
      organizationId: user.organizationId,
      personaId: EntityIdUtil.validate(id, 'personaId'),
    };
  }
}
