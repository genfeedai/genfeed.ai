import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSocialAppUrl,
  isMobileDevice,
  openSocialApp,
} from './social-app-link';

describe('getSocialAppUrl', () => {
  it.each([
    ['instagram', 'vincentshipsit', 'instagram://user?username=vincentshipsit'],
    ['twitter', '@VincentShipsIt', 'twitter://user?screen_name=VincentShipsIt'],
    [
      'Instagram',
      'name with space',
      'instagram://user?username=name%20with%20space',
    ],
  ])('opens %s accounts in the app', (platform, handle, expected) => {
    expect(getSocialAppUrl(platform, handle)).toBe(expected);
  });

  it.each([
    ['tiktok', 'someone'],
    ['youtube', 'someone'],
    ['instagram', ''],
  ])('gives no app address for %s "%s"', (platform, handle) => {
    expect(getSocialAppUrl(platform, handle)).toBeNull();
  });
});

describe('isMobileDevice', () => {
  it.each([
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      true,
    ],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', true],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      false,
    ],
  ])('reads %s', (userAgent, expected) => {
    expect(isMobileDevice(userAgent)).toBe(expected);
  });
});

describe('openSocialApp', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function stubPage(isHidden: boolean) {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    vi.stubGlobal('document', { hidden: isHidden });
    vi.useFakeTimers();
    return assign;
  }

  it('opens the app first and falls back to the web page when this page stays visible', () => {
    const assign = stubPage(false);

    openSocialApp('instagram://user?username=a', 'https://www.instagram.com/a');
    expect(assign.mock.calls).toEqual([['instagram://user?username=a']]);

    vi.advanceTimersByTime(1500);
    expect(assign.mock.calls).toEqual([
      ['instagram://user?username=a'],
      ['https://www.instagram.com/a'],
    ]);
  });

  it('stays on the app when this page was hidden by the switch', () => {
    const assign = stubPage(true);

    openSocialApp('instagram://user?username=a', 'https://www.instagram.com/a');
    vi.advanceTimersByTime(1500);

    expect(assign.mock.calls).toEqual([['instagram://user?username=a']]);
  });
});
