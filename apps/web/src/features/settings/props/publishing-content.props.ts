import type { AccountPublishingContext } from '@genfeedai/contracts/interfaces';

export type PublishingConfig = {
  autoPublish?: {
    confidenceThreshold?: number;
    enabled?: boolean;
    /** Expert Path publish approval gate. Read-only display state here. */
    isApprovalRequired?: boolean;
  };
  schedule?: {
    cronExpression?: string;
    enabled?: boolean;
    timezone?: string;
  };
};

export type FormState = {
  cronExpression: string;
  /** True once the user changed a field since the form was last seeded. */
  hasEdits: boolean;
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
  | { type: 'SET_SAVING'; value: boolean }
  | { type: 'MARK_SAVED' };

/** Publishing readiness of a brand's connected accounts. */
export type PublishingReadinessSnapshot = {
  contexts: AccountPublishingContext[];
  /** Connected accounts whose readiness could not be read. */
  failedCredentialIds: string[];
};
