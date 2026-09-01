import { describe, expect, it } from 'vitest';
import { formatAgentError } from './format-agent-error.util';

describe('formatAgentError', () => {
  it.each([
    [
      { source: 'acknowledgement', status: 504 },
      'Turn acknowledgement timed out',
    ],
    [{ source: 'stream_recovery', status: 408 }, 'Run timed out'],
    [{ source: 'provider', status: 504 }, 'Provider temporarily unavailable'],
    [{ source: 'network', status: 0 }, 'Connection interrupted'],
  ] as const)(
    'classifies structured %s errors without raw-string guessing',
    (input, title) => {
      expect(formatAgentError(input).title).toBe(title);
    },
  );

  it('never exposes localhost health checks in production recovery copy', () => {
    const formatted = formatAgentError({ source: 'network', status: 0 });
    expect(`${formatted.summary} ${formatted.recovery}`).not.toMatch(
      /localhost|127\.0\.0\.1/i,
    );
  });

  it('classifies the message inside a structured API error instead of rendering its transport envelope', () => {
    const formatted = formatAgentError({
      message: 'Generation failed: 500',
      source: 'api',
      status: 500,
    });

    expect(formatted.title).toBe('Connection interrupted');
    expect(formatted.detail).toBeNull();
  });

  it('maps missing provider credentials to configuration guidance', () => {
    const formatted = formatAgentError(
      'OPENROUTER_API_KEY is not configured for this environment',
    );

    expect(formatted.title).toBe('AI provider not connected');
    expect(formatted.isConfigurationError).toBe(true);
    expect(formatted.isRetryable).toBe(false);
  });

  it('marks only known transient failures as immediately retryable', () => {
    expect(
      formatAgentError({ source: 'acknowledgement', status: 504 }),
    ).toMatchObject({ isRetryable: true });
    expect(
      formatAgentError('Request failed with status code 503'),
    ).toMatchObject({ isRetryable: true });
    expect(formatAgentError({ source: 'provider', status: 401 })).toMatchObject(
      {
        isRetryable: false,
        title: 'Provider authentication failed',
      },
    );
    expect(formatAgentError('Unknown terminal failure')).toMatchObject({
      isRetryable: false,
      title: 'Run failed',
    });
  });

  it('does not map user not found to provider-connection guidance', () => {
    const formatted = formatAgentError('user not found');

    expect(formatted.title).not.toBe('AI provider not connected');
    expect(formatted.isConfigurationError).toBe(false);
    expect(formatted.title).toBe('Run failed');
  });

  it('classifies explicit rate-limit phrasing and status-code 429', () => {
    expect(formatAgentError('rate limit exceeded').title).toBe(
      'Provider rate limited',
    );
    expect(formatAgentError('Request failed with status code 429').title).toBe(
      'Provider rate limited',
    );
  });

  it('does not treat embedded 429 digits as rate limits', () => {
    expect(formatAgentError('context length 4290 tokens').title).not.toBe(
      'Provider rate limited',
    );
    expect(formatAgentError('status code 4290').title).not.toBe(
      'Provider rate limited',
    );
  });

  it('classifies status-code 5xx provider outages', () => {
    expect(formatAgentError('Request failed with status code 503').title).toBe(
      'Provider temporarily unavailable',
    );
    // 502 is treated as connection/gateway interruption (local proxy + provider).
    expect(formatAgentError('bad gateway from provider').title).toBe(
      'Connection interrupted',
    );
  });

  it('maps a bare model-route 404 to the admin-switchable default recovery', () => {
    const formatted = formatAgentError('Request failed with status code 404');

    expect(formatted.title).toBe('Chat model unavailable');
    expect(formatted.summary).toMatch(/provider endpoint.*privacy policy/i);
    expect(formatted.recovery).toMatch(/Admin.*Models/i);
    expect(formatted.isConfigurationError).toBe(true);
  });

  it('preserves model-route recovery for a structured provider 404', () => {
    expect(formatAgentError({ source: 'provider', status: 404 }).title).toBe(
      'Chat model unavailable',
    );
  });

  it('maps bare Generation failed: 500 to connection-interrupted (local API reload)', () => {
    expect(formatAgentError('Generation failed: 500').title).toBe(
      'Connection interrupted',
    );
    expect(formatAgentError('Generation failed: 502').summary).toMatch(
      /server error mid-request/i,
    );
  });

  it('maps thread UI-action 403s to our API refusal, not a provider block', () => {
    // Confirm-generate hops through POST /v1/images. A 403 there is our
    // allowlist / brand / org check — ErrorResponse.forbidden() — not Replicate
    // rejecting the account. The generic /403|forbidden/ rule used to say
    // "Provider access denied".
    const formatted = formatAgentError(
      'Failed to respond to UI action: 403 - Insufficient permissions',
    );

    expect(formatted.title).toBe('Action not allowed');
    expect(formatted.summary).toMatch(/API refused/i);
    expect(formatted.title).not.toBe('Provider access denied');
    expect(formatted.detail).toMatch(/Insufficient permissions/i);
  });

  it('does not tell the operator to switch to Auto when no models are enabled', () => {
    const formatted = formatAgentError(
      'Failed to respond to UI action: 403 - No models enabled for this workspace',
    );

    expect(formatted.title).toBe('Action not allowed');
    expect(formatted.summary).toMatch(/no models enabled/i);
    expect(formatted.recovery).toMatch(/Org Settings/i);
    expect(formatted.recovery).not.toMatch(/switch to auto/i);
    expect(formatted.title).not.toBe('Provider access denied');
  });

  it('keeps a specific UI-action 403 detail when the hop named the real reason', () => {
    const formatted = formatAgentError(
      'Failed to respond to UI action: 403 - Model not enabled for this organization',
    );

    expect(formatted.title).toBe('Action not allowed');
    expect(formatted.detail).toMatch(/Model not enabled/i);
    expect(formatted.recovery).not.toMatch(/switch to auto/i);
    expect(formatted.recovery).toMatch(/enabled for this workspace/i);
    expect(formatted.title).not.toBe('Provider access denied');
  });

  it('does not tell the operator to switch models when the workspace id is missing', () => {
    const formatted = formatAgentError(
      'Failed to respond to UI action: 403 - Organization context is required',
    );

    expect(formatted.title).toBe('Workspace missing on this request');
    expect(formatted.summary).toMatch(/workspace/i);
    expect(formatted.recovery).toMatch(/refresh/i);
    expect(formatted.recovery).not.toMatch(/switch to auto/i);
    expect(formatted.title).not.toBe('Provider access denied');
  });

  it('does not call a cancelled generate a connection interrupt', () => {
    // The abort hook used to cancel Replicate when the POST body finished,
    // then Nest turned GenerationCancelledError into 500. The generic
    // UI-action-500 rule said "local reload". Vincent did not reload.
    const formatted = formatAgentError(
      'Failed to respond to UI action: 500 - Request failed with status code 500: Cancelled by user',
    );

    expect(formatted.title).toBe('Generate was cancelled');
    expect(formatted.summary).toMatch(/stopped before the image finished/i);
    expect(formatted.title).not.toBe('Connection interrupted');
    expect(formatted.recovery).toMatch(/retry/i);
    expect(formatted.isConfigurationError).toBe(false);
  });

  it('maps thread UI-action axios 500s to connection-interrupted, not provider outage', () => {
    // Confirm-generate waits on POST /v1/images through the same API. When that
    // hop 500s (proxy timeout, hung Replicate call, local reload) axios says
    // "Request failed with status code 500" and the UI-action wrapper repeats
    // the 500. That must not read as "the model provider is down".
    const formatted = formatAgentError(
      'Failed to respond to UI action: 500 - Request failed with status code 500',
    );

    expect(formatted.title).toBe('Connection interrupted');
    expect(formatted.summary).toMatch(/server error mid-request/i);
    expect(formatted.title).not.toBe('Provider temporarily unavailable');
  });

  it('classifies local API / proxy connection failures', () => {
    expect(formatAgentError('connect ECONNREFUSED 127.0.0.1:4635').title).toBe(
      'Connection interrupted',
    );
    expect(formatAgentError('Failed to fetch').title).toBe(
      'Connection interrupted',
    );
    expect(formatAgentError('socket hang up').title).toBe(
      'Connection interrupted',
    );
  });

  it('classifies stream recovery timeouts', () => {
    expect(
      formatAgentError('Agent run did not finish before the recovery timeout.')
        .title,
    ).toBe('Run timed out');
  });

  it('classifies Prisma invalid-invocation dumps', () => {
    expect(
      formatAgentError(
        'Invalid `prisma.post.create()` invocation:\n{ data: { visibility: "public" } }\nUnknown argument `visibility`.',
      ).title,
    ).toBe('Data save failed');
  });

  it('still extracts a Failed at: context line as safe detail', () => {
    const formatted = formatAgentError(
      ['rate limit exceeded', 'Failed at: generate_image', ''].join('\n'),
    );

    expect(formatted.detail).toBe('Failed at: generate_image');
  });

  it('ignores a Failed at: line with nothing after the label', () => {
    expect(
      formatAgentError(['rate limit exceeded', 'Failed at:'].join('\n')).detail,
    ).toBeNull();
  });

  it('scans a padding-only Failed at: line in linear time', () => {
    // `\s*[^\r\n]+` overlapped on spaces, so a line of pure padding forced the
    // engine to retry every split of it. Budget is generous — the old form took
    // seconds on this input, the new one is sub-millisecond.
    const started = performance.now();
    formatAgentError(
      ['rate limit exceeded', `Failed at:${' '.repeat(40_000)}`].join('\n'),
    );

    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it('still classifies an already-formatted provider auth error', () => {
    // The composer used to receive `${title}: ${summary}` and format it a
    // second time. The concatenated string matched no pattern, so a real 401
    // surfaced as the generic "Run failed / The agent hit an error".
    const formatted = formatAgentError(
      'Provider authentication failed: The model provider rejected the credentials for this request.',
    );

    expect(formatted.title).toBe('Provider authentication failed');
    expect(formatted.isConfigurationError).toBe(true);
  });

  it('classifies session Authentication required separately from provider 401s', () => {
    // Must win over the connection pattern's "failed to fetch" substring and
    // over the generic provider-401 matcher.
    const session = formatAgentError(
      'Failed to fetch threads: 401 - Authentication required',
    );
    expect(session.title).toBe('Session expired');
    expect(session.recovery).toMatch(/sign in again/i);
    expect(session.isConfigurationError).toBe(false);

    const provider = formatAgentError(
      'Failed to respond to UI action: 401 - The model provider rejected the credentials for this request.',
    );
    expect(provider.title).toBe('Provider authentication failed');
    expect(provider.recovery).toMatch(/provider API key/i);
    expect(provider.isConfigurationError).toBe(true);
  });

  it('does not treat arbitrary 5xx-looking numbers as provider outages', () => {
    expect(formatAgentError('prompt used 512 tokens').title).not.toBe(
      'Provider temporarily unavailable',
    );
    expect(formatAgentError('status code 5120').title).not.toBe(
      'Provider temporarily unavailable',
    );
  });
});
