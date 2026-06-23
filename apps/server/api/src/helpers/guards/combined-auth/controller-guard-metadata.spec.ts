import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { AvatarVideoController } from '@api/collections/videos/controllers/avatar-video.controller';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { RouterController } from '@api/services/router/router.controller';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

function getControllerGuards(target: object): unknown[] {
  return Reflect.getMetadata(GUARDS_METADATA, target) ?? [];
}

describe('controller auth guard metadata', () => {
  it('keeps bare controllers on the global CombinedAuthGuard path only', () => {
    const guards = getControllerGuards(RouterController);

    expect(guards).not.toContain(BetterAuthGuard);
    expect(guards).toEqual([]);
  });

  it('keeps business authorization guards without re-adding BetterAuthGuard', () => {
    const guards = getControllerGuards(AvatarVideoController);

    expect(guards).not.toContain(BetterAuthGuard);
    expect(guards).toEqual([SubscriptionGuard, CreditsGuard]);
  });
});
