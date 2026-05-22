import {
  deserializeCollection as deserializeJsonApiCollection,
  deserializeResource as deserializeJsonApiResource,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import { normalizeJsonApiRelationshipGraph } from '@genfeedai/helpers/data/json-api/relationship.helper';

export type { JsonApiResponseDocument };

export function deserializeResource<T>(document: JsonApiResponseDocument): T {
  return deserializeJsonApiResource<T>(document);
}

export function deserializeCollection<T>(
  document: JsonApiResponseDocument,
): T[] {
  return deserializeJsonApiCollection<T>(document);
}

export function extractResource<T>(document: JsonApiResponseDocument): T {
  return normalizeJsonApiRelationshipGraph(deserializeResource<T>(document));
}

export function extractCollection<T>(document: JsonApiResponseDocument): T[] {
  return normalizeJsonApiRelationshipGraph(deserializeCollection<T>(document));
}
