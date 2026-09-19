import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OAuthRevokeTokenDto } from '../dto/revoke-token.dto';
import { OAuthRefreshTokenService } from '../services/oauth-refresh-token.service';

@ApiTags('OAuth')
@Controller('oauth')
export class OAuthRevokeController {
  constructor(private readonly refreshTokenService: OAuthRefreshTokenService) {}

  /**
   * RFC 7009 token revocation. The response is 200 with an empty body whether
   * or not the token existed, so it never confirms a token to a guessing
   * client (§2.2).
   */
  @Post('revoke')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RateLimit({ limit: 10, scope: 'ip', windowMs: 60_000 })
  @ApiOperation({ summary: 'Revoke an MCP OAuth refresh or access token' })
  @ApiResponse({ status: HttpStatus.OK })
  async revoke(@Body() dto: OAuthRevokeTokenDto): Promise<void> {
    await this.refreshTokenService.revoke(dto);
  }
}
