/**
 * Named input for lowest-cost vs cloud-quality model default selection.
 *
 * Cloud production (`isCloud` + `nodeEnv === 'production'`) keeps quality
 * defaults. Every other combination — local, self-hosted, e2e, cloud staging,
 * and an unset `NODE_ENV` — uses the lowest-cost keys.
 */
export interface LowestCostModelDefaultsInput {
  isCloud: boolean;
  nodeEnv?: string;
}
