import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import { normalizeJsonApiRelationshipGraph } from '@genfeedai/helpers/data/json-api/relationship.helper';

export type { JsonApiResponseDocument };
export { deserializeCollection, deserializeResource };

export function extractResource<T>(document: JsonApiResponseDocument): T {
  return normalizeJsonApiRelationshipGraph(deserializeResource<T>(document));
}

export function extractCollection<T>(document: JsonApiResponseDocument): T[] {
  return normalizeJsonApiRelationshipGraph(deserializeCollection<T>(document));
}
