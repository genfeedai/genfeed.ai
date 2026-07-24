import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { Public } from '@libs/decorators/public.decorator';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RegisterOAuthClientDto } from '../dto/register-client.dto';
import { OAuthClientService } from '../services/oauth-client.service';

@ApiTags('OAuth')
@Controller('oauth')
export class OAuthRegisterController {
  constructor(private readonly clientService: OAuthClientService) {}

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 5, scope: 'ip', windowMs: 60_000 })
  @ApiOperation({ summary: 'Dynamically register a public OAuth client' })
  @ApiResponse({ status: HttpStatus.CREATED })
  register(@Body() dto: RegisterOAuthClientDto) {
    return this.clientService.register(dto);
  }
}
