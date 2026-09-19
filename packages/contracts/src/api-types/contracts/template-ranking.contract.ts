/**
 * Schema-enforced shape of AI template ranking (#4873).
 *
 * `index` points into the numbered list the prompt sent, so it must be a
 * non-negative integer — a ranking that named a template by prose used to
 * resolve to `templates[undefined]` and ship an entry with no template on it.
 */

import { z } from 'zod';

export const templateRankingSchema = z.object({
  rankings: z.array(
    z.object({
      index: z.number().int().min(0),
      reasons: z.array(z.string()),
      score: z.number().min(0).max(100),
    }),
  ),
});

export type TemplateRanking = z.infer<typeof templateRankingSchema>;

export const TEMPLATE_RANKING_SCHEMA_NAME = 'template_ranking';
