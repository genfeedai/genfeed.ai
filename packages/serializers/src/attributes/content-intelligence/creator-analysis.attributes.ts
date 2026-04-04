import { createEntityAttributes } from '@genfeedai/helpers';

export const creatorAnalysisAttributes = createEntityAttributes([
  'organization',
  'createdBy',
  'platform',
  'handle',
  'displayName',
  'avatarUrl',
  'profileUrl',
  'bio',
  'followerCount',
  'followingCount',
  'status',
  'lastScrapedAt',
  'postsScraped',
  'patternsExtracted',
  'scrapeConfig',
  'metrics',
  'errorMessage',
  'tags',
  'niche',
]);
