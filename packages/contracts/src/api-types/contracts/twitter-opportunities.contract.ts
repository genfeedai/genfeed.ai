/**
 * Schema-enforced shape of the Twitter pipeline's opportunity picker (#4873).
 *
 * `tweetIndex` is the 1-based position in the prompt's tweet list; the
 * pipeline resolves it against the real search results, which is why an
 * `original` idea leaves it null instead of pointing at tweet 0.
 */

import { z } from 'zod';

export const twitterOpportunityKindValues = [
  'reply',
  'quote',
  'original',
] as const;

export const twitterOpportunitySchema = z.object({
  reason: z.string().min(1),
  suggestedText: z.string().min(1),
  tweetIndex: z.number().int().min(1).nullish(),
  type: z.enum(twitterOpportunityKindValues),
});

export const twitterOpportunitiesSchema = z.object({
  opportunities: z.array(twitterOpportunitySchema),
});

export type TwitterOpportunityKind =
  (typeof twitterOpportunityKindValues)[number];
export type TwitterOpportunities = z.infer<typeof twitterOpportunitiesSchema>;

export const TWITTER_OPPORTUNITIES_SCHEMA_NAME = 'twitter_opportunities';
