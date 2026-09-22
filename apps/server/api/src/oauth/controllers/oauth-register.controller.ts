import { OAuthRegistrationExceptionFilter } from '@api/oauth/filters/oauth-exception.filter';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RegisterOAuthClientDto } from '../dto/register-client.dto';
import { OAuthClientService } from '../services/oauth-client.service';

@ApiTags('OAuth')
@Controller('oauth')
@UseFilters(OAuthRegistrationExceptionFilter)
export class OAuthRegisterController {
  constructor(private readonly clientService: OAuthClientService) {}

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  // Hosted MCP clients (Grok Bot, claude.ai, ChatGPT) register every new user
  // from shared egress IPs, so a per-IP budget of 5 capped a whole vendor at
  // five sign-ups a minute (#4951).
  @RateLimit({ limit: 60, scope: 'ip', windowMs: 60_000 })
  @ApiOperation({ summary: 'Dynamically register a public OAuth client' })
  @ApiResponse({ status: HttpStatus.CREATED })
  register(@Body() dto: RegisterOAuthClientDto) {
    return this.clientService.register(dto);
  }
}
