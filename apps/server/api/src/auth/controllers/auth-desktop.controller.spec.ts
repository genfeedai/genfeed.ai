import { AuthDesktopController } from '@api/auth/controllers/auth-desktop.controller';
import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import { describe, expect, it } from 'vitest';

describe('AuthDesktopController', () => {
  it('leaves PKCE exchange public so desktop and CLI can finish sign-in without a session', () => {
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        AuthDesktopController.prototype.exchange,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        AuthDesktopController.prototype.authorize,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, AuthDesktopController),
    ).toBeUndefined();
  });
});
