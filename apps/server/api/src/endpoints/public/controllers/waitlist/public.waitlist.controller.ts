import { JoinWaitlistDto } from '@api/collections/waitlist/dto/join-waitlist.dto';
import { WaitlistService } from '@api/collections/waitlist/services/waitlist.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

function resolveReferrerDomain(
  referer: string | undefined,
): string | undefined {
  if (!referer) {
    return undefined;
  }
  try {
    return new URL(referer).hostname || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Logged-out waitlist for a closed signup. The join answers the same empty 204
 * whether the email is new, already waiting or already decided.
 */
@AutoSwagger()
@Public()
@Controller('public/waitlist')
export class PublicWaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  /** Whether signup is closed, so the sign-up page can offer the waitlist. */
  @Get('status')
  @Header('Cache-Control', 'no-store')
  async getStatus(): Promise<{ isInviteOnly: boolean }> {
    return { isInviteOnly: await this.waitlist.isSignupInviteOnly() };
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @RateLimit({ limit: 5, scope: 'ip', windowMs: 10 * 60_000 })
  async join(
    @Body() dto: JoinWaitlistDto,
    @Headers('referer') referer?: string,
  ): Promise<void> {
    await this.waitlist.join(dto, resolveReferrerDomain(referer));
  }
}
