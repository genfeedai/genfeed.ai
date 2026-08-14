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
  /** When true, include a scrubbed slice of the raw error as detail. */
  includeRawDetail?: boolean;
  /** Defaults to true. Session/auth recoveries are not env configuration. */
  isConfigurationError?: boolean;
}> = [
  {
    match:
      /OPENROUTER_API_KEY|openrouter.*not configured|provider key is not configured/i,
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
    // Anchor bare 429 to status-code context — token counts / ids must not match.
    // Trailing \b rejects "status code 4290".
    match:
      /rate limit|too many requests|status code 429\b|\bHTTP\s*429\b|\b429\b\s*(too many|rate)/i,
    title: 'Provider rate limited',
    summary: 'The model provider asked us to slow down.',
    recovery: 'Wait a moment, then retry the message.',
  },
  {
    // Must run before the broader "timeout" connection pattern below.
    match:
      /did not finish before the recovery timeout|stream recovery timeout|stream timed out/i,
    title: 'Run timed out',
    summary:
      'The agent run took too long to confirm completion over the live stream.',
    recovery:
      'Refresh the conversation — the run may already have finished. Then retry if needed.',
  },
  {
    match:
      /Invalid `?prisma\.|Unknown argument `|prisma\.[a-z]+\.(create|update|upsert)/i,
    title: 'Data save failed',
    summary:
      'The agent could not save a post or related record (schema or database out of sync).',
    recovery:
      'Apply pending database migrations, restart the API, then retry. If it persists, report the tool name and time.',
    includeRawDetail: true,
  },
  {
    // Session / gateway auth before connection ("failed to fetch …") and before
    // the generic provider-401 rule. Confirmed UI-action provider failures use
    // a distinct detail so they do not collide with this pattern.
    match:
      /authentication required|session expired|token expired|jwt is expired|sign in again/i,
    title: 'Session expired',
    summary: 'Your Genfeed session is no longer valid for this request.',
    recovery: 'Refresh the page or sign in again, then retry.',
    isConfigurationError: false,
  },
  {
    match:
      /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|socket hang up|failed to fetch|load failed|networkerror|network error|\bnetwork\b|bad gateway|gateway timeout|status code 502\b|\bHTTP\s*502\b|status code 504\b|\bHTTP\s*504\b|\btimeout\b/i,
    title: 'Connection interrupted',
    summary:
      'Could not reach the agent API (connection dropped or the local API was restarting).',
    recovery:
      'Confirm the API is up (https://api.genfeed.localhost/v1/health), then retry the message.',
  },
  {
    // Tool wrappers often surface bare "Generation failed: 500" when the local
    // API dies mid-request (nest-fast-dev rebuild). Prefer connection copy over
    // a vague "provider unavailable" reading.
    match:
      /generation failed:\s*5\d{2}\b|failed with status(?: code)?\s*500\b|Failed to respond to UI action:\s*500\b|:\s*500\s*$/i,
    title: 'Connection interrupted',
    summary:
      'The API returned a server error mid-request — often a local reload.',
    recovery:
      'Wait for the API to finish restarting, then retry. Avoid generating while the backend is rebuilding.',
  },
  {
    // Also match this rule's own copy. Errors reach the composer from several
    // layers and one of them used to hand over an already-formatted
    // "Title: Summary" string, which matched nothing on the second pass and
    // degraded a real 401 into the generic "Run failed".
    match:
      /401|unauthorized|invalid.*api.?key|invalid token|authentication failed|rejected the credentials/i,
    title: 'Provider authentication failed',
    summary: 'The model provider rejected the credentials for this request.',
    recovery: 'Verify the provider API key, then retry.',
  },
  {
    // ModelsGuard 403 when the request has no usable workspace id. That is
    // not "pick another model" — Auto only skips the allowlist check.
    match: /Organization context is required/i,
    title: 'Workspace missing on this request',
    summary: 'Generate could not see which workspace this request belongs to.',
    recovery:
      'Refresh the page and retry. If it happens again, sign out and sign back in.',
    includeRawDetail: true,
    isConfigurationError: false,
  },
  {
    // Our confirm-generate hop returns JSON:API 403 (allowlist, brand, org).
    // That is not Replicate/fal rejecting the account — keep it off the
    // generic provider-403 rule below.
    match: /Failed to respond to UI action:\s*403\b/i,
    title: 'Action not allowed',
    summary: 'The API refused this generate request.',
    recovery:
      'Switch to Auto or a model enabled for this workspace, then retry.',
    includeRawDetail: true,
    isConfigurationError: false,
  },
  {
    match: /403|forbidden/i,
    title: 'Provider access denied',
    summary: 'The model provider blocked this request.',
    recovery: 'Check model availability and account permissions, then retry.',
  },
  {
    // Anchor 5xx codes the same way — "512 tokens" / "status code 5120" must not match.
    match:
      /status code 5\d{2}\b|\bHTTP\s*5\d{2}\b|server error|bad gateway|service unavailable/i,
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

function extractSafeContext(text: string): string | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  // `\s*[^\r\n]+` overlaps on spaces, so a line of nothing but padding forced
  // the engine to retry every split of it. Requiring a non-space after the
  // optional padding makes the two classes disjoint; lines are trimmed above,
  // so a padding-only tail could never have satisfied the old form either.
  const failedAt = lines.find((line) =>
    /^Failed at:[^\S\r\n]*\S[^\r\n]*$/i.test(line),
  );
  if (!failedAt) {
    return null;
  }

  const retryHint = lines.find((line) =>
    /^This step can be retried\.$/i.test(line),
  );
  return scrubSecrets([failedAt, retryHint].filter(Boolean).join('\n')).slice(
    0,
    160,
  );
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
      const cleaned = scrubSecrets(original);
      const maxDetail = 240;
      const detail = pattern.includeRawDetail
        ? cleaned.length > maxDetail
          ? `${cleaned.slice(0, maxDetail - 1)}…`
          : cleaned
        : extractSafeContext(original);
      return {
        detail,
        isConfigurationError: pattern.isConfigurationError !== false,
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
