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

/**
 * Resolves a reference-role ingredient id (a pre-existing eval-org asset
 * supplied via `--references`) to a fetchable image URL, so the judge can be
 * shown the same product shot / character sheet / style frame the generation
 * request cited — never just the generated outputs.
 */
export interface MediaReferencePort {
  resolveUrl(ingredientId: string, signal: AbortSignal): Promise<string>;
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

/**
 * Non-terminal `IngredientStatus` values. Some providers (Fal's image/video
 * adapters are `completionKind: 'background-only'`) never honour
 * `waitForCompletion: true`: the initial response lands with the ingredient
 * still `DRAFT`/`PROCESSING`, so a caller that reads it once would record a
 * paid, still-running generation as an immediate failure.
 */
const PENDING_STATUSES = new Set(['DRAFT', 'PROCESSING']);

/** Status text that means the provider refused rather than failed. */
const REFUSAL_PATTERN = /(safety|moderation|nsfw|content policy|refus)/i;

/**
 * Poll cadence per medium, mirroring the server's own completion polling
 * (`IngredientCompletionService`, `apps/server/api/.../image-generation.service.ts`
 * and `.../video-generation-completion.service.ts`): images settle faster
 * than video, so video gets a longer interval and ceiling.
 */
const PENDING_POLL: Record<Medium, { intervalMs: number; timeoutMs: number }> =
  {
    image: { intervalMs: 2_000, timeoutMs: 180_000 },
    video: { intervalMs: 5_000, timeoutMs: 600_000 },
  };

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

interface GenerationAttributes {
  status: string;
  generationError: string | null;
  fetchUrl: string | null;
}

function readGenerationAttributes(
  document: JsonApiDocument | null,
): GenerationAttributes {
  const attributes = document?.data?.attributes ?? {};
  return {
    fetchUrl:
      typeof attributes.url === 'string'
        ? attributes.url
        : typeof attributes.cdnUrl === 'string'
          ? attributes.cdnUrl
          : null,
    generationError:
      typeof attributes.generationError === 'string'
        ? attributes.generationError
        : typeof attributes.error === 'string'
          ? attributes.error
          : null,
    status: typeof attributes.status === 'string' ? attributes.status : '',
  };
}

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

export class ProductApiMediaGeneration
  implements MediaGenerationPort, MediaReferencePort
{
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: ProductApiClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  /** Reference ids are always image ingredients, whatever medium generates. */
  async resolveUrl(ingredientId: string, signal: AbortSignal): Promise<string> {
    const response = await this.fetchImpl(this.url(`/images/${ingredientId}`), {
      headers: this.headers(),
      method: 'GET',
      signal,
    });
    const payload = (await response
      .json()
      .catch(() => null)) as JsonApiDocument | null;
    if (!response.ok) {
      throw new Error(
        `reference ingredient ${ingredientId} could not be read: HTTP ${response.status}: ${readErrorMessage(payload)}`,
      );
    }
    const attributes = payload?.data?.attributes ?? {};
    const url =
      typeof attributes.url === 'string'
        ? attributes.url
        : typeof attributes.cdnUrl === 'string'
          ? attributes.cdnUrl
          : null;
    if (!url) {
      throw new Error(
        `reference ingredient ${ingredientId} has no fetchable url`,
      );
    }
    return url;
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

    let hasTimedOutPending = false;
    let pollTimeoutMs = 0;
    if (error === null && document?.data?.id) {
      const ingredientId = document.data.id;
      if (PENDING_STATUSES.has(readGenerationAttributes(document).status)) {
        const cadence = PENDING_POLL[request.medium];
        pollTimeoutMs = cadence.timeoutMs;
        const polled = await this.pollUntilTerminal(
          path,
          ingredientId,
          cadence,
          signal,
        );
        document = polled.document ?? document;
        hasTimedOutPending = polled.hasTimedOut;
      }
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

    const { fetchUrl, generationError, status } =
      readGenerationAttributes(document);

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
      error ??
      generationError ??
      (hasTimedOutPending
        ? `generation still "${status}" after polling ${pollTimeoutMs}ms`
        : `ingredient status "${status || 'unknown'}"`);
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

  /**
   * Polls a background-only provider's ingredient (Fal never resolves
   * `waitForCompletion` synchronously) until it leaves `PENDING_STATUSES` or
   * the timeout elapses.
   */
  private async pollUntilTerminal(
    path: string,
    ingredientId: string,
    cadence: { intervalMs: number; timeoutMs: number },
    signal: AbortSignal,
  ): Promise<{ document: JsonApiDocument | null; hasTimedOut: boolean }> {
    const deadline = this.now() + cadence.timeoutMs;
    let document: JsonApiDocument | null = null;
    while (this.now() < deadline) {
      await delay(cadence.intervalMs, signal);
      let response: Response;
      try {
        response = await this.fetchImpl(this.url(`${path}/${ingredientId}`), {
          headers: this.headers(),
          method: 'GET',
          signal,
        });
      } catch (caught: unknown) {
        if (signal.aborted) throw caught;
        // Transient network error reading a still-running, already-paid
        // generation: retry within the deadline rather than losing it —
        // callers must still record whatever the generation ends up costing.
        continue;
      }
      if (!response.ok) continue;
      document = (await response
        .json()
        .catch(() => null)) as JsonApiDocument | null;
      if (!PENDING_STATUSES.has(readGenerationAttributes(document).status)) {
        return { document, hasTimedOut: false };
      }
    }
    return { document, hasTimedOut: true };
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
