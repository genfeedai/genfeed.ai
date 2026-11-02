import {
  type BrandRemixRunView,
  brandRemixRunViewSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import {
  type StoryboardRun,
  storyboardRunSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

/** Names what arrived, so a bad response can be told apart from a bad request. */
function describeStoryboardDocument(document: unknown): string {
  if (typeof document !== 'object' || document === null)
    return document === '' ? 'an empty body' : `a ${typeof document} body`;
  const primary = (document as JsonApiResponseDocument).data;
  if (Array.isArray(primary)) return `a list of ${primary.length} resources`;
  if (!primary) return 'a document without data';
  if (!primary.attributes)
    return `a ${primary.type} resource without attributes`;
  return `a ${primary.type} resource without config`;
}

export function deserializeStoryboardRunDocument(
  document: JsonApiResponseDocument,
): StoryboardRun {
  const primary = document?.data;
  if (
    !primary ||
    Array.isArray(primary) ||
    !primary.attributes ||
    !Object.hasOwn(primary.attributes, 'config')
  )
    throw new TypeError(
      `Invalid Storyboard document: expected one resource with config, received ${describeStoryboardDocument(document)}`,
    );
  const { config, ...attributes } = primary.attributes;
  const envelope: JsonApiResponseDocument = {
    ...document,
    data: { ...primary, attributes },
  };
  delete envelope.included;
  if (envelope.data && !Array.isArray(envelope.data))
    delete envelope.data.relationships;
  const normalized = deserializeResource<Record<string, unknown>>(envelope);
  return storyboardRunSchema.parse({ ...normalized, config });
}

export function deserializeLegacyStoryboardRunDocument(
  document: JsonApiResponseDocument,
): BrandRemixRunView {
  const primary = document.data;
  if (!primary || Array.isArray(primary) || !primary.attributes)
    return brandRemixRunViewSchema.parse(deserializeResource(document));
  const { scenePipeline, ...attributes } = primary.attributes;
  if (Object.hasOwn(attributes, 'scene_pipeline'))
    throw new TypeError(
      'Invalid legacy Storyboard document: scenePipeline must use canonical spelling',
    );
  const envelope = { ...document, data: { ...primary, attributes } };
  const normalized = deserializeResource<Record<string, unknown>>(envelope);
  return brandRemixRunViewSchema.parse({
    ...normalized,
    ...(Object.hasOwn(primary.attributes, 'scenePipeline')
      ? { scenePipeline }
      : {}),
  });
}
