/**
 * Interface for JSON:API serializers used in BaseCRUDController and response utils.
 * Matches the shape produced by `getSerializer()` from @genfeedai/helpers (ts-jsonapi).
 *
 * Named IJsonApiSerializer to avoid conflict with the frontend ISerializer in api.interface.ts.
 */
export interface IJsonApiSerializer {
  opts?: Record<string, unknown>;
  serialize(data: unknown): unknown;
}
