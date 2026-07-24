import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OAuthAuthorizeDecisionDto } from '../dto/authorize-decision.dto';
import { OAuthAuthorizeRequestDto } from '../dto/authorize-request.dto';
import { OAuthAuthorizeService } from '../services/oauth-authorize.service';

@ApiTags('OAuth')
@Controller('oauth')
export class OAuthAuthorizeController {
  constructor(private readonly authorizeService: OAuthAuthorizeService) {}

  @Get('authorize')
  @Public()
  @Redirect()
  @RateLimit({ limit: 30, scope: 'ip', windowMs: 60_000 })
  @ApiOperation({ summary: 'Begin an OAuth authorization-code flow' })
  async authorize(@Query() dto: OAuthAuthorizeRequestDto) {
    return {
      statusCode: 302,
      url: await this.authorizeService.buildAuthorizeRedirect(dto),
    };
  }

  @Post('authorize/decision')
  @ApiBearerAuth()
  @UseGuards(BetterAuthGuard)
  @RateLimit({ limit: 8, scope: 'ip', windowMs: 60_000 })
  @ApiOperation({ summary: 'Approve or deny OAuth access' })
  decide(@CurrentUser() user: User, @Body() dto: OAuthAuthorizeDecisionDto) {
    return this.authorizeService.decideAuthorization(user, dto);
  }
}
