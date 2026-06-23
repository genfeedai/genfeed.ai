import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import {
  CreateDesktopAuthCodeDto,
  ExchangeDesktopAuthCodeDto,
} from '@api/auth/dto/desktop-auth.dto';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AuthDesktopService } from '@api/auth/services/auth-desktop.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Auth')
@Controller('auth/desktop')
export class AuthDesktopController {
  constructor(private readonly authDesktopService: AuthDesktopService) {}

  @Post('authorize')
  @ApiBearerAuth()
  @UseGuards(BetterAuthGuard)
  @RateLimit({ limit: 8, scope: 'ip', windowMs: 60000 })
  @ApiOperation({
    summary: 'Create a one-time desktop authorization code',
  })
  @ApiResponse({
    description: 'Desktop authorization code created',
    status: HttpStatus.CREATED,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async authorize(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Body() dto: CreateDesktopAuthCodeDto,
  ) {
    return this.authDesktopService.createCode(user, request, dto);
  }

  @Post('exchange')
  @RateLimit({ limit: 10, scope: 'ip', windowMs: 60000 })
  @ApiOperation({
    summary: 'Exchange a one-time desktop code for a desktop session',
  })
  @ApiResponse({
    description: 'Desktop session created',
    status: HttpStatus.CREATED,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  exchange(@Body() dto: ExchangeDesktopAuthCodeDto) {
    return this.authDesktopService.exchangeCode(dto);
  }
}
