import { AgentFailureReason } from '@genfeedai/contracts';
import type { IAgentFailure } from '@genfeedai/contracts/interfaces';

/**
 * Map raw provider / ops errors into user-facing copy.
 * Never surface env var names, stack frames, or raw HTTP dumps in the UI.
 */

export type FormattedAgentError = IAgentFailure;

export type AgentErrorDescriptor = {
  detail?: string;
  message?: string;
  source?:
    | 'acknowledgement'
    | 'api'
    | 'network'
    | 'provider'
    | 'stream_recovery';
  status?: number;
};

const STRUCTURED_ERROR_PREFIX = 'agent-error:';

const CONFIG_PATTERNS: Array<{
  match: RegExp;
  reason: AgentFailureReason;
  title: string;
  summary: string;
  recovery: string;
  /** When true, include a scrubbed slice of the raw error as detail. */
  includeRawDetail?: boolean;
  /** Defaults to true. Session/auth recoveries are not env configuration. */
  isConfigurationError?: boolean;
  /** Defaults to false. Retry must be explicitly safe for this error class. */
  isRetryable?: boolean;
}> = [
  {
    match:
      /OPENROUTER_API_KEY|openrouter.*not configured|provider key is not configured/i,
    reason: AgentFailureReason.PROVIDER_CONFIGURATION,
    title: 'AI provider not connected',
    summary:
      'The language model provider is missing or rejected this environment’s credentials.',
    recovery:
      'Add a valid OpenRouter API key for this environment, restart the API, then try again.',
  },
  {
    match: /insufficient credits|not enough credits/i,
    reason: AgentFailureReason.INSUFFICIENT_CREDITS,
    title: 'Not enough credits',
    summary: 'This run needs more credits than your workspace currently has.',
    recovery: 'Add credits or switch to a lower-cost model, then retry.',
  },
  {
    // Anchor bare 429 to status-code context — token counts / ids must not match.
    // Trailing \b rejects "status code 4290".
    match:
      /rate limit|too many requests|status code 429\b|\bHTTP\s*429\b|\b429\b\s*(too many|rate)/i,
    reason: AgentFailureReason.RATE_LIMITED,
    title: 'Provider rate limited',
    summary: 'The model provider asked us to slow down.',
    recovery: 'Wait a moment, then retry the message.',
    isRetryable: true,
  },
  {
    // Must run before the broader "timeout" connection pattern below.
    match:
      /did not finish before the recovery timeout|stream recovery timeout|stream timed out/i,
    reason: AgentFailureReason.TIMEOUT,
    title: 'Run timed out',
    summary:
      'The agent run took too long to confirm completion over the live stream.',
    recovery:
      'Refresh the conversation — the run may already have finished. Then retry if needed.',
    isRetryable: true,
  },
  {
    match:
      /Invalid `?prisma\.|Unknown argument `|prisma\.[a-z]+\.(create|update|upsert)/i,
    reason: AgentFailureReason.DATA_SAVE_FAILED,
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
    reason: AgentFailureReason.SESSION_EXPIRED,
    title: 'Session expired',
    summary: 'Your Genfeed session is no longer valid for this request.',
    recovery: 'Refresh the page or sign in again, then retry.',
    isConfigurationError: false,
  },
  {
    match:
      /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|socket hang up|failed to fetch|load failed|networkerror|network error|\bnetwork\b|bad gateway|gateway timeout|status code 502\b|\bHTTP\s*502\b|status code 504\b|\bHTTP\s*504\b|\btimeout\b/i,
    reason: AgentFailureReason.CONNECTION_INTERRUPTED,
    title: 'Connection interrupted',
    summary:
      'The connection to the agent service was interrupted before it could respond.',
    recovery: 'Check your connection, then retry the message.',
    isRetryable: true,
  },
  {
    // Must run before the UI-action-500 "local reload" rule. A cancelled
    // Replicate job is wrapped as 500 ("Cancelled by user") — that is not
    // a dropped connection.
    match: /Cancelled by user/i,
    reason: AgentFailureReason.CANCELLED,
    title: 'Generate was cancelled',
    summary: 'The generate job was stopped before the image finished.',
    recovery: 'Retry Generate on the card. You do not need to switch models.',
    includeRawDetail: true,
    isConfigurationError: false,
    isRetryable: true,
  },
  {
    // Tool wrappers often surface bare "Generation failed: 500" when the local
    // API dies mid-request (nest-fast-dev rebuild). Prefer connection copy over
    // a vague "provider unavailable" reading.
    match:
      /generation failed:\s*5\d{2}\b|failed with status(?: code)?\s*500\b|Failed to respond to UI action:\s*500\b|:\s*500\s*$/i,
    reason: AgentFailureReason.CONNECTION_INTERRUPTED,
    title: 'Connection interrupted',
    summary: 'The agent service returned a server error mid-request.',
    recovery: 'Wait a moment, then retry the message.',
    isRetryable: true,
  },
  {
    // Also match this rule's own copy. Errors reach the composer from several
    // layers and one of them used to hand over an already-formatted
    // "Title: Summary" string, which matched nothing on the second pass and
    // degraded a real 401 into the generic "Run failed".
    match:
      /401|unauthorized|invalid.*api.?key|invalid token|authentication failed|rejected the credentials/i,
    reason: AgentFailureReason.PROVIDER_AUTHENTICATION,
    title: 'Provider authentication failed',
    summary: 'The model provider rejected the credentials for this request.',
    recovery: 'Verify the provider API key, then retry.',
  },
  {
    // ModelsGuard 403 when the request has no usable workspace id. That is
    // not "pick another model" — Auto only skips the allowlist check.
    match: /Organization context is required/i,
    reason: AgentFailureReason.WORKSPACE_MISSING,
    title: 'Workspace missing on this request',
    summary: 'Generate could not see which workspace this request belongs to.',
    recovery:
      'Refresh the page and retry. If it happens again, sign out and sign back in.',
    includeRawDetail: true,
    isConfigurationError: false,
  },
  {
    // Auto generate with an empty or all-off allowlist after seed (#3227).
    // Do not tell the operator to switch to Auto — they are already on Auto.
    match: /No models enabled for this workspace/i,
    reason: AgentFailureReason.ACTION_NOT_ALLOWED,
    title: 'Action not allowed',
    summary: 'This workspace has no models enabled for generate.',
    recovery: 'Enable at least one model in Org Settings → Models, then retry.',
    includeRawDetail: true,
    isConfigurationError: false,
  },
  {
    // Our confirm-generate hop returns JSON:API 403 (allowlist, brand, org).
    // That is not Replicate/fal rejecting the account — keep it off the
    // generic provider-403 rule below.
    match: /Failed to respond to UI action:\s*403\b/i,
    reason: AgentFailureReason.ACTION_NOT_ALLOWED,
    title: 'Action not allowed',
    summary: 'The API refused this generate request.',
    recovery: 'Pick a model enabled for this workspace, then retry.',
    includeRawDetail: true,
    isConfigurationError: false,
  },
  {
    match:
      /No endpoints found matching.*data polic|Request failed with status code 404\b|\bHTTP\s*404\b/i,
    reason: AgentFailureReason.MODEL_UNAVAILABLE,
    title: 'Chat model unavailable',
    summary:
      'No provider endpoint for the selected chat model satisfies the required privacy policy.',
    recovery:
      'A superadmin can select another Text default in Admin → Automation → Models, then retry.',
  },
  {
    match: /403|forbidden/i,
    reason: AgentFailureReason.PROVIDER_ACCESS_DENIED,
    title: 'Provider access denied',
    summary: 'The model provider blocked this request.',
    recovery: 'Check model availability and account permissions, then retry.',
  },
  {
    // Anchor 5xx codes the same way — "512 tokens" / "status code 5120" must not match.
    match:
      /status code 5\d{2}\b|\bHTTP\s*5\d{2}\b|server error|bad gateway|service unavailable/i,
    reason: AgentFailureReason.PROVIDER_UNAVAILABLE,
    title: 'Provider temporarily unavailable',
    summary: 'The model provider returned a server error.',
    recovery:
      'Retry in a moment. If it keeps failing, try Auto or another model.',
    isRetryable: true,
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

function parseStructuredError(
  raw: string | AgentErrorDescriptor | null | undefined,
): AgentErrorDescriptor | undefined {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.startsWith(STRUCTURED_ERROR_PREFIX)) {
    return undefined;
  }
  try {
    return JSON.parse(
      raw.slice(STRUCTURED_ERROR_PREFIX.length),
    ) as AgentErrorDescriptor;
  } catch {
    return undefined;
  }
}

export function serializeAgentError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return error instanceof Error ? error.message : String(error);
  }
  const descriptor: AgentErrorDescriptor = {
    detail:
      typeof (error as { detail?: unknown }).detail === 'string'
        ? (error as { detail: string }).detail
        : undefined,
    message:
      error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : undefined,
    source: (error as AgentErrorDescriptor).source,
    status:
      typeof (error as { status?: unknown }).status === 'number'
        ? (error as { status: number }).status
        : undefined,
  };
  return `${STRUCTURED_ERROR_PREFIX}${JSON.stringify(descriptor)}`;
}

export function formatAgentError(
  raw: string | AgentErrorDescriptor | null | undefined,
): FormattedAgentError {
  const structured = parseStructuredError(raw);
  if (structured?.source) {
    const source = structured.source;
    if (source === 'acknowledgement') {
      return {
        detail: null,
        isConfigurationError: false,
        isRetryable: true,
        recovery:
          'Retry the message. The same request identity prevents a duplicate run.',
        summary:
          'The agent service did not acknowledge the turn before the request deadline.',
        reason: AgentFailureReason.TIMEOUT,
        title: 'Turn acknowledgement timed out',
      };
    }
    if (source === 'stream_recovery') {
      return {
        detail: null,
        isConfigurationError: false,
        isRetryable: true,
        recovery:
          'Refresh the conversation to reconcile the run, then retry if it did not finish.',
        summary: 'The run took too long to confirm over the live stream.',
        reason: AgentFailureReason.TIMEOUT,
        title: 'Run timed out',
      };
    }
    if (
      source === 'provider' &&
      (structured.status === 408 ||
        structured.status === 429 ||
        (structured.status !== undefined && structured.status >= 500))
    ) {
      return {
        detail: null,
        isConfigurationError: false,
        isRetryable: true,
        recovery: 'Retry in a moment or choose another available model.',
        summary:
          'The generation provider did not complete the request in time.',
        reason:
          structured.status === 429
            ? AgentFailureReason.RATE_LIMITED
            : structured.status === 408
              ? AgentFailureReason.TIMEOUT
              : AgentFailureReason.PROVIDER_UNAVAILABLE,
        title: 'Provider temporarily unavailable',
      };
    }
    if (source === 'network' || structured.status === 0) {
      return {
        detail: null,
        isConfigurationError: false,
        isRetryable: true,
        recovery: 'Check your connection, then retry the message.',
        summary:
          'The connection to the agent service was interrupted before it could respond.',
        reason: AgentFailureReason.CONNECTION_INTERRUPTED,
        title: 'Connection interrupted',
      };
    }
  }

  const original = structured
    ? (
        structured.detail ??
        structured.message ??
        (structured.status ? `HTTP ${structured.status}` : '')
      ).trim()
    : typeof raw === 'string'
      ? raw.trim()
      : '';

  if (!original) {
    return {
      detail: null,
      isConfigurationError: false,
      isRetryable: false,
      recovery:
        'Copy the error details and inspect the failing step before trying again.',
      summary: 'The agent run did not finish.',
      reason: AgentFailureReason.UNKNOWN,
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
        reason: pattern.reason,
        isConfigurationError: pattern.isConfigurationError !== false,
        isRetryable: pattern.isRetryable === true,
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
      isRetryable: false,
      recovery:
        'Copy the error details and inspect the response before trying again.',
      summary: `The model request failed (HTTP ${code}).`,
      reason:
        code === '401'
          ? AgentFailureReason.PROVIDER_AUTHENTICATION
          : AgentFailureReason.UNKNOWN,
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
    isRetryable: false,
    recovery:
      'Copy the error details and inspect the failing step before trying again.',
    summary: 'The agent hit an error while running.',
    reason: AgentFailureReason.UNKNOWN,
    title: 'Run failed',
  };
}

/** Single-line detail safe for timeline step rows. */
export function formatAgentErrorDetail(
  raw: string | AgentErrorDescriptor | null | undefined,
): string | null {
  const formatted = formatAgentError(raw);
  if (formatted.detail) {
    return formatted.detail;
  }
  return formatted.summary;
}

/** Safe shared copy for external transports; raw detail stays out of messages. */
export function formatAgentFailureMessage(
  raw: string | AgentErrorDescriptor | null | undefined,
): string {
  const { title, summary, recovery } = formatAgentError(raw);
  return [title, summary, recovery].filter(Boolean).join('\n');
}
