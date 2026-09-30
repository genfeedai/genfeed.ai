import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import type {
  ModelBillablePricingProfile,
  ProviderQuoteDimensions,
} from '@genfeedai/contracts/interfaces';

export interface WorkflowMediaInputProjection {
  inputKeys: string[];
  inputFingerprint: string;
  dimensions: ProviderQuoteDimensions;
}
function unavailable(detail: string): never {
  throw new BusinessLogicException(detail);
}
function assertJson(value: unknown, active = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      unavailable('Workflow provider input has an ambiguous numeric value');
    return;
  }
  if (typeof value !== 'object')
    unavailable('Workflow provider input is not canonical JSON');
  if (active.has(value))
    unavailable('Workflow provider input contains a cycle');
  const prototype = Object.getPrototypeOf(value);
  if (
    Array.isArray(value)
      ? prototype !== Array.prototype
      : ![Object.prototype, null].includes(prototype)
  )
    unavailable('Workflow provider input contains an unsupported object');
  let serializationOwner: object | null = value;
  while (serializationOwner !== null) {
    const hook = Object.getOwnPropertyDescriptor(serializationOwner, 'toJSON');
    if (
      hook &&
      (!Object.hasOwn(hook, 'value') || typeof hook.value === 'function')
    )
      unavailable('Workflow provider input contains a serialization hook');
    serializationOwner = Object.getPrototypeOf(serializationOwner);
  }
  active.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string')
      unavailable('Workflow provider input contains a symbol key');
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      unavailable('Workflow provider input contains an unsupported property');
    if (
      Array.isArray(value) &&
      (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)
    )
      unavailable('Workflow provider input has non-JSON array properties');
    assertJson(descriptor.value, active);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++)
      if (!Object.hasOwn(value, index))
        unavailable('Workflow provider input contains a sparse array');
  }
  active.delete(value);
}
/** Strict own-property JSON validation for server-owned immutable billing snapshots. */
export function assertWorkflowCanonicalJson(value: unknown): void {
  assertJson(value);
}

function dimension(value: unknown, key: string, integer = false): number {
  const number =
    typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)
      ? Number(value)
      : value;
  if (
    typeof number !== 'number' ||
    !Number.isFinite(number) ||
    number <= 0 ||
    (integer && !Number.isSafeInteger(number))
  )
    unavailable(`Workflow final provider ${key} is unresolved`);
  return number;
}

/** Validate the actual transmitted object, never a node/default/duration estimate. */
export function projectWorkflowMediaProviderInput(
  input: Readonly<Record<string, unknown>>,
): WorkflowMediaInputProjection {
  assertJson(input);
  if (Array.isArray(input) || input === null || typeof input !== 'object')
    unavailable('Workflow provider input must be a JSON object');
  const dimensions: ProviderQuoteDimensions = {};
  const duration = Object.hasOwn(input, 'duration')
    ? dimension(input.duration, 'duration')
    : undefined;
  const seconds = Object.hasOwn(input, 'seconds')
    ? dimension(input.seconds, 'seconds')
    : undefined;
  if (duration !== undefined && seconds !== undefined && duration !== seconds)
    unavailable('Workflow final duration and seconds disagree');
  if (duration !== undefined || seconds !== undefined)
    dimensions.duration = duration ?? seconds;
  for (const key of ['width', 'height'] as const)
    if (Object.hasOwn(input, key))
      dimensions[key] = dimension(input[key], key, true);
  if (
    Object.hasOwn(input, 'audio') &&
    Object.hasOwn(input, 'generate_audio') &&
    input.audio !== input.generate_audio
  )
    unavailable('Workflow final audio selectors disagree');
  return {
    inputKeys: Object.keys(input).sort(),
    inputFingerprint: quoteSnapshotHash(input),
    dimensions,
  };
}

/** Only units with a reviewed final-input evidence adapter are supported by this slice. */
export function assertWorkflowMediaPricingUnits(
  profile: ModelBillablePricingProfile,
  quantities: ProviderQuoteDimensions,
): void {
  const selected = profile.reviewedPricing?.rates.filter((rate) =>
    Object.entries(rate.when).every(
      ([key, value]) => quantities.selectors?.[key] === value,
    ),
  );
  const legacyUnit =
    profile.pricingType === 'per-second'
      ? 'second'
      : profile.pricingType === 'per-megapixel'
        ? 'megapixel'
        : [null, 'flat', 'per-request'].includes(profile.pricingType)
          ? 'request'
          : 'unsupported';
  const units = selected ? selected.map((rate) => rate.unit) : [legacyUnit];
  if (
    units.length === 0 ||
    units.some(
      (unit) => !['request', 'output', 'second', 'megapixel'].includes(unit),
    )
  )
    unavailable(
      'Workflow provider pricing unit lacks a final-input evidence adapter',
    );
  if (units.includes('second') && quantities.duration === undefined)
    unavailable('Workflow final provider duration is required');
  if (
    units.includes('megapixel') &&
    (quantities.width === undefined || quantities.height === undefined)
  )
    unavailable('Workflow final provider dimensions are required');
}
