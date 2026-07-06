export type AnalyticsQueueJob<TData> = {
  data: TData;
  updateProgress(progress: number): Promise<void>;
};
