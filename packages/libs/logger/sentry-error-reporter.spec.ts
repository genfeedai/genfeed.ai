import {
  buildLoggedErrorReport,
  normalizeErrorMessageForFingerprint,
  SENTRY_REPORT_THROTTLE_MS,
  SentryReportThrottle,
} from '@libs/logger/sentry-error-reporter';
import { BadRequestException } from '@nestjs/common';

describe('normalizeErrorMessageForFingerprint', () => {
  it.each([
    ['Failed for brand 12345', 'Failed for brand <n>'],
    ['Lost 0b9c1f3e-2f4d-4c1a-9a0e-5d6f7a8b9c0d scope', 'Lost <id> scope'],
    ['Missing aaaaaaaaaaaaaaaaaaaaaaaa', 'Missing <id>'],
  ])('turns %j into %j', (message, expected) => {
    expect(normalizeErrorMessageForFingerprint(message)).toBe(expected);
  });
});

describe('buildLoggedErrorReport', () => {
  it('groups by normalised message and tags the service', () => {
    const trace = new Error('401 Unauthorized');

    const report = buildLoggedErrorReport({
      context: { operation: 'getTrends', service: 'TwitterService' },
      message: 'TwitterService getTrends failed',
      trace,
    });

    expect(report).toEqual({
      error: trace,
      extra: {
        loggedMessage: 'TwitterService getTrends failed',
        operation: 'getTrends',
        service: 'TwitterService',
      },
      fingerprint: ['logger.error', 'TwitterService getTrends failed'],
      tags: {
        operation: 'getTrends',
        service: 'TwitterService',
        source: 'logger.error',
      },
    });
  });

  it('wraps a message-only error so Sentry still gets an exception', () => {
    const report = buildLoggedErrorReport({ message: 'Queue stalled' });

    expect(report?.error.message).toBe('Queue stalled');
  });

  it('keeps the serialised provider error in the event extras', () => {
    const report = buildLoggedErrorReport({
      errorData: { code: 401, data: { title: 'Unauthorized' } },
      message: 'getTrends failed',
    });

    expect(report?.extra).toEqual({
      loggedError: { code: 401, data: { title: 'Unauthorized' } },
      loggedMessage: 'getTrends failed',
    });
  });

  it('does not report expected client errors', () => {
    expect(
      buildLoggedErrorReport({
        message: 'Bad input',
        trace: new BadRequestException('Bad input'),
      }),
    ).toBeNull();
  });

  it('does not report what the exception handler already sends', () => {
    expect(
      buildLoggedErrorReport({
        context: { service: 'ExceptionsHandler' },
        message: 'boom',
        trace: new Error('boom'),
      }),
    ).toBeNull();
  });
});

describe('SentryReportThrottle', () => {
  it('lets one message through per window and a different one at once', () => {
    const throttle = new SentryReportThrottle();
    const first = ['logger.error', 'A'];

    expect([
      throttle.shouldReport(first, 0),
      throttle.shouldReport(first, 1000),
      throttle.shouldReport(['logger.error', 'B'], 1000),
      throttle.shouldReport(first, SENTRY_REPORT_THROTTLE_MS),
    ]).toEqual([true, false, true, true]);
  });
});
