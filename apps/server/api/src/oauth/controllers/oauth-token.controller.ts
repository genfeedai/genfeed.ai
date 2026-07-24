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
import { OAuthTokenExchangeDto } from '../dto/token-exchange.dto';
import { OAuthAuthorizeService } from '../services/oauth-authorize.service';

@ApiTags('OAuth')
@Controller('oauth')
export class OAuthTokenController {
  constructor(private readonly authorizeService: OAuthAuthorizeService) {}

  @Post('token')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RateLimit({ limit: 10, scope: 'ip', windowMs: 60_000 })
  @ApiOperation({ summary: 'Exchange an OAuth code for an MCP access token' })
  @ApiResponse({ status: HttpStatus.OK })
  exchange(@Body() dto: OAuthTokenExchangeDto) {
    return this.authorizeService.exchangeToken(dto);
  }
}
