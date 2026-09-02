export type {
  IRssFeedItemDocument as RssFeedItemDocument,
  IRssSourceDocument as RssSourceDocument,
  IRssTargetChannel as RssTargetChannel,
} from '@genfeedai/interfaces';

export type RssSourceScope = {
  brandId?: string;
  organizationId: string;
  userId: string;
};
