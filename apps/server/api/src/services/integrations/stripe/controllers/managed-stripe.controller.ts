import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { CreateManagedCheckoutDto } from '@api/services/integrations/stripe/dto/create-managed-checkout.dto';
import {
  type ManagedCheckoutResult,
  ManagedStripeCheckoutService,
} from '@api/services/integrations/stripe/services/managed-stripe-checkout.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { StripeUrlSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger('Managed Stripe')
@ApiTags('Managed Stripe')
@Public()
@Controller('services/stripe/managed')
export class ManagedStripeController {
  constructor(
    private readonly managedStripeCheckoutService: ManagedStripeCheckoutService,
  ) {}

  @Post('checkout')
  // Shared across API instances through the Redis-backed rate limit guard.
  @RateLimit({ limit: 5, scope: 'ip', windowMs: 60_000 })
  @ApiOperation({
    summary: 'Create a managed Genfeed checkout session for hosted credits',
  })
  async createCheckout(
    @Body() dto: CreateManagedCheckoutDto,
    @Req() request: Request,
  ) {
    const result =
      await this.managedStripeCheckoutService.createCheckoutSession(dto);

    return serializeSingle(request, StripeUrlSerializer, result);
  }

  @Get('sessions/:sessionId')
  @RateLimit({ limit: 30, scope: 'ip', windowMs: 60_000 })
  @ApiOperation({
    summary:
      'Read the managed checkout provisioning result for a Stripe session',
  })
  async getCheckoutResult(
    @Param('sessionId') sessionId: string,
  ): Promise<ManagedCheckoutResult> {
    const result =
      await this.managedStripeCheckoutService.claimCheckoutResult(sessionId);

    if (!result) {
      throw new HttpException(
        {
          detail: `Checkout session ${sessionId} has no managed provisioning result`,
          title: 'Managed checkout result not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return result;
  }
}
