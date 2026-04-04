import { AvatarVideoController } from '@api/collections/videos/controllers/avatar-video.controller';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
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

    expect(guards).not.toContain(ClerkGuard);
    expect(guards).toEqual([]);
  });

  it('keeps business authorization guards without re-adding ClerkGuard', () => {
    const guards = getControllerGuards(AvatarVideoController);

    expect(guards).not.toContain(ClerkGuard);
    expect(guards).toEqual([SubscriptionGuard, CreditsGuard]);
  });
});
