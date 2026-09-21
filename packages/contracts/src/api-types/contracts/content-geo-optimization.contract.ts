/**
 * Schema-enforced shape of the GEO (generative engine optimization) rewrite
 * (#4873).
 *
 * The rewrite is the deliverable; the suggestions are merged with the
 * deterministic scorecard's own. Both used to be read out of the first brace
 * run in the completion.
 */

import { z } from 'zod';

export const contentGeoOptimizationSchema = z.object({
  rewrittenContent: z.string().min(1),
  suggestions: z.array(z.string()),
});

export type ContentGeoOptimization = z.infer<
  typeof contentGeoOptimizationSchema
>;

export const CONTENT_GEO_OPTIMIZATION_SCHEMA_NAME = 'content_geo_optimization';
