import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AccountSubscribeDto } from '@api/collections/newsletter-subscribers/dto/brand-subscribers.dto';
import { BrandSubscribersService } from '@api/collections/newsletter-subscribers/services/brand-subscribers.service';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ApiKeyScope } from '@genfeedai/contracts';
import type { IAccountNewsletterSubscribeResponse } from '@genfeedai/contracts/interfaces';
import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * Subscribe button on a public profile for a signed-in reader: the account's
 * own email is the address, so there is no form and no confirmation email.
 */
@AutoSwagger()
@ApiTags('Newsletters')
@Controller('newsletter')
export class AccountNewsletterSubscribeController {
  constructor(private readonly subscribers: BrandSubscribersService) {}

  @Post('subscribe')
  @RequiredScopes(ApiKeyScope.ADMIN)
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 20, scope: 'user', windowMs: 60_000 })
  @Header('Cache-Control', 'no-store')
  async subscribe(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AccountSubscribeDto,
  ): Promise<IAccountNewsletterSubscribeResponse> {
    return this.subscribers.subscribeAccount(user, dto, request.ip ?? null);
  }
}
