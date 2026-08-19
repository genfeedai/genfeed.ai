import {
  toIdString,
  toSerializableDocument,
} from '@serializers/helpers/serializable-document.helper';

export interface CreatorAnalysisAttributes {
  avatarUrl: unknown;
  bio: unknown;
  displayName: unknown;
  errorMessage: unknown;
  followerCount: unknown;
  followingCount: unknown;
  handle: unknown;
  lastScrapedAt: unknown;
  metrics: unknown;
  niche: unknown;
  patternsExtracted: unknown;
  platform: unknown;
  postsScraped: unknown;
  profileUrl: unknown;
  scrapeConfig: unknown;
  status: unknown;
  tags: unknown;
}

export interface CreatorAnalysisResource {
  attributes: CreatorAnalysisAttributes;
  id?: string;
  type: 'creator-analysis';
}

/**
 * Creator analyses are normalized onto the document by the API service.
 * `buildSerializer` would wrap a JSON:API document and add timestamps, so this
 * keeps the current `{ type, id, attributes }` resource-object wire format.
 */
export const CreatorAnalysisSerializer = {
  serialize(data: unknown): CreatorAnalysisResource | null {
    if (!data) {
      return null;
    }

    const doc = toSerializableDocument(data);

    return {
      attributes: {
        avatarUrl: doc.avatarUrl,
        bio: doc.bio,
        displayName: doc.displayName,
        errorMessage: doc.errorMessage,
        followerCount: doc.followerCount,
        followingCount: doc.followingCount,
        handle: doc.handle,
        lastScrapedAt: doc.lastScrapedAt,
        metrics: doc.metrics,
        niche: doc.niche,
        patternsExtracted: doc.patternsExtracted,
        platform: doc.platform,
        postsScraped: doc.postsScraped,
        profileUrl: doc.profileUrl,
        scrapeConfig: doc.scrapeConfig,
        status: doc.status,
        tags: doc.tags,
      },
      id: toIdString(doc.id),
      type: 'creator-analysis',
    };
  },
};
