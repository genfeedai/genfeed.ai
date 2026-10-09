import { setTimeout as delay } from 'node:timers/promises';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { UNIFIED_MODEL_CATALOG } from '@genfeedai/contracts/constants';
import {
  extractReplicateBillingTiers,
  REVIEWED_RATE_SHEET_ENTRIES,
} from '@genfeedai/pricing';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type {
  IFalModel,
  IReplicateModel,
} from '@workers/interfaces/model-discovery.interface';
import {
  type FalCandidateContract,
  prepareFalModelContract,
} from '@workers/services/fal-model-contract.util';
import {
  prepareReplicateModelContract,
  type ReplicateCandidateContract,
} from '@workers/services/replicate-model-contract.util';

export interface ProviderModelImportTarget {
  category: ModelCategory;
  endpoint: string;
  provider: ModelProvider.REPLICATE | ModelProvider.FAL;
}

const replicateCandidates: readonly [string, ModelCategory][] = [
  // Official provider catalog verified 2026-10-09. Include reviewed entries so
  // an explicit import can refresh the complete family without changing approval.
  ...[
    '1-lite',
    '1-pro',
    '1-pro-fast',
    '1.5-pro',
    '2.0',
    '2.0-fast',
    '2.0-mini',
    '2.5',
  ].map((version): [string, ModelCategory] => [
    `bytedance/seedance-${version}`,
    ModelCategory.VIDEO,
  ]),
  ['alibaba/wan-3', ModelCategory.VIDEO],
  ['alibaba/qwen-image-3', ModelCategory.IMAGE],
  ['alibaba/qwen-image-3-pro', ModelCategory.IMAGE],
  ['xai/grok-imagine-image-2', ModelCategory.IMAGE],
  ['xai/grok-imagine-video-1.5', ModelCategory.VIDEO],
  ['black-forest-labs/flux-3', ModelCategory.VIDEO],
  ['google/gemini-omni-1.1', ModelCategory.VIDEO],
  ['lightricks/ltx-2.5-fast', ModelCategory.VIDEO],
];

const falFamilies: readonly [string, ModelCategory, readonly string[]][] = [
  ...[
    'bytedance/seedance-2.0',
    'bytedance/seedance-2.0/fast',
    'bytedance/seedance-2.0/mini',
    'bytedance/seedance-2.0/us',
    'bytedance/seedance-2.5',
    'bytedance/seedance-2.5/us',
  ].map((family): [string, ModelCategory, readonly string[]] => [
    family,
    ModelCategory.VIDEO,
    ['text-to-video', 'image-to-video', 'reference-to-video'],
  ]),
  ['bytedance/seedance-2.5', ModelCategory.VIDEO_EDIT, ['draft/complete']],
  ...[
    'fal-ai/bytedance/seedance/v1/pro',
    'fal-ai/bytedance/seedance/v1/pro/fast',
    'fal-ai/bytedance/seedance/v1.5/pro',
  ].map((family): [string, ModelCategory, readonly string[]] => [
    family,
    ModelCategory.VIDEO,
    ['text-to-video', 'image-to-video'],
  ]),
  [
    'alibaba/wan-3.0',
    ModelCategory.VIDEO,
    ['text-to-video', 'image-to-video', 'reference-to-video'],
  ],
  ['alibaba/qwen-image-3', ModelCategory.IMAGE, ['text-to-image', 'edit']],
  [
    'xai/grok-imagine-image/v2.0',
    ModelCategory.IMAGE,
    ['text-to-image', 'edit'],
  ],
  [
    'xai/grok-imagine-video/v1.5',
    ModelCategory.VIDEO,
    ['text-to-video', 'image-to-video', 'reference-to-video'],
  ],
  [
    'google/gemini-omni-flash/v1.1',
    ModelCategory.VIDEO,
    ['text-to-video', 'image-to-video', 'reference-to-video', 'edit'],
  ],
  [
    'blackforestlabs/flux-3',
    ModelCategory.VIDEO,
    [
      'text-to-video',
      'image-to-video',
      'first-last-frame-to-video',
      'keyframes-to-video',
      'extend-video',
      'text-to-video/draft',
      'image-to-video/draft',
      'first-last-frame-to-video/draft',
      'keyframes-to-video/draft',
      'extend-video/draft',
      'draft-enhance',
      'edit-video',
    ],
  ],
  [
    'alibaba/happy-horse/v1.1',
    ModelCategory.VIDEO,
    ['text-to-video', 'image-to-video'],
  ],
];

export function providerModelImportTargets(): ProviderModelImportTarget[] {
  const targets: ProviderModelImportTarget[] = replicateCandidates.map(
    ([endpoint, category]) => ({
      category,
      endpoint,
      provider: ModelProvider.REPLICATE,
    }),
  );
  for (const [family, category, tasks] of falFamilies) {
    for (const task of tasks)
      targets.push({
        category:
          task === 'draft-enhance'
            ? ModelCategory.VIDEO_UPSCALE
            : task === 'edit' ||
                task === 'edit-video' ||
                task.startsWith('extend-video')
              ? category === ModelCategory.IMAGE
                ? ModelCategory.IMAGE_EDIT
                : ModelCategory.VIDEO_EDIT
              : category,
        endpoint: `${family}/${task}`,
        provider: ModelProvider.FAL,
      });
  }
  for (const model of UNIFIED_MODEL_CATALOG) {
    if (
      model.provider !== ModelProvider.REPLICATE &&
      model.provider !== ModelProvider.FAL
    )
      continue;
    if (
      ![
        ModelCategory.IMAGE,
        ModelCategory.IMAGE_EDIT,
        ModelCategory.VIDEO,
        ModelCategory.VIDEO_EDIT,
        ModelCategory.IMAGE_UPSCALE,
        ModelCategory.VIDEO_UPSCALE,
        ModelCategory.MUSIC,
        ModelCategory.VOICE,
      ].includes(model.category)
    )
      continue;
    const endpoint = (model.endpoint ?? model.key).split(':')[0] ?? model.key;
    if (
      REVIEWED_RATE_SHEET_ENTRIES.some(
        (entry) =>
          entry.provider === model.provider &&
          [endpoint, model.key].includes(entry.endpoint),
      )
    )
      continue;
    targets.push({
      category: model.category,
      endpoint,
      provider: model.provider,
    });
  }
  return [
    ...new Map(
      targets.map((target) => [
        `${target.provider}:${target.endpoint}`,
        target,
      ]),
    ).values(),
  ];
}

export type ImportedProviderContract =
  | ReplicateCandidateContract
  | FalCandidateContract;

export interface ProviderModelImportObservation
  extends ProviderModelImportTarget {
  contract: ImportedProviderContract;
  description: string;
  label: string;
  providerVersion: string | null;
  sourceUrl: string;
}

async function readJson(
  url: URL | string,
  headers: Record<string, string>,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetcher(url, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (attempt === 2 || (response.status !== 429 && response.status < 500))
      break;
    const retry = Number(response.headers.get('retry-after'));
    await delay(
      Number.isFinite(retry) && retry > 0
        ? Math.min(retry * 1000, 60_000)
        : response.status === 429
          ? 60_000
          : 1000 * 2 ** attempt,
    );
  }
  if (!response) throw new Error('missing_provider_response');
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  const body: unknown = await response.json();
  if (!isRecord(body)) throw new Error('invalid_provider_response');
  return body;
}

export async function collectProviderModel(
  target: ProviderModelImportTarget,
  credentials: { fal?: string; replicate?: string },
  fetcher: typeof fetch = fetch,
  now = new Date(),
  cachedFalModel?: IFalModel,
): Promise<ProviderModelImportObservation> {
  if (target.provider === ModelProvider.REPLICATE) {
    if (!credentials.replicate) throw new Error('missing_replicate_credential');
    if (!/^[\w-]+\/[\w.-]+$/.test(target.endpoint))
      throw new Error('invalid_replicate_endpoint');
    const payload = await readJson(
      `https://api.replicate.com/v1/models/${target.endpoint}`,
      { Authorization: `Bearer ${credentials.replicate}` },
      fetcher,
    );
    if (
      `${payload.owner}/${payload.name}` !== target.endpoint ||
      !isRecord(payload.latest_version) ||
      !isRecord(payload.latest_version.openapi_schema)
    )
      throw new Error('missing_or_mismatched_replicate_schema');
    const model = payload as unknown as IReplicateModel;
    const sourceUrl = `https://replicate.com/${target.endpoint}`;
    const page = await fetcher(sourceUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!page.ok) throw new Error(`pricing_http_${page.status}`);
    const tiers = extractReplicateBillingTiers(await page.text());
    const contract = prepareReplicateModelContract(
      target.endpoint,
      model,
      target.category,
      {
        billing: tiers
          ? { status: 'ok', sourceUrl, tiers }
          : { status: 'unavailable', reason: 'missing_public_billing_config' },
        pricingType: null,
        source: 'reviewed-registry',
        unitPriceUsd: null,
      },
      now,
    );
    return {
      ...target,
      contract,
      description: model.description ?? '',
      label: model.name,
      providerVersion: model.latest_version?.id ?? null,
      sourceUrl,
    };
  }
  const headers: Record<string, string> = credentials.fal
    ? { Authorization: `Key ${credentials.fal}` }
    : {};
  const modelsUrl = new URL('https://api.fal.ai/v1/models');
  modelsUrl.searchParams.append('endpoint_id', target.endpoint);
  modelsUrl.searchParams.set('expand', 'openapi-3.0');
  const body = cachedFalModel
    ? { models: [cachedFalModel] }
    : await readJson(modelsUrl, headers, fetcher);
  const model = Array.isArray(body.models)
    ? (body.models.find(
        (item: unknown) =>
          isRecord(item) && item.endpoint_id === target.endpoint,
      ) as IFalModel | undefined)
    : undefined;
  if (
    !model ||
    !isRecord(model.openapi) ||
    (model.metadata?.status && model.metadata.status !== 'active')
  )
    throw new Error('missing_or_inactive_fal_endpoint');
  const rawPrices: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let page = 0; credentials.fal && page < 100; page++) {
    const url = new URL('https://api.fal.ai/v1/models/pricing');
    url.searchParams.append('endpoint_id', target.endpoint);
    if (cursor) url.searchParams.set('cursor', cursor);
    const pricing = await readJson(url, headers, fetcher);
    if (Array.isArray(pricing.prices))
      rawPrices.push(
        ...pricing.prices.filter(
          (price: unknown): price is Record<string, unknown> =>
            isRecord(price) && price.endpoint_id === target.endpoint,
        ),
      );
    if (!pricing.has_more) break;
    if (
      typeof pricing.next_cursor !== 'string' ||
      pricing.next_cursor === cursor ||
      page === 99
    )
      throw new Error('invalid_fal_pricing_pagination');
    cursor = pricing.next_cursor;
  }
  return {
    ...target,
    contract: prepareFalModelContract(model, rawPrices),
    description: model.metadata?.description ?? '',
    label: model.metadata?.display_name ?? target.endpoint,
    providerVersion: null,
    sourceUrl:
      model.metadata?.model_url ?? `https://fal.ai/models/${target.endpoint}`,
  };
}

function resolvedProperty(
  property: Record<string, unknown>,
  openapi: Record<string, unknown>,
  seen = new Set<string>(),
): Record<string, unknown> {
  let resolved = property;
  const ref = property.$ref;
  if (typeof ref === 'string' && ref.startsWith('#/') && !seen.has(ref)) {
    let value: unknown = openapi;
    for (const segment of ref.slice(2).split('/'))
      value = isRecord(value)
        ? value[segment.replaceAll('~1', '/').replaceAll('~0', '~')]
        : undefined;
    if (isRecord(value))
      resolved = {
        ...resolvedProperty(value, openapi, new Set([...seen, ref])),
        ...property,
      };
  }
  if (Array.isArray(resolved.allOf))
    for (const child of resolved.allOf)
      if (isRecord(child))
        resolved = { ...resolvedProperty(child, openapi, seen), ...resolved };
  const variants = resolved.anyOf ?? resolved.oneOf;
  if (Array.isArray(variants)) {
    const nonNull = variants.filter(
      (child) => isRecord(child) && child.type !== 'null',
    );
    if (nonNull.length === 1 && isRecord(nonNull[0]))
      resolved = {
        ...resolvedProperty(nonNull[0], openapi, seen),
        ...resolved,
      };
  }
  return resolved;
}

/** Batch public schemas to respect fal's unauthenticated rate limits. */
export async function collectFalImportMetadata(
  targets: ProviderModelImportTarget[],
  credential?: string,
  fetcher: typeof fetch = fetch,
): Promise<Map<string, IFalModel>> {
  const endpoints = targets
    .filter((target) => target.provider === ModelProvider.FAL)
    .map((target) => target.endpoint);
  const models = new Map<string, IFalModel>();
  for (let start = 0; start < endpoints.length; start += 10) {
    const batch = endpoints.slice(start, start + 10);
    let cursor: string | null = null;
    for (let page = 0; page < 100; page++) {
      const url = new URL('https://api.fal.ai/v1/models');
      for (const endpoint of batch)
        url.searchParams.append('endpoint_id', endpoint);
      url.searchParams.set('expand', 'openapi-3.0');
      url.searchParams.set('limit', '10');
      if (cursor) url.searchParams.set('cursor', cursor);
      let body: Record<string, unknown>;
      try {
        body = await readJson(
          url,
          credential ? { Authorization: `Key ${credential}` } : {},
          fetcher,
        );
      } catch (error: unknown) {
        // Find mode returns 404 when none of the requested identities exist.
        // Preserve earlier batches and let the report mark these as missing.
        if (error instanceof Error && error.message === 'provider_http_404')
          break;
        throw error;
      }
      if (!Array.isArray(body.models))
        throw new Error('invalid_fal_metadata_response');
      for (const item of body.models)
        if (
          isRecord(item) &&
          typeof item.endpoint_id === 'string' &&
          batch.includes(item.endpoint_id)
        )
          models.set(item.endpoint_id, item as unknown as IFalModel);
      if (!body.has_more) break;
      if (
        typeof body.next_cursor !== 'string' ||
        body.next_cursor === cursor ||
        page === 99
      )
        throw new Error('invalid_fal_metadata_pagination');
      cursor = body.next_cursor;
    }
  }
  return models;
}

export function providerModelCapabilities(
  schema: Record<string, unknown>,
  openapi: Record<string, unknown> = {},
) {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const property = (name: string) =>
    resolvedProperty(
      isRecord(properties[name]) ? properties[name] : {},
      openapi,
    );
  const aspect = property('aspect_ratio');
  const duration = property('duration');
  const count = property('num_images');
  const required = Array.isArray(schema.required) ? schema.required : [];
  const referenceKeys = [
    'image',
    'image_url',
    'images',
    'image_urls',
    'reference_images',
    'reference_image_urls',
    'start_image_url',
    'first_frame_url',
    'first_frame_image',
  ];
  const referenceArray = referenceKeys
    .map(property)
    .find((value) => value.type === 'array');
  const hasEndFrame = [
    'end_image_url',
    'last_frame_image',
    'last_frame',
    'end_image',
    'last_frame_url',
  ].some((key) => key in properties);
  const enumDurations = Array.isArray(duration.enum)
    ? duration.enum
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0)
    : [];
  const durations = enumDurations.length
    ? enumDurations
    : typeof duration.minimum === 'number' &&
        typeof duration.maximum === 'number' &&
        Number.isInteger(duration.minimum) &&
        Number.isInteger(duration.maximum) &&
        duration.minimum > 0 &&
        duration.maximum - duration.minimum <= 60
      ? Array.from(
          { length: duration.maximum - duration.minimum + 1 },
          (_, index) => Number(duration.minimum) + index,
        )
      : [];
  const defaultDuration = Number(duration.default);
  return {
    aspectRatios: Array.isArray(aspect.enum)
      ? aspect.enum.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
    ...(typeof aspect.default === 'string'
      ? { defaultAspectRatio: aspect.default }
      : {}),
    ...(Number.isInteger(defaultDuration) && defaultDuration > 0
      ? { defaultDuration }
      : {}),
    durations,
    hasAudioToggle: ['generate_audio', 'audio'].some(
      (key) => property(key).type === 'boolean',
    ),
    hasDurationEditing: 'duration' in properties,
    hasEndFrame,
    hasInterpolation: hasEndFrame,
    hasResolutionOptions:
      'resolution' in properties || 'image_size' in properties,
    isReferencesMandatory: referenceKeys.some((key) => required.includes(key)),
    ...(typeof referenceArray?.maxItems === 'number'
      ? { maxReferences: referenceArray.maxItems }
      : !referenceArray && referenceKeys.some((key) => key in properties)
        ? { maxReferences: hasEndFrame ? 2 : 1 }
        : {}),
    ...(typeof count.maximum === 'number'
      ? { maxOutputs: count.maximum, isBatchSupported: count.maximum > 1 }
      : {}),
  };
}
