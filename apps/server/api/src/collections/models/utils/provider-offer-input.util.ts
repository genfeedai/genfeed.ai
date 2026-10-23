import type { ModelCreditQuoteInput } from '@api/helpers/utils/credits/model-credit-quote.util';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { z } from 'zod';

const ALIASES = [
  ['audio', 'generate_audio', 'sound'],
  ['duration', 'seconds'],
  ['image', 'image_url', 'start_image', 'start_image_url'],
  ['end_image', 'end_image_url', 'last_frame', 'end_frame'],
  ['images', 'image_urls', 'input_images'],
  ['num_outputs', 'num_images'],
] as const;

/** Refuse an offer rather than silently dropping a feature the user requested. */
export function mapProviderOfferInput(
  schema: unknown,
  request: ModelCreditQuoteInput,
): Record<string, unknown> | null {
  if (!isRecord(schema) || !isRecord(schema.properties)) return null;
  if (schema.$id === 'kie-kling-3.0' && request.providerInput) {
    const native = { ...request.providerInput };
    if (native.mode === 'standard') native.mode = 'std';
    if (typeof native.duration === 'number')
      native.duration = String(native.duration);
    const frames = [native.start_image, native.end_image].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    if (frames.length) native.image_urls = frames;
    delete native.start_image;
    delete native.end_image;
    request = { ...request, providerInput: native };
  }
  const properties = schema.properties;
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(request.providerInput ?? {})) {
    const aliases = ALIASES.find((group) =>
      group.some((field) => field === key),
    );
    const target = Object.hasOwn(properties, key)
      ? key
      : aliases?.find((field) => Object.hasOwn(properties, field));
    if (!target) return null;
    input[target] = value;
  }
  for (const [key, value] of Object.entries({
    duration: request.duration,
    width: request.width,
    height: request.height,
    ...request.selectors,
  })) {
    if (value === undefined) continue;
    const aliases = ALIASES.find((group) =>
      group.some((field) => field === key),
    );
    const target = Object.hasOwn(properties, key)
      ? key
      : aliases?.find((field) => Object.hasOwn(properties, field));
    if (target && input[target] === undefined) input[target] = value;
  }
  for (const [key, property] of Object.entries(properties)) {
    if (isRecord(property) && input[key] === undefined) {
      if (property.const !== undefined) input[key] = property.const;
      else if (property.default !== undefined) input[key] = property.default;
    }
  }
  try {
    const result = z.fromJSONSchema(schema).safeParse(input);
    return result.success && isRecord(result.data) ? result.data : null;
  } catch {
    return null;
  }
}
