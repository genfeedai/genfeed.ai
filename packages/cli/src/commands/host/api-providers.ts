import type { NativeHostProviderId } from '@genfeedai/contracts/api-types/contracts/native-host.contract';
import type { ApiProviderConfig } from './config';
import { HostFailure } from './failure';

const MAX_OUTPUT_TOKENS = 4_096;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

interface ApiRequest {
  body: unknown;
  headers: Record<string, string>;
  url: string;
}

function buildRequest(
  providerId: NativeHostProviderId,
  config: ApiProviderConfig,
  prompt: string
): ApiRequest {
  switch (providerId) {
    case 'openai-api':
      return {
        body: {
          max_completion_tokens: MAX_OUTPUT_TOKENS,
          messages: [{ content: prompt, role: 'user' }],
          model: config.model,
        },
        headers: { authorization: `Bearer ${config.apiKey}` },
        url: 'https://api.openai.com/v1/chat/completions',
      };
    case 'anthropic-api':
      return {
        body: {
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: [{ content: prompt, role: 'user' }],
          model: config.model,
        },
        headers: { 'anthropic-version': '2023-06-01', 'x-api-key': config.apiKey },
        url: 'https://api.anthropic.com/v1/messages',
      };
    case 'gemini-api':
      return {
        body: { contents: [{ parts: [{ text: prompt }], role: 'user' }] },
        headers: { 'x-goog-api-key': config.apiKey },
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      };
    default:
      throw new HostFailure('provider_unavailable', 'This provider is not an API provider.');
  }
}

function readText(providerId: NativeHostProviderId, payload: unknown): string {
  const record = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  if (providerId === 'openai-api') {
    const choices = record.choices as Array<{ message?: { content?: unknown } }> | undefined;
    const content = choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  }
  if (providerId === 'anthropic-api') {
    const blocks = record.content as Array<{ text?: unknown; type?: unknown }> | undefined;
    return (blocks ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('');
  }
  const candidates = record.candidates as
    | Array<{ content?: { parts?: Array<{ text?: unknown }> } }>
    | undefined;
  return (candidates?.[0]?.content?.parts ?? [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('');
}

function statusFailure(status: number): HostFailure {
  if (status === 401 || status === 403) {
    return new HostFailure('provider_failed', 'The provider rejected the saved API key.');
  }
  if (status === 429) {
    return new HostFailure('provider_failed', 'The provider rate limit or quota was reached.');
  }
  return new HostFailure('provider_failed', `The provider answered with HTTP ${status}.`);
}

/** One bring-your-own-key generation. The key is sent to the provider only, never returned. */
export async function runApiProvider(options: {
  abortSignal?: AbortSignal;
  config: ApiProviderConfig;
  fetchImpl: FetchLike;
  prompt: string;
  providerId: NativeHostProviderId;
  timeoutMs: number;
}): Promise<string> {
  const request = buildRequest(options.providerId, options.config, options.prompt);
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.abortSignal ? AbortSignal.any([options.abortSignal, timeout]) : timeout;
  let response: Response;
  try {
    response = await options.fetchImpl(request.url, {
      body: JSON.stringify(request.body),
      headers: { 'content-type': 'application/json', ...request.headers },
      method: 'POST',
      signal,
    });
  } catch {
    if (timeout.aborted) {
      throw new HostFailure('provider_timeout', 'The provider took too long to answer.');
    }
    throw new HostFailure('provider_failed', 'The provider could not be reached.');
  }
  if (!response.ok) throw statusFailure(response.status);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HostFailure('provider_failed', 'The provider returned an unreadable answer.');
  }
  const text = readText(options.providerId, payload).trim();
  if (!text) throw new HostFailure('provider_failed', 'The provider returned nothing.');
  return text;
}
