/**
 * Map raw provider / ops errors into user-facing copy.
 * Never surface env var names, stack frames, or raw HTTP dumps in the UI.
 */

export type FormattedAgentError = {
  /** Short headline for cards / alerts */
  title: string;
  /** One-line explanation */
  summary: string;
  /** Optional secondary detail (safe for display) */
  detail: string | null;
  /** Recovery hint */
  recovery: string | null;
  /** True when the operator must fix env / billing / provider setup */
  isConfigurationError: boolean;
};

const CONFIG_PATTERNS: Array<{
  match: RegExp;
  title: string;
  summary: string;
  recovery: string;
}> = [
  {
    match:
      /OPENROUTER_API_KEY|openrouter.*not configured|provider key is not configured|user not found/i,
    title: 'AI provider not connected',
    summary:
      'The language model provider is missing or rejected this environment’s credentials.',
    recovery:
      'Add a valid OpenRouter API key for this environment, restart the API, then try again.',
  },
  {
    match: /insufficient credits|not enough credits/i,
    title: 'Not enough credits',
    summary: 'This run needs more credits than your workspace currently has.',
    recovery: 'Add credits or switch to a lower-cost model, then retry.',
  },
  {
    match: /rate limit|too many requests|429/i,
    title: 'Provider rate limited',
    summary: 'The model provider asked us to slow down.',
    recovery: 'Wait a moment, then retry the message.',
  },
  {
    match: /timeout|ETIMEDOUT|ECONNRESET|network/i,
    title: 'Connection interrupted',
    summary: 'The request to the model provider did not complete.',
    recovery: 'Check your connection and retry.',
  },
  {
    match: /401|unauthorized|invalid.*api.?key|invalid token/i,
    title: 'Provider authentication failed',
    summary: 'The model provider rejected the credentials for this request.',
    recovery: 'Verify the provider API key, then retry.',
  },
  {
    match: /403|forbidden/i,
    title: 'Provider access denied',
    summary: 'The model provider blocked this request.',
    recovery: 'Check model availability and account permissions, then retry.',
  },
  {
    match: /5\d{2}|server error|bad gateway|service unavailable/i,
    title: 'Provider temporarily unavailable',
    summary: 'The model provider returned a server error.',
    recovery:
      'Retry in a moment. If it keeps failing, try Auto or another model.',
  },
];

function scrubSecrets(text: string): string {
  return text
    .replace(/sk-[a-zA-Z0-9_-]{8,}/g, 'sk-…')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer …')
    .replace(/OPENROUTER_API_KEY/gi, 'provider key')
    .replace(/[A-Z][A-Z0-9_]{2,}_API_KEY/g, 'provider key')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatAgentError(
  raw: string | null | undefined,
): FormattedAgentError {
  const original = (raw ?? '').trim();

  if (!original) {
    return {
      detail: null,
      isConfigurationError: false,
      recovery: 'Retry the message. If it fails again, try Auto.',
      summary: 'The agent run did not finish.',
      title: 'Run failed',
    };
  }

  // Classify against the raw message so env-var names still match, then scrub
  // any secrets before they could reach the UI detail field.
  for (const pattern of CONFIG_PATTERNS) {
    if (pattern.match.test(original)) {
      return {
        detail: null,
        isConfigurationError: true,
        recovery: pattern.recovery,
        summary: pattern.summary,
        title: pattern.title,
      };
    }
  }

  const cleaned = scrubSecrets(original);

  const statusOnly = cleaned.match(
    /^Request failed with status code (\d{3})$/i,
  );
  if (statusOnly) {
    const code = statusOnly[1];
    return {
      detail: null,
      isConfigurationError: code === '401' || code === '403',
      recovery: 'Retry the message, or pick a different model.',
      summary: `The model request failed (HTTP ${code}).`,
      title: code === '401' ? 'Provider authentication failed' : 'Run failed',
    };
  }

  const maxDetail = 160;
  const detail =
    cleaned.length > maxDetail
      ? `${cleaned.slice(0, maxDetail - 1)}…`
      : cleaned;

  return {
    detail,
    isConfigurationError: false,
    recovery: 'Retry the message, or pick a different model.',
    summary: 'The agent hit an error while running.',
    title: 'Run failed',
  };
}

/** Single-line detail safe for timeline step rows. */
export function formatAgentErrorDetail(
  raw: string | null | undefined,
): string | null {
  const formatted = formatAgentError(raw);
  if (formatted.detail) {
    return formatted.detail;
  }
  return formatted.summary;
}
