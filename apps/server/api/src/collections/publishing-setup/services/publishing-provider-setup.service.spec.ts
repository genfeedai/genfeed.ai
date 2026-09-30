import { PublishingProviderSetupService } from '@api/collections/publishing-setup/services/publishing-provider-setup.service';
import {
  canScheduleWithPublishingReadiness,
  classifyPublishingReadiness,
} from '@genfeedai/helpers';
import type { ConfigService } from '@libs/config/config.service';

const CHECKED_AT = '2026-06-02T00:00:00.000Z';

describe('PublishingProviderSetupService', () => {
  let env: Record<string, string>;

  function build(): PublishingProviderSetupService {
    return new PublishingProviderSetupService({
      get: (key: string) => env[key],
    } as unknown as ConfigService);
  }

  beforeEach(() => {
    vi.stubEnv('GENFEED_CLOUD', '');
    env = {
      GENFEEDAI_API_PUBLIC_URL: 'https://api.example.com',
      GENFEEDAI_APP_URL: 'https://app.example.com',
      MEDIUM_CLIENT_ID: 'medium-app-identifier',
      MEDIUM_CLIENT_SECRET: 'medium-app-secret-value',
      MEDIUM_REDIRECT_URI: 'https://app.example.com/oauth/medium',
      TWITTER_CLIENT_ID: 'twitter-app-identifier',
      TWITTER_CLIENT_SECRET: 'twitter-app-secret-value',
      TWITTER_REDIRECT_URI: 'https://app.example.com/oauth/twitter',
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('passes app review for a platform that gates nothing behind an approval', () => {
    expect(build().resolveProviderSignals('medium', CHECKED_AT)).toEqual({
      appReviewStatus: 'pass',
      callbackUrlStatus: 'pass',
      diagnostics: [],
    });
  });

  it('leaves an unverifiable approval unknown without degrading the credential', () => {
    const signals = build().resolveProviderSignals('twitter', CHECKED_AT);

    expect(signals.appReviewStatus).toBe('unknown');
    expect(signals.callbackUrlStatus).toBe('pass');
    expect(signals.diagnostics).toEqual([
      {
        checkedAt: CHECKED_AT,
        classification: 'missing_provider_approval',
        code: 'provider_app_review_unverified',
        details: { appReviewProgram: 'X API access tier' },
        isRetryable: false,
        message:
          'X (Twitter) gates production publishing behind X API access tier, which this installation cannot verify — confirm the app is approved for the publishing scopes it requests.',
        scope: 'app_review',
        // Informational: an unobservable approval must not block scheduling.
        severity: 'info',
      },
    ]);
    // No corrective action: a healthy credential must not inherit a
    // requiredAction from an FYI.
    expect(signals.diagnostics[0]).not.toHaveProperty('correctiveAction');
  });

  it('treats PLACEHOLDER_NOT_CONFIGURED as not configured', () => {
    env.TWITTER_CLIENT_ID = 'PLACEHOLDER_NOT_CONFIGURED';
    env.TWITTER_CLIENT_SECRET = 'PLACEHOLDER_NOT_CONFIGURED';

    const signals = build().resolveProviderSignals('twitter', CHECKED_AT);

    expect(signals.appReviewStatus).toBe('fail');
    expect(signals.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'provider_not_configured',
    ]);
  });

  it('fails app review when there is no configured app to review', () => {
    env.TWITTER_CLIENT_ID = '';
    env.TWITTER_CLIENT_SECRET = '   ';

    const signals = build().resolveProviderSignals('twitter', CHECKED_AT);

    expect(signals.appReviewStatus).toBe('fail');
    expect(signals.callbackUrlStatus).toBe('warn');
    expect(signals.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'provider_not_configured',
    ]);
  });

  it.each([
    ['self-hosted', ''],
    ['cloud', 'true'],
  ])(
    'blocks a partially configured provider on %s rather than degrading it',
    (_deployment, cloudFlag) => {
      // Deliberate asymmetry with `provider_not_configured` (#2256): absent
      // credentials are an operator *choice* and follow the deployment axis,
      // but a half-configured app is an operator *error* that boots fine and
      // then fails at connect time. Downgrading it self-hosted would restore
      // `canSchedule`, letting a post be scheduled against a provider that
      // cannot complete an OAuth exchange.
      vi.stubEnv('GENFEED_CLOUD', cloudFlag);
      delete env.TWITTER_CLIENT_SECRET;

      const signals = build().resolveProviderSignals('twitter', CHECKED_AT);
      const state = classifyPublishingReadiness(signals.diagnostics);

      expect(signals.diagnostics).toContainEqual(
        expect.objectContaining({
          classification: 'misconfiguration',
          code: 'provider_partially_configured',
          details: { missingEnvKeys: ['TWITTER_CLIENT_SECRET'] },
          isRetryable: false,
          severity: 'error',
        }),
      );
      expect(state).toBe('blocked');
      expect(canScheduleWithPublishingReadiness(state)).toBe(false);
    },
  );

  it('fails app review for a half-configured app rather than calling it reviewable', () => {
    // The app-review question needs a *complete* app: a client id with no
    // secret is not an app anyone can submit for review, so reporting
    // `unknown` ("approval pending") would overstate what exists.
    delete env.TWITTER_CLIENT_SECRET;

    const signals = build().resolveProviderSignals('twitter', CHECKED_AT);

    expect(signals.appReviewStatus).toBe('fail');
    expect(signals.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'provider_partially_configured',
    ]);
  });

  it('takes the worst of the provider and shared callback signals', () => {
    env.TWITTER_REDIRECT_URI = '/oauth/twitter';
    env.GENFEEDAI_APP_URL = 'http://app.genfeed.localhost';

    const signals = build().resolveProviderSignals('twitter', CHECKED_AT);

    expect(signals.callbackUrlStatus).toBe('fail');
    expect(signals.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'provider_redirect_uri_invalid',
      'callback_origin_not_publicly_reachable',
      'provider_app_review_unverified',
    ]);
  });

  it('escalates a loopback callback origin to a failure on cloud', () => {
    env.GENFEEDAI_APP_URL = 'http://localhost:3000';
    vi.stubEnv('GENFEED_CLOUD', 'true');

    expect(build().resolveProviderSignals('twitter', CHECKED_AT)).toMatchObject(
      {
        callbackUrlStatus: 'fail',
      },
    );
  });

  it('reports unknown for a provider outside the descriptor registry', () => {
    expect(build().resolveProviderSignals('mastodon', CHECKED_AT)).toEqual({
      appReviewStatus: 'unknown',
      callbackUrlStatus: 'unknown',
      diagnostics: [],
    });
  });
});
