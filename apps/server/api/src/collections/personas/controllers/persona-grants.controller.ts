import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { GrantCharacterDto } from '@api/collections/personas/dto/grant-character.dto';
import { PersonaGrantsService } from '@api/collections/personas/services/persona-grants.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

/**
 * Use-only grants of a character to another organization (#6037). Declared
 * before the personas controller so `grantable-organizations` is never read
 * as a persona id.
 */
@AutoSwagger()
@Controller('personas')
@UseGuards(RolesGuard)
export class PersonaGrantsController {
  constructor(private readonly grantsService: PersonaGrantsService) {}

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
}
