import type {
  CredentialDocument,
  IPublisher,
  PublishContext,
} from '@api/index';
import type { RecordActivityInput } from '@api/services/activity-recording/activity-recording.types';
import type { Platform } from '@genfeedai/contracts';

export type PostDeliveryIds = {
  brandId: string | undefined;
  credentialId: string | undefined;
  organizationId: string | undefined;
  userId: string | undefined;
};

export type PreparedPostDelivery = {
  context: PublishContext;
  credential: CredentialDocument;
  platform: Platform;
  publisher: IPublisher;
};

/** A terminal pre-provider failure; the delivery records it as FAILED. */
export type DeliveryGateFailure = {
  activity?: RecordActivityInput;
  code: string;
  isRetryable: boolean;
  message: string;
  platform: string;
};

export type DeliveryLoad<T> =
  | { ok: true; value: T }
  | { ok: false; failure: DeliveryGateFailure };
