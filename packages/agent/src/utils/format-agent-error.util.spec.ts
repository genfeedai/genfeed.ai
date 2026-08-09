import { describe, expect, it } from 'vitest';
import { formatAgentError } from './format-agent-error.util';

describe('formatAgentError', () => {
  it('maps missing provider credentials to configuration guidance', () => {
    const formatted = formatAgentError(
      'OPENROUTER_API_KEY is not configured for this environment',
    );

    expect(formatted.title).toBe('AI provider not connected');
    expect(formatted.isConfigurationError).toBe(true);
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

  it('does not treat arbitrary 5xx-looking numbers as provider outages', () => {
    expect(formatAgentError('prompt used 512 tokens').title).not.toBe(
      'Provider temporarily unavailable',
    );
    expect(formatAgentError('status code 5120').title).not.toBe(
      'Provider temporarily unavailable',
    );
  });
});
