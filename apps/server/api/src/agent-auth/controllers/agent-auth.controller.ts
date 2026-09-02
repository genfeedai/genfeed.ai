import {
  CompleteAgentAuthClaimDto,
  ExchangeAgentAuthClaimDto,
  InspectAgentAuthClaimDto,
  RegisterAgentAuthDto,
  RevokeAgentAuthCredentialDto,
} from '@api/agent-auth/dto/agent-auth.dto';
import { AgentAuthService } from '@api/agent-auth/services/agent-auth.service';
import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { ApiAccessGuard } from '@api/helpers/guards/api-access/api-access.guard';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Agent Auth')
@Controller('agent/auth')
export class AgentAuthController {
  constructor(private readonly agentAuthService: AgentAuthService) {}

  @Post()
  @Public()
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RateLimit({ limit: 5, scope: 'ip', windowMs: 60_000 })
  @ApiOperation({ summary: 'Begin Auth.md verified-email registration' })
  @ApiResponse({ status: HttpStatus.CREATED })
  register(@Body() dto: RegisterAgentAuthDto) {
    return this.agentAuthService.register(dto);
  }

  @Post('claim')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RateLimit({ limit: 12, scope: 'ip', windowMs: 60_000 })
  @ApiOperation({ summary: 'Exchange a completed Auth.md claim for a key' })
  exchange(@Body() dto: ExchangeAgentAuthClaimDto) {
    return this.agentAuthService.exchangeClaim(dto);
  }

  @Post('claim/inspect')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RateLimit({ limit: 12, scope: 'ip', windowMs: 60_000 })
  @ApiOperation({ summary: 'Inspect the scopes bound to an Auth.md claim' })
  inspect(@Body() dto: InspectAgentAuthClaimDto) {
    return this.agentAuthService.inspectClaim(dto);
  }

  @Post('claim/complete')
  @ApiBearerAuth()
  @UseGuards(BetterAuthGuard, ApiAccessGuard)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RateLimit({ limit: 8, scope: 'ip', windowMs: 60_000 })
  @ApiOperation({ summary: 'Confirm an Auth.md claim as the signed-in user' })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteAgentAuthClaimDto,
  ) {
    return this.agentAuthService.completeClaim(user, dto);
  }

  @Post('revoke')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RateLimit({ limit: 10, scope: 'ip', windowMs: 60_000 })
  @ApiOperation({ summary: 'Revoke an Auth.md-issued key by possession' })
  revoke(@Body() dto: RevokeAgentAuthCredentialDto) {
    return this.agentAuthService.revokeCredential(dto);
  }
}
