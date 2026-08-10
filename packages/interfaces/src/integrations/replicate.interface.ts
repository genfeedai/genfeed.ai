/**
 * A prediction as returned by `GET /v1/predictions/{id}`.
 *
 * Only `id` is guaranteed. Consumers must narrow every other vendor field
 * before trusting it.
 */
export interface ReplicatePredictionRecord {
  id: string;
  status?: unknown;
  output?: unknown;
  error?: unknown;
  version?: unknown;
}
