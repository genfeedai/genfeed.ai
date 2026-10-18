import { SwitchOrganizationDto } from '@api/auth/dto/switch-organization.dto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * POST /auth/switch-organization — move a switchable MCP session to another
 * organization the signed-in user belongs to. The session key keeps its issued
 * organization; the choice is recorded on it and re-checked against live
 * membership on every request.
 */
@Controller('auth')
export class AuthSwitchOrganizationController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post('switch-organization')
  async switchOrganization(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SwitchOrganizationDto,
  ) {
    const apiKey = user.apiKeyId
      ? await this.apiKeysService.findActiveById(user.apiKeyId)
      : null;
    if (!apiKey) {
      throw new UnauthorizedException('An active MCP session is required');
    }

    const isSwitched = await this.apiKeysService.switchActiveOrganization(
      apiKey,
      dto.organizationId,
    );
    if (!isSwitched) {
      throw new ForbiddenException(
        'This connection cannot switch to that organization',
      );
    }

    return { data: { organizationId: dto.organizationId } };
  }
}
