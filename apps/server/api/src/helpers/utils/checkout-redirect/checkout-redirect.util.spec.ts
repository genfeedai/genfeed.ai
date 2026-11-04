import { resolveAllowedRedirectUrl } from '@api/helpers/utils/checkout-redirect/checkout-redirect.util';

const ALLOWED = ['https://app.genfeed.ai', 'https://genfeed.ai/', undefined];
const FALLBACK = 'https://app.genfeed.ai/settings/credits';

describe('resolveAllowedRedirectUrl', () => {
  it.each([
    ['https://app.genfeed.ai/managed-credits/success?session_id=x'],
    ['https://genfeed.ai/skills'],
  ])('keeps %s on an allowed origin', (requestedUrl) => {
    expect(resolveAllowedRedirectUrl(requestedUrl, FALLBACK, ALLOWED)).toBe(
      requestedUrl,
    );
  });

  it.each([
    ['https://evil.example/success'],
    ['https://app.genfeed.ai.evil.example/success'],
    ['http://app.genfeed.ai/success'],
    ['javascript:alert(1)'],
    ['not a url'],
    [''],
    [undefined],
  ])('falls back for %s', (requestedUrl) => {
    expect(resolveAllowedRedirectUrl(requestedUrl, FALLBACK, ALLOWED)).toBe(
      FALLBACK,
    );
  });

  it('falls back when no allowed origin is configured', () => {
    expect(
      resolveAllowedRedirectUrl('https://app.genfeed.ai/x', FALLBACK, [
        undefined,
        '',
      ]),
    ).toBe(FALLBACK);
  });
});
