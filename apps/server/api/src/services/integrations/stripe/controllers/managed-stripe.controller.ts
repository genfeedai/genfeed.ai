import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { CreateManagedCheckoutDto } from '@api/services/integrations/stripe/dto/create-managed-checkout.dto';
import {
  type ManagedCheckoutResult,
  ManagedStripeCheckoutService,
} from '@api/services/integrations/stripe/services/managed-stripe-checkout.service';
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

const managedCheckoutRateLimiter = new Map<
  string,
  { count: number; resetAt: number }
>();
const MANAGED_CHECKOUT_RATE_LIMIT = 5;
const MANAGED_CHECKOUT_RATE_WINDOW_MS = 60_000;

function checkManagedCheckoutRate(key: string): boolean {
  const now = Date.now();

  for (const [entryKey, value] of managedCheckoutRateLimiter) {
    if (now >= value.resetAt) {
      managedCheckoutRateLimiter.delete(entryKey);
    }
  }

  const entry = managedCheckoutRateLimiter.get(key);

  if (!entry || now >= entry.resetAt) {
    managedCheckoutRateLimiter.set(key, {
      count: 1,
      resetAt: now + MANAGED_CHECKOUT_RATE_WINDOW_MS,
    });
    return true;
  }

  if (entry.count >= MANAGED_CHECKOUT_RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

@AutoSwagger('Managed Stripe')
@ApiTags('Managed Stripe')
@Public()
@Controller('services/stripe/managed')
export class ManagedStripeController {
  constructor(
    private readonly managedStripeCheckoutService: ManagedStripeCheckoutService,
  ) {}

  @Post('checkout')
  @ApiOperation({
    summary: 'Create a managed Genfeed checkout session for hosted credits',
  })
  async createCheckout(
    @Body() dto: CreateManagedCheckoutDto,
    @Req() request: Request,
  ) {
    const clientIp = request.ip || 'unknown';

    if (!checkManagedCheckoutRate(clientIp)) {
      throw new HttpException(
        'Too many checkout requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const result =
      await this.managedStripeCheckoutService.createCheckoutSession(dto);

    return serializeSingle(request, StripeUrlSerializer, result);
  }

  @Get('sessions/:sessionId')
  @ApiOperation({
    summary:
      'Read the managed checkout provisioning result for a Stripe session',
  })
  async getCheckoutResult(
    @Param('sessionId') sessionId: string,
  ): Promise<ManagedCheckoutResult> {
    const result =
      await this.managedStripeCheckoutService.getCheckoutResult(sessionId);

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
