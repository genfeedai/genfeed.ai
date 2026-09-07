export type PublishingConfig = {
  autoPublish?: {
    confidenceThreshold?: number;
    enabled?: boolean;
  };
  schedule?: {
    cronExpression?: string;
    enabled?: boolean;
    timezone?: string;
  };
};

export type FormState = {
  cronExpression: string;
  timezone: string;
  isScheduleEnabled: boolean;
  isAutoPublishEnabled: boolean;
  confidenceThreshold: string;
  isSaving: boolean;
};

export type FormAction =
  | { type: 'RESET'; config: PublishingConfig | undefined }
  | { type: 'SET_CRON'; value: string }
  | { type: 'SET_TIMEZONE'; value: string }
  | { type: 'SET_SCHEDULE_ENABLED'; value: boolean }
  | { type: 'SET_AUTO_PUBLISH_ENABLED'; value: boolean }
  | { type: 'SET_CONFIDENCE_THRESHOLD'; value: string }
  | { type: 'SET_SAVING'; value: boolean };
