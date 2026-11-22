import { logTrendProviderFailure } from '@api/collections/trends/utils/trend-provider-failure-log.util';
import {
  ApifyActorRunTimeoutException,
  ApifyActorUnavailableException,
} from '@api/services/integrations/apify/utils/apify-actor-availability.util';
import type { LoggerService } from '@libs/logger/logger.service';

describe('logTrendProviderFailure', () => {
  const logged: { level: string; message: string }[] = [];
  const logger = {
    error: (message: string) => logged.push({ level: 'error', message }),
    warn: (message: string) => logged.push({ level: 'warn', message }),
  } as unknown as LoggerService;

  beforeEach(() => {
    logged.length = 0;
  });

  it.each([
    [
      'an actor run that timed out',
      new ApifyActorRunTimeoutException('run-1', 120000),
      [
        {
          level: 'warn',
          message:
            'Failed to fetch viral videos for reddit: Actor run run-1 timed out after 120000ms',
        },
      ],
    ],
    [
      'an actor held off by the availability tracker',
      new ApifyActorUnavailableException('reddit trends', 0),
      [
        {
          level: 'warn',
          message:
            'Failed to fetch viral videos for reddit: Apify actor for reddit trends is unavailable. Not retrying until 1970-01-01T00:00:00.000Z.',
        },
      ],
    ],
    [
      'any other failure',
      new Error('boom'),
      [{ level: 'error', message: 'Failed to fetch viral videos for reddit' }],
    ],
  ])('logs %s at the right level', (_case, error, expected) => {
    logTrendProviderFailure(
      logger,
      'Failed to fetch viral videos for reddit',
      error,
    );

    expect(logged).toEqual(expected);
  });
});
