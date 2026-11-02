import { isAutomatedVisitor } from '@api/collections/content-previews/services/preview-visitor.util';
import { describe, expect, it } from 'vitest';

describe('isAutomatedVisitor', () => {
  it.each([
    ['Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
    [
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    ],
    ['Twitterbot/1.0'],
    ['LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient)'],
    ['WhatsApp/2.23.20.0 A'],
    [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    ],
    ['Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (Applebot/0.1)'],
    ['curl/8.4.0'],
    ['HeadlessChrome/120.0.0.0'],
    [''],
    [undefined],
  ])('treats %s as automated', (userAgent) => {
    expect(isAutomatedVisitor(userAgent)).toBe(true);
  });

  it.each([
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ],
  ])('treats a person on %s as a visitor', (userAgent) => {
    expect(isAutomatedVisitor(userAgent)).toBe(false);
  });
});
