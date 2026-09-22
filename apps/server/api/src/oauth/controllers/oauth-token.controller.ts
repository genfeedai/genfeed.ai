import { OAuthExceptionFilter } from '@api/oauth/filters/oauth-exception.filter';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { Public } from '@libs/decorators/public.decorator';
import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  isAuthorizationCodeGrant,
  isRefreshTokenGrant,
  OAuthTokenExchangeDto,
} from '../dto/token-exchange.dto';
import { OAuthAuthorizeService } from '../services/oauth-authorize.service';
import { OAuthRefreshTokenService } from '../services/oauth-refresh-token.service';

@ApiTags('OAuth')
@Controller('oauth')
@UseFilters(OAuthExceptionFilter)
export class OAuthTokenController {
  constructor(
    private readonly authorizeService: OAuthAuthorizeService,
    private readonly refreshTokenService: OAuthRefreshTokenService,
  ) {}

  @Post('token')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  // Shared egress IPs of hosted MCP clients carry every user's exchange and
  // refresh (#4951).
  @RateLimit({ limit: 60, scope: 'ip', windowMs: 60_000 })
  @ApiOperation({
    summary:
      'Exchange an OAuth code, or rotate a refresh token, for an MCP access token',
  })
  @ApiResponse({ status: HttpStatus.OK })
  exchange(@Body() dto: OAuthTokenExchangeDto) {
    if (isRefreshTokenGrant(dto)) {
      return this.refreshTokenService.refresh(dto);
    }
    if (isAuthorizationCodeGrant(dto)) {
      return this.authorizeService.exchangeToken(dto);
    }
    throw new BadRequestException({
      error: 'unsupported_grant_type',
      error_description: 'Unsupported grant type',
    });
  }
}
