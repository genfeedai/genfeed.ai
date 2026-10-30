export type MessagesSyncJob = {
  platform: string;
  run: () => Promise<unknown>;
};

export type MessagesSyncOutcome = {
  failedPlatforms: string[];
  hasSuccess: boolean;
};

export type MessagesSyncFeedback = {
  error: string | null;
  notice: string | null;
};
