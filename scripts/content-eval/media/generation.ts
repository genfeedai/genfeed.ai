import type { MediaContestant, Medium } from './contracts';

/**
 * Generation goes through the product API (`POST /images`, `POST /videos`)
 * with an eval-organization API key, so CreditsGuard, brand resolution, the
 * harness, generation-brief compilation, retention and the credit ledger all
 * run exactly as for a customer. The runner never calls a provider URL.
 *
 * Raw route: prompt enhancement off (`harness: false`) and fidelity `off`, so
 * the product dispatches the task prompt as written. Compiled route: harness
 * on, fidelity guided/strict, so the product compiles the brief for the model.
 */

export interface MediaGenerationRequest {
  medium: Medium;
  contestant: MediaContestant;
  prompt: string;
  brandId: string;
  seed: number | null;
  width: number;
  height: number;
  durationSeconds: number | null;
  referenceIngredientIds: readonly string[];
  /** Visual direction (`style`); null sends none. */
  style: string | null;
  /** Task override of the compiled route's fidelity. */
  compiledFidelity: 'off' | 'guided' | 'strict' | null;
}

export type MediaGenerationStatus = 'generated' | 'failed' | 'refused';

export interface MediaGenerationResult {
  status: MediaGenerationStatus;
  ingredientId: string | null;
  /** URL the judges fetch. May be signed; never written to a public record. */
  fetchUrl: string | null;
  creditsCharged: number;
  costEvidence: 'reported' | 'estimated';
  latencyMs: number;
  error: string | null;
  /** Exactly what was sent, minus the brand id; stored as answer settings. */
  settings: Record<string, string | number | boolean>;
}

export interface MediaGenerationPort {
  generate(
    request: MediaGenerationRequest,
    signal: AbortSignal,
  ): Promise<MediaGenerationResult>;
}

export interface ProductApiClientOptions {
  apiUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface JsonApiResource {
  id?: string;
  attributes?: Record<string, unknown>;
}

interface JsonApiDocument {
  data?: JsonApiResource;
}

const SUCCESS_STATUSES = new Set(['GENERATED', 'UPLOADED', 'VALIDATED']);

/** Status text that means the provider refused rather than failed. */
const REFUSAL_PATTERN = /(safety|moderation|nsfw|content policy|refus)/i;

export function buildGenerationBody(
  request: MediaGenerationRequest,
): Record<string, string | number | boolean | string[]> {
  const isCompiled = request.contestant.route.kind === 'compiled';
  const fidelityMode =
    request.contestant.route.kind === 'compiled'
      ? (request.compiledFidelity ?? request.contestant.route.fidelityMode)
      : 'off';
  const body: Record<string, string | number | boolean | string[]> = {
    brandId: request.brandId,
    fidelityMode,
    harness: isCompiled,
    height: request.height,
    isBrandingEnabled: isCompiled,
    model: request.contestant.registryKey,
    outputs: 1,
    text: request.prompt,
    waitForCompletion: true,
    width: request.width,
  };
  if (request.seed !== null) body.seed = request.seed;
  if (request.style !== null) body.style = request.style;
  if (request.durationSeconds !== null) {
    body.duration = request.durationSeconds;
  }
  if (request.referenceIngredientIds.length > 0) {
    body.references = [...request.referenceIngredientIds];
  }
  return body;
}

export function settingsFromBody(
  body: Record<string, string | number | boolean | string[]>,
): Record<string, string | number | boolean> {
  const settings: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'brandId' || key === 'text') continue;
    settings[key] = Array.isArray(value) ? value.join(',') : value;
  }
  return settings;
}

export class ProductApiMediaGeneration implements MediaGenerationPort {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: ProductApiClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async generate(
    request: MediaGenerationRequest,
    signal: AbortSignal,
  ): Promise<MediaGenerationResult> {
    const body = buildGenerationBody(request);
    const settings = settingsFromBody(body);
    const balanceBefore = await this.readBalance(signal);
    const startedAt = this.now();
    const path = request.medium === 'image' ? '/images' : '/videos';

    let document: JsonApiDocument | null = null;
    let error: string | null = null;
    try {
      const response = await this.fetchImpl(this.url(path), {
        body: JSON.stringify(body),
        headers: this.headers(),
        method: 'POST',
        signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        error = `HTTP ${response.status}: ${readErrorMessage(payload)}`;
      } else {
        document = payload as JsonApiDocument;
      }
    } catch (caught: unknown) {
      if (signal.aborted) throw caught;
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const latencyMs = Math.max(0, Math.round(this.now() - startedAt));

    const balanceAfter = await this.readBalance(signal);
    const reported =
      balanceBefore !== null && balanceAfter !== null
        ? Math.max(0, balanceBefore - balanceAfter)
        : null;
    const credits = {
      costEvidence:
        reported === null ? ('estimated' as const) : ('reported' as const),
      creditsCharged:
        reported ?? (error === null ? request.contestant.creditsPerOutput : 0),
    };

    const attributes = document?.data?.attributes ?? {};
    const status =
      typeof attributes.status === 'string' ? attributes.status : '';
    const generationError =
      typeof attributes.generationError === 'string'
        ? attributes.generationError
        : typeof attributes.error === 'string'
          ? attributes.error
          : null;
    const fetchUrl =
      typeof attributes.url === 'string'
        ? attributes.url
        : typeof attributes.cdnUrl === 'string'
          ? attributes.cdnUrl
          : null;

    if (error === null && SUCCESS_STATUSES.has(status) && fetchUrl) {
      return {
        ...credits,
        error: null,
        fetchUrl,
        ingredientId: document?.data?.id ?? null,
        latencyMs,
        settings,
        status: 'generated',
      };
    }

    const detail =
      error ?? generationError ?? `ingredient status "${status || 'unknown'}"`;
    return {
      ...credits,
      error: detail,
      fetchUrl: null,
      ingredientId: document?.data?.id ?? null,
      latencyMs,
      settings,
      status: REFUSAL_PATTERN.test(detail) ? 'refused' : 'failed',
    };
  }

  private async readBalance(signal: AbortSignal): Promise<number | null> {
    try {
      const response = await this.fetchImpl(this.url('/credits/usage'), {
        headers: this.headers(),
        method: 'GET',
        signal,
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as JsonApiDocument;
      const balance = payload.data?.attributes?.currentBalance;
      return typeof balance === 'number' ? balance : null;
    } catch {
      if (signal.aborted) throw signal.reason;
      return null;
    }
  }

  private url(path: string): string {
    return `${this.options.apiUrl.replace(/\/+$/, '')}${path}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.options.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
}

function readErrorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['detail', 'message', 'title', 'error']) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }
  }
  return 'request failed';
}
