import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CreateSkillCheckoutDto } from '@api/skills-pro/dto/create-skill-checkout.dto';
import { SkillCheckoutService } from '@api/skills-pro/services/skill-checkout.service';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';

/** Simple in-memory rate limiter for checkout endpoint */
const checkoutRateLimiter = new Map<
  string,
  { count: number; resetAt: number }
>();
const CHECKOUT_RATE_LIMIT = 5;
const CHECKOUT_RATE_WINDOW_MS = 60_000; // 1 minute

function checkRate(key: string): boolean {
  const now = Date.now();

  // Evict expired entries to prevent memory leak
  for (const [k, v] of checkoutRateLimiter) {
    if (now >= v.resetAt) {
      checkoutRateLimiter.delete(k);
    }
  }

  const entry = checkoutRateLimiter.get(key);

  if (!entry || now >= entry.resetAt) {
    checkoutRateLimiter.set(key, {
      count: 1,
      resetAt: now + CHECKOUT_RATE_WINDOW_MS,
    });
    return true;
  }

  if (entry.count >= CHECKOUT_RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

@AutoSwagger('Skills Pro')
@Controller('skills-pro')
export class SkillCheckoutController {
  constructor(private readonly skillCheckoutService: SkillCheckoutService) {}

  @Public()
  @Post('checkout')
  @ApiOperation({
    summary: 'Create a Stripe checkout session for Skills Pro bundle',
  })
  createCheckout(@Body() dto: CreateSkillCheckoutDto, @Req() req: Request) {
    // Rate limit: max 5 requests per minute per IP
    const clientIp = req.ip || 'unknown';

    if (!checkRate(clientIp)) {
      throw new HttpException(
        'Too many checkout requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return this.skillCheckoutService.createCheckoutSession(dto);
  }
}
