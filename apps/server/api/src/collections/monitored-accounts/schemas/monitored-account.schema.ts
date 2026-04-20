export type {
  MonitoredAccount,
  MonitoredAccount as MonitoredAccountDocument,
} from '@genfeedai/prisma';

export type MonitoredAccountFilters = {
  keywords?: {
    include: string[];
    exclude: string[];
  };
  hashtags?: {
    include: string[];
    exclude: string[];
  };
  mediaType?: string;
  minEngagement?: {
    minRetweets: number;
    minLikes: number;
    minReplies: number;
  };
};
