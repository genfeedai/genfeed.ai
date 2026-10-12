/** Chrome native messaging host name; also the manifest file name stem. */
export const NATIVE_HOST_NAME = 'ai.genfeed.host';

/** Version every host message carries; a host rejects any other. */
export const NATIVE_HOST_PROTOCOL_VERSION = 1;

/** Largest message the host reads from the browser, in bytes. */
export const NATIVE_HOST_MAX_REQUEST_BYTES = 262_144;

/** Largest message the host writes; Chrome refuses anything over 1 MiB. */
export const NATIVE_HOST_MAX_RESPONSE_BYTES = 1_000_000;

/** Longest a single local generation may run before the host stops it, in milliseconds. */
export const NATIVE_HOST_GENERATION_TIMEOUT_MS = 90_000;

/** Local AI CLIs and bring-your-own-key providers a host can run. */
export const NATIVE_HOST_PROVIDER_IDS = [
  'claude-cli',
  'codex-cli',
  'gemini-cli',
  'openai-api',
  'anthropic-api',
  'gemini-api',
] as const;

export type NativeHostProviderIdValue =
  (typeof NATIVE_HOST_PROVIDER_IDS)[number];

/** What a person sees for each provider, in the extension and in the CLI. */
export const NATIVE_HOST_PROVIDER_LABELS: Readonly<
  Record<NativeHostProviderIdValue, string>
> = {
  'anthropic-api': 'Anthropic API key',
  'claude-cli': 'Claude Code',
  'codex-cli': 'Codex CLI',
  'gemini-api': 'Gemini API key',
  'gemini-cli': 'Gemini CLI',
  'openai-api': 'OpenAI API key',
};

export function isNativeHostProviderId(
  value: unknown,
): value is NativeHostProviderIdValue {
  return (NATIVE_HOST_PROVIDER_IDS as readonly unknown[]).includes(value);
}

/** Stable reasons a host stops a request; the message is safe to show a user. */
export const NATIVE_HOST_FAILURE_CODES = [
  'invalid_request',
  'unsupported_version',
  'origin_not_allowed',
  'provider_not_configured',
  'provider_unavailable',
  'provider_failed',
  'provider_timeout',
  'output_rejected',
  'unsupported_platform',
  'internal_error',
] as const;

/** Bounds on the brand voice the extension hands the host. */
export const NATIVE_HOST_VOICE_LIMITS = {
  examples: 8,
  examplesChars: 600,
  identityChars: 1_000,
  listItemChars: 400,
  listItems: 12,
  nameChars: 200,
  ruleItems: 16,
  sampleChars: 1_500,
  guidelinesChars: 3_000,
} as const;
