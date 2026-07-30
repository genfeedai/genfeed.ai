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
    const formatted = formatAgentError('context length 4290 tokens');

    expect(formatted.title).not.toBe('Provider rate limited');
    expect(formatted.title).toBe('Run failed');
  });

  it('classifies status-code 5xx provider outages', () => {
    expect(formatAgentError('Request failed with status code 503').title).toBe(
      'Provider temporarily unavailable',
    );
    expect(formatAgentError('bad gateway from provider').title).toBe(
      'Provider temporarily unavailable',
    );
  });

  it('does not treat arbitrary 5xx-looking numbers as provider outages', () => {
    const formatted = formatAgentError('prompt used 512 tokens');

    expect(formatted.title).not.toBe('Provider temporarily unavailable');
    expect(formatted.title).toBe('Run failed');
  });
});
