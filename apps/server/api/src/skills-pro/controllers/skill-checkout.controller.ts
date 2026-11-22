import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { CreateSkillCheckoutDto } from '@api/skills-pro/dto/create-skill-checkout.dto';
import { SkillCheckoutService } from '@api/skills-pro/services/skill-checkout.service';
import { Public } from '@libs/decorators/public.decorator';
import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

@AutoSwagger('Skills Pro')
@Controller('skills-pro')
export class SkillCheckoutController {
  constructor(private readonly skillCheckoutService: SkillCheckoutService) {}

  @Public()
  @Post('checkout')
  // Shared across API instances through the Redis-backed rate limit guard.
  @RateLimit({ limit: 5, scope: 'ip', windowMs: 60_000 })
  @ApiOperation({
    summary: 'Create a Stripe checkout session for Skills Pro bundle',
  })
  createCheckout(@Body() dto: CreateSkillCheckoutDto) {
    return this.skillCheckoutService.createCheckoutSession(dto);
  }
}
