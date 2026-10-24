import { ByokProvider, ModelProvider } from '@genfeedai/contracts';

/**
 * How one BYOK credential is reached from a model. This is the only place a
 * model route is tied to a credential: add a provider here, not in a second
 * map, or an org's own key is silently ignored and the platform key is spent.
 */
export interface ByokModelRoute {
  byokProvider: ByokProvider;
  /** Catalog `ModelProvider` whose rows use this credential. */
  modelProvider?: ModelProvider;
  /** `modelKey` prefixes that use this credential when the catalog row names no direct provider. */
  modelKeyPrefixes?: readonly string[];
  /**
   * `modelKey` prefixes that win over the catalog provider. A catalog row that
   * still says Replicate must not steal the org's Higgsfield or HeyGen key.
   */
  authoritativeModelKeyPrefixes?: readonly string[];
}

// #5294 GENFEED_AI is intentionally absent from every route: those models
// dispatch through Genfeed's own hosted fleet (ComfyUI/Replicate deployments
// the org does not own), never through a caller-supplied key. Mapping it to
// REPLICATE let an org's own Replicate BYOK key bypass credits for hosted
// generation that still ran, and was paid for, on Genfeed's platform key.
export const BYOK_MODEL_ROUTES: readonly ByokModelRoute[] = [
  {
    byokProvider: ByokProvider.REPLICATE,
    modelProvider: ModelProvider.REPLICATE,
  },
  {
    byokProvider: ByokProvider.FAL,
    modelKeyPrefixes: ['fal-ai/'],
    modelProvider: ModelProvider.FAL,
  },
  {
    byokProvider: ByokProvider.CRUN,
    modelKeyPrefixes: ['crun/'],
    modelProvider: ModelProvider.CRUN,
  },
  {
    byokProvider: ByokProvider.OPENROUTER,
    modelKeyPrefixes: ['x-ai/'],
    modelProvider: ModelProvider.OPENROUTER,
  },
  {
    byokProvider: ByokProvider.OPENAI,
    modelKeyPrefixes: ['openai/'],
    modelProvider: ModelProvider.OPENAI,
  },
  { byokProvider: ByokProvider.ANTHROPIC, modelKeyPrefixes: ['anthropic/'] },
  { byokProvider: ByokProvider.GOOGLE, modelProvider: ModelProvider.GOOGLE },
  { byokProvider: ByokProvider.XAI, modelProvider: ModelProvider.XAI },
  { byokProvider: ByokProvider.BFL, modelProvider: ModelProvider.BFL },
  { byokProvider: ByokProvider.RUNWAY, modelProvider: ModelProvider.RUNWAY },
  { byokProvider: ByokProvider.ARGIL, modelKeyPrefixes: ['argil/'] },
  { byokProvider: ByokProvider.HEDRA, modelKeyPrefixes: ['hedra'] },
  { byokProvider: ByokProvider.KLINGAI, modelKeyPrefixes: ['klingai'] },
  { byokProvider: ByokProvider.LEONARDOAI, modelKeyPrefixes: ['leonardoai'] },
  {
    authoritativeModelKeyPrefixes: ['heygen/'],
    byokProvider: ByokProvider.HEYGEN,
  },
  {
    authoritativeModelKeyPrefixes: ['higgsfield-ai/', 'higgsfield/'],
    byokProvider: ByokProvider.HIGGSFIELD,
  },
];

/** BYOK credentials that no model route uses, with the reason. */
export const BYOK_PROVIDERS_WITHOUT_MODEL_ROUTE: Readonly<
  Partial<Record<ByokProvider, string>>
> = {
  [ByokProvider.APIFY]:
    'Data ingestion token for social scrapers, not a generation model.',
  [ByokProvider.ELEVENLABS]:
    'Resolved through ApiKeyHelperService (ApiKeyCategory), not a model route.',
};

/** Catalog providers that never resolve to a BYOK credential, with the reason. */
export const MODEL_PROVIDERS_WITHOUT_BYOK: Readonly<
  Partial<Record<ModelProvider, string>>
> = {
  [ModelProvider.GENFEED_AI]:
    'Genfeed-hosted fleet; never runs on a caller-supplied key (#5294).',
  [ModelProvider.MUREKA]: 'Platform key only; Mureka has no BYOK credential.',
  [ModelProvider.HEYGEN]:
    'Resolved by the authoritative heygen/ model-key prefix.',
  [ModelProvider.HIGGSFIELD]:
    'Resolved by the authoritative higgsfield/ model-key prefixes.',
  [ModelProvider.ELEVENLABS]:
    'Resolved through ApiKeyHelperService (ApiKeyCategory), not a model route.',
};

const MODEL_PROVIDER_TO_BYOK = new Map<string, ByokProvider>(
  BYOK_MODEL_ROUTES.flatMap((route) =>
    route.modelProvider ? [[route.modelProvider, route.byokProvider]] : [],
  ),
);

const AUTHORITATIVE_MODEL_KEY_PREFIX_TO_BYOK: ReadonlyArray<
  [string, ByokProvider]
> = BYOK_MODEL_ROUTES.flatMap((route) =>
  (route.authoritativeModelKeyPrefixes ?? []).map(
    (prefix): [string, ByokProvider] => [prefix, route.byokProvider],
  ),
);

/** Every prefix a route claims; none may be a prefix of another provider's. */
const MODEL_KEY_PREFIX_TO_BYOK: ReadonlyArray<[string, ByokProvider]> = [
  ...BYOK_MODEL_ROUTES.flatMap((route) =>
    (route.modelKeyPrefixes ?? []).map((prefix): [string, ByokProvider] => [
      prefix,
      route.byokProvider,
    ]),
  ),
  ...AUTHORITATIVE_MODEL_KEY_PREFIX_TO_BYOK,
];

/**
 * Map ModelProvider enum → ByokProvider.
 * Used when a model document has a `provider` field.
 */
export function modelProviderToByokProvider(
  modelProvider: string,
): ByokProvider | undefined {
  return MODEL_PROVIDER_TO_BYOK.get(modelProvider);
}

/**
 * Resolve ByokProvider from a modelKey string (e.g. "heygen/avatar" → HEYGEN).
 * Falls back to undefined if no prefix matches.
 */
export function modelKeyToByokProvider(
  modelKey: string,
): ByokProvider | undefined {
  for (const [prefix, provider] of MODEL_KEY_PREFIX_TO_BYOK) {
    if (modelKey.startsWith(prefix)) {
      return provider;
    }
  }
  return undefined;
}

/**
 * Resolve the credential provider used by a concrete model route.
 *
 * Dedicated Higgsfield and HeyGen routes are authoritative. A catalog row
 * that still says Replicate must not steal the org's Higgsfield or HeyGen
 * key. Other routes preserve catalog precedence so proxied keys such as
 * `anthropic/*` through OpenRouter do not get mistaken for direct-provider
 * BYOK.
 */
export function resolveModelByokProvider(
  modelKey?: string,
  modelProvider?: string,
): ByokProvider | undefined {
  const authoritativeProvider = modelKey
    ? AUTHORITATIVE_MODEL_KEY_PREFIX_TO_BYOK.find(([prefix]) =>
        modelKey.startsWith(prefix),
      )?.[1]
    : undefined;

  return (
    authoritativeProvider ??
    (modelProvider ? modelProviderToByokProvider(modelProvider) : undefined) ??
    (modelKey ? modelKeyToByokProvider(modelKey) : undefined)
  );
}
